import json
import time
from pathlib import Path
from typing import Dict, Any, List, Optional, Union

from app.generator import LLMResponseGenerator
from app.judge import calculate_semantic_similarity, LLMJudgeEvaluator
from app.metrics import (
    calculate_accuracy,
    calculate_relevance,
    calculate_groundedness,
    calculate_instruction_following,
    calculate_token_f1,
    evaluate_hallucination_risk,
)

BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DATASET_PATH = BASE_DIR / "datasets" / "golden_dataset.json"


class AIQualityEvaluator:
    """
    Production-grade OOP Evaluation Engine that scores AI responses on:
    - Deterministic Accuracy, Relevance, and Groundedness
    - Multi-signal Hallucination Diagnostics (negation + numeric integrity)
    - Semantic Similarity (paraphrase recognition)
    - Instruction Following (negative constraints + formatting)
    - LLM-as-a-Judge / RAG Triad Faithfulness
    - Telemetry (Latency, Token Counts, API Cost, Evaluation Duration)
    """

    def __init__(
        self,
        pass_threshold: float = 0.70,
        groundedness_threshold: float = 0.60,
        generator: Optional[LLMResponseGenerator] = None,
    ):
        self.pass_threshold = pass_threshold
        self.groundedness_threshold = groundedness_threshold
        self.generator = generator or LLMResponseGenerator()
        self.judge = LLMJudgeEvaluator(generator=self.generator)

    def evaluate_case(
        self, test_case: Dict[str, Any], use_live_generator: bool = False
    ) -> Dict[str, Any]:
        """
        Evaluates a single test case. If use_live_generator=True or actual_output
        is missing, generates a live response via LLMResponseGenerator first.
        """
        eval_start = time.perf_counter()

        case_id = test_case.get("id", "CUSTOM")
        category = test_case.get("category", "general")
        prompt = test_case.get("prompt", "")
        system_instructions = test_case.get("system_instructions", "")
        context = test_case.get("context", "")
        expected_output = test_case.get("expected_output", "")
        expected_keywords = test_case.get("expected_keywords", [])
        actual_output = test_case.get("actual_output", "")

        # 1. Generate live AI response if requested or if actual_output is empty
        if use_live_generator or not actual_output.strip():
            gen_result = self.generator.generate(
                prompt=prompt,
                context=context,
                system_prompt=system_instructions,
            )
            actual_output = gen_result["actual_output"]
            telemetry = gen_result["telemetry"]
            provider = gen_result["provider"]
        else:
            prompt_tokens = self.generator.estimate_tokens(f"{context} {prompt}")
            completion_tokens = self.generator.estimate_tokens(actual_output)
            telemetry = {
                "latency_ms": float(test_case.get("latency_ms", 0.0)),
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": prompt_tokens + completion_tokens,
                "estimated_cost_usd": self.generator.calculate_cost(
                    prompt_tokens, completion_tokens
                ),
            }
            provider = "stored_dataset"

        # 1.5 Semantic similarity & LLM-as-a-Judge scoring
        semantic_sim = calculate_semantic_similarity(expected_output or context, actual_output)
        judge_verdict = self.judge.evaluate_with_judge(
            prompt=prompt,
            context=context,
            actual_output=actual_output,
            system_instructions=system_instructions,
            expected_output=expected_output,
            threshold=self.pass_threshold,
        )

        # 2. Compute deterministic quality metrics
        accuracy = calculate_accuracy(actual_output, expected_keywords)
        relevance = calculate_relevance(prompt, expected_output, actual_output)
        groundedness = calculate_groundedness(context, actual_output, expected_output)
        instr_eval = calculate_instruction_following(system_instructions, actual_output)
        token_f1 = calculate_token_f1(expected_output, actual_output)

        # 3. Multi-signal hallucination analysis
        hallucination_info = evaluate_hallucination_risk(
            context=context,
            expected_output=expected_output,
            actual_output=actual_output,
            groundedness_score=groundedness,
            threshold=self.groundedness_threshold,
        )
        hallucinated = (
            hallucination_info["hallucination_detected"]
            or judge_verdict.get("hallucination_verdict") == "critical"
        )

        # 4. Overall quality score & pass/fail gate
        # Preserving original 4-term average for backwards compatibility
        overall_score = round(
            (accuracy + relevance + groundedness + semantic_sim) / 4.0, 2
        )
        passed = (overall_score >= self.pass_threshold) and (not hallucinated)

        eval_duration_ms = round((time.perf_counter() - eval_start) * 1000.0, 2)
        telemetry["eval_duration_ms"] = eval_duration_ms

        return {
            "id": case_id,
            "category": category,
            "provider": provider,
            "prompt": prompt,
            "actual_output": actual_output,
            "metrics": {
                "accuracy": accuracy,
                "relevance": relevance,
                "groundedness": groundedness,
                "semantic_similarity": semantic_sim,
                "instruction_following": instr_eval["score"],
                "token_f1": token_f1,
                "judge_faithfulness": judge_verdict["faithfulness_score"],
                "overall_score": overall_score,
            },
            "judge_verdict": judge_verdict,
            "performance": telemetry,
            "hallucination_detected": hallucinated,
            "hallucination_reasons": hallucination_info["hallucination_reasons"],
            "instruction_violations": instr_eval["violations"],
            "passed": passed,
        }

    def _resolve_path(self, dataset_path: Optional[Union[str, Path]]) -> Path:
        if dataset_path is None:
            return DEFAULT_DATASET_PATH
        path = Path(dataset_path)
        if not path.is_absolute() and not path.exists():
            path = BASE_DIR / path
        return path

    def load_dataset(
        self, dataset_path: Optional[Union[str, Path]] = None
    ) -> List[Dict[str, Any]]:
        path = self._resolve_path(dataset_path)
        if not path.exists():
            raise FileNotFoundError(f"Golden dataset not found at: {path.resolve()}")

        with open(path, "r", encoding="utf-8") as file:
            return json.load(file)

    def evaluate_dataset(
        self,
        dataset_path: Optional[Union[str, Path]] = None,
        use_live_generator: bool = False,
    ) -> Dict[str, Any]:
        """Runs evaluation across the Golden Dataset and computes quality + performance summary."""
        batch_start = time.perf_counter()
        dataset = self.load_dataset(dataset_path)
        results = [
            self.evaluate_case(case, use_live_generator=use_live_generator)
            for case in dataset
        ]
        total_duration_ms = round((time.perf_counter() - batch_start) * 1000.0, 2)

        total_cases = len(results)
        passed_cases = sum(1 for r in results if r["passed"])
        failed_cases = total_cases - passed_cases
        hallucination_count = sum(1 for r in results if r["hallucination_detected"])

        avg_score = (
            round(sum(r["metrics"]["overall_score"] for r in results) / total_cases, 2)
            if total_cases > 0
            else 0.0
        )
        total_tokens = sum(r["performance"]["total_tokens"] for r in results)
        total_cost_usd = round(
            sum(r["performance"]["estimated_cost_usd"] for r in results), 6
        )
        avg_latency_ms = (
            round(
                sum(r["performance"]["latency_ms"] for r in results) / total_cases, 2
            )
            if total_cases > 0
            else 0.0
        )
        pass_rate = (
            round((passed_cases / total_cases) * 100.0, 1) if total_cases > 0 else 0.0
        )

        return {
            "summary": {
                "total_cases": total_cases,
                "passed_cases": passed_cases,
                "failed_cases": failed_cases,
                "pass_rate": pass_rate,
                "average_quality_score": avg_score,
                "hallucinations_detected": hallucination_count,
                "total_tokens_consumed": total_tokens,
                "total_cost_usd": total_cost_usd,
                "average_latency_ms": avg_latency_ms,
                "evaluation_duration_ms": total_duration_ms,
            },
            "results": results,
        }
