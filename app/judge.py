import json
import math
import os
import re
from typing import Dict, Any, List, Optional, Set
from pydantic import BaseModel, Field, ValidationError

from app.generator import LLMResponseGenerator

# Domain semantic synonym map for smart appliances
SYNONYM_MAP: Dict[str, str] = {
    "watts": "w",
    "watt": "w",
    "percent": "%",
    "percentage": "%",
    "power": "energy",
    "electricity": "energy",
    "consumes": "uses",
    "utilizes": "uses",
    "draws": "uses",
    "saves": "reduces",
    "reducing": "reduces",
    "reduction": "reduces",
    "top": "max",
    "maximum": "max",
    "speed": "velocity",
}


def normalize_semantic_tokens(text: str) -> List[str]:
    """Tokenizes text and normalizes domain synonyms and variations."""
    raw_tokens = re.findall(r"[a-z0-9%]+", text.lower())
    normalized = []
    for token in raw_tokens:
        m = re.match(r"^(\d+)([a-z%]+)$", token)
        if m:
            num, unit = m.groups()
            normalized.append(num)
            normalized.append(SYNONYM_MAP.get(unit, unit))
        else:
            normalized.append(SYNONYM_MAP.get(token, token))
    return normalized


def calculate_semantic_similarity(text_a: str, text_b: str) -> float:
    """
    Computes hybrid cosine semantic similarity using normalized domain tokens.
    Correctly recognizes paraphrased technical claims.
    Note: Semantic similarity measures vocabulary and phrasing alignment;
    it does NOT constitute absolute proof of factual ground truth.
    """
    tokens_a = normalize_semantic_tokens(text_a)
    tokens_b = normalize_semantic_tokens(text_b)

    if not tokens_a or not tokens_b:
        return 0.0

    vocab: Set[str] = set(tokens_a) | set(tokens_b)

    vec_a = {w: tokens_a.count(w) for w in vocab}
    vec_b = {w: tokens_b.count(w) for w in vocab}

    dot_product = sum(vec_a[w] * vec_b[w] for w in vocab)
    mag_a = math.sqrt(sum(v * v for v in vec_a.values()))
    mag_b = math.sqrt(sum(v * v for v in vec_b.values()))

    if mag_a == 0 or mag_b == 0:
        return 0.0

    cosine = dot_product / (mag_a * mag_b)
    return round(max(0.0, min(cosine, 1.0)), 2)


class JudgeVerdictSchema(BaseModel):
    """Pydantic schema to validate LLM Judge structured output."""
    faithfulness_score: float = Field(default=1.0, ge=0.0, le=1.0)
    relevance_score: float = Field(default=1.0, ge=0.0, le=1.0)
    instruction_following_score: float = Field(default=1.0, ge=0.0, le=1.0)
    overall_judge_score: float = Field(default=1.0, ge=0.0, le=1.0)
    hallucination_verdict: str = Field(default="none")  # none, minor, critical
    passed: bool = True
    explanation: str = Field(default="")
    evidence_summary: str = Field(default="")
    detected_issues: List[str] = Field(default_factory=list)


class LLMJudgeEvaluator:
    """
    LLM-as-a-Judge Evaluation Engine following the DeepEval / RAG Triad standard.
    Scores Answer Relevance, Faithfulness, and Instruction Following with structured diagnostics.
    Validates outputs against a strict Pydantic schema and handles malformed outputs cleanly.
    Supports first-class judge execution via Gemini, Groq, OpenAI, OpenRouter, or Ollama.
    Transparently distinguishes heuristic checks from LLM-judge assessments.
    """

    def __init__(self, generator: Optional[LLMResponseGenerator] = None):
        judge_provider = os.getenv("JUDGE_PROVIDER")
        judge_model = os.getenv("JUDGE_MODEL")
        judge_api_key = os.getenv("JUDGE_API_KEY")

        if judge_provider:
            jp = judge_provider.strip().lower()
            # Resolve fallback API key for judge if JUDGE_API_KEY is not explicitly set
            resolved_key = judge_api_key
            if not resolved_key:
                if jp == "gemini":
                    resolved_key = os.getenv("GEMINI_API_KEY")
                elif jp == "groq":
                    resolved_key = os.getenv("GROQ_API_KEY")
                elif jp in ("openai", "openai_compatible"):
                    resolved_key = os.getenv("OPENAI_API_KEY")
                elif jp == "openrouter":
                    resolved_key = os.getenv("OPENROUTER_API_KEY")

            self.generator = LLMResponseGenerator(
                provider=jp,
                model=judge_model,
                api_key=resolved_key,
            )
        else:
            self.generator = generator or LLMResponseGenerator()

    def evaluate_with_judge(
        self,
        prompt: str,
        context: str,
        actual_output: str,
        system_instructions: str = "",
        expected_output: str = "",
        threshold: float = 0.70,
    ) -> Dict[str, Any]:
        semantic_sim = calculate_semantic_similarity(context or expected_output, actual_output)

        judge_prompt = (
            "You are an expert AI Quality Judge evaluating an AI Assistant's response.\n"
            "Analyze the response strictly against the context, instructions, and prompt.\n"
            "Return ONLY a valid JSON object with no markdown formatting.\n\n"
            f"Context: {context}\n"
            f"Instructions: {system_instructions}\n"
            f"Question: {prompt}\n"
            f"AI Response: {actual_output}\n\n"
            "JSON structure required:\n"
            "{\n"
            '  "faithfulness_score": <float 0.0 to 1.0>,\n'
            '  "relevance_score": <float 0.0 to 1.0>,\n'
            '  "instruction_following_score": <float 0.0 to 1.0>,\n'
            '  "overall_judge_score": <float 0.0 to 1.0>,\n'
            '  "hallucination_verdict": "none" | "minor" | "critical",\n'
            '  "passed": <boolean>,\n'
            '  "explanation": "<summary string>",\n'
            '  "evidence_summary": "<evidence string>",\n'
            '  "detected_issues": ["<issue1>", ...]\n'
            "}"
        )

        is_llm_judge = False
        parsed_verdict: Optional[JudgeVerdictSchema] = None
        judge_provider_name = "transparent_heuristic_judge"

        # If live judge provider is available (Gemini, Groq, OpenAI, OpenRouter, Ollama)
        valid_judge_providers = ("gemini", "groq", "openai", "openai_compatible", "openrouter", "ollama")
        if self.generator.provider in valid_judge_providers and (
            self.generator.api_key or self.generator.provider == "ollama"
        ):
            live_result = self.generator.generate(
                prompt=judge_prompt,
                context="",
                temperature=0.0,
                allow_offline_fallback=False,
            )
            if live_result.get("success"):
                raw_json = live_result.get("actual_output", "").strip()
                # Strip markdown code blocks if wrapped by the LLM
                clean_json = re.sub(r"^```(?:json)?\s*", "", raw_json, flags=re.IGNORECASE)
                clean_json = re.sub(r"\s*```$", "", clean_json).strip()
                # Extract outermost JSON object if additional conversational text is returned
                json_match = re.search(r"\{.*\}", clean_json, re.DOTALL)
                if json_match:
                    clean_json = json_match.group(0)

                try:
                    parsed_verdict = JudgeVerdictSchema.model_validate_json(clean_json)
                    is_llm_judge = True
                    judge_provider_name = live_result.get("provider", self.generator.provider)
                except (ValidationError, json.JSONDecodeError):
                    parsed_verdict = None

        # Deterministic Heuristic Fallback / Standard Rubric
        if parsed_verdict is None:
            actual_lower = actual_output.lower()
            context_lower = context.lower()

            # Check for fabricated specs/features
            fabricated_terms = ["speaker", "camera", "solar", "4k", "dolby"]
            found_fabrications = [
                t for t in fabricated_terms if t in actual_lower and t not in context_lower
            ]

            faithfulness = 1.0
            relevance = 1.0
            instruction_following = 1.0
            verdict = "none"
            detected_issues = []
            reasoning = "Response is grounded and relevant to the reference context."

            if found_fabrications:
                faithfulness = 0.20
                relevance = 0.40
                verdict = "critical"
                detected_issues.append(f"Fabricated features not in context: {found_fabrications}")
                reasoning = f"Critical hallucination: Fabricated features not in context: {found_fabrications}"
            elif context and semantic_sim < 0.35:
                faithfulness = 0.40
                verdict = "minor"
                detected_issues.append("Low contextual alignment with source reference")
                reasoning = "Low contextual alignment with source reference."

            overall = round((faithfulness * 0.5) + (relevance * 0.3) + (instruction_following * 0.2), 2)
            passed = overall >= threshold and verdict != "critical"

            parsed_verdict = JudgeVerdictSchema(
                faithfulness_score=faithfulness,
                relevance_score=relevance,
                instruction_following_score=instruction_following,
                overall_judge_score=overall,
                hallucination_verdict=verdict,
                passed=passed,
                explanation=reasoning,
                evidence_summary=f"Semantic similarity: {semantic_sim}, Issues: {len(detected_issues)}",
                detected_issues=detected_issues,
            )

        return {
            "semantic_similarity": semantic_sim,
            "faithfulness_score": parsed_verdict.faithfulness_score,
            "relevance_score": parsed_verdict.relevance_score,
            "instruction_following_score": parsed_verdict.instruction_following_score,
            "overall_judge_score": parsed_verdict.overall_judge_score,
            "hallucination_verdict": parsed_verdict.hallucination_verdict,
            "judge_reasoning": parsed_verdict.explanation,
            "judge_provider": judge_provider_name,
            "is_llm_judge": is_llm_judge,
            "detected_issues": parsed_verdict.detected_issues,
            "evidence_summary": parsed_verdict.evidence_summary,
            "judge_passed": parsed_verdict.passed,
        }
