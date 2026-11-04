import os
import time
from typing import Dict, Any, Optional
import httpx


class LLMResponseGenerator:
    """
    Production LLM Client & Telemetry Tracker.
    Supports live generation via local Ollama, OpenAI/OpenRouter APIs,
    or deterministic RAG simulation for offline CI/CD pipelines.
    """

    # Default pricing per 1,000 tokens (USD) for cost estimation
    INPUT_COST_PER_1K = 0.0005
    OUTPUT_COST_PER_1K = 0.0015

    def __init__(
        self,
        provider: str = "auto",
        model: str = "llama3",
        ollama_url: str = "http://localhost:11434/api/generate",
        timeout_seconds: float = 10.0,
    ):
        self.provider = provider
        self.model = model
        self.ollama_url = ollama_url
        self.timeout_seconds = timeout_seconds
        self.api_key = os.getenv("OPENROUTER_API_KEY") or os.getenv("OPENAI_API_KEY")

    @staticmethod
    def estimate_tokens(text: str) -> int:
        """Approximates LLM subword token count (~1.3 tokens per whitespace word)."""
        if not text:
            return 0
        words = len(text.split())
        return max(1, int(round(words * 1.3)))

    @classmethod
    def calculate_cost(cls, prompt_tokens: int, completion_tokens: int) -> float:
        """Calculates estimated API cost in USD."""
        cost = (
            (prompt_tokens / 1000.0) * cls.INPUT_COST_PER_1K
            + (completion_tokens / 1000.0) * cls.OUTPUT_COST_PER_1K
        )
        return round(cost, 6)

    def _build_system_prompt(self, context: str, prompt: str) -> str:
        return (
            "You are an official Atomberg Smart Appliances AI Support Assistant. "
            "Answer the user question strictly using ONLY the provided context. "
            "Do not invent specifications, wattage, or features not in the context.\n\n"
            f"Context: {context}\n"
            f"Question: {prompt}\n"
            "Answer:"
        )

    def generate(self, prompt: str, context: str) -> Dict[str, Any]:
        """
        Generates an AI response from prompt + context and records latency,
        token usage, and estimated USD cost.
        """
        full_prompt = self._build_system_prompt(context, prompt)
        start_time = time.perf_counter()
        used_provider = self.provider
        response_text: Optional[str] = None

        # 1. Try OpenAI / OpenRouter if requested or auto-detected with key
        if self.provider in ("auto", "openai") and self.api_key:
            response_text = self._call_openai_compatible(full_prompt)
            if response_text:
                used_provider = "openai_compatible"

        # 2. Try Local Ollama if requested or auto-detected
        if response_text is None and self.provider in ("auto", "ollama"):
            response_text = self._call_ollama(full_prompt)
            if response_text:
                used_provider = "ollama"

        # 3. Deterministic CI/CD Fallback (synthesizes grounded response from context)
        if response_text is None:
            response_text = self._simulate_grounded_rag(prompt, context)
            used_provider = "rag_simulator_fallback"

        latency_ms = round((time.perf_counter() - start_time) * 1000.0, 2)
        prompt_tokens = self.estimate_tokens(full_prompt)
        completion_tokens = self.estimate_tokens(response_text)
        total_tokens = prompt_tokens + completion_tokens
        estimated_cost_usd = self.calculate_cost(prompt_tokens, completion_tokens)

        return {
            "actual_output": response_text,
            "provider": used_provider,
            "model": self.model,
            "telemetry": {
                "latency_ms": latency_ms,
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": total_tokens,
                "estimated_cost_usd": estimated_cost_usd,
            },
        }

    def _call_ollama(self, full_prompt: str) -> Optional[str]:
        """Calls local Ollama server if running on localhost:11434."""
        try:
            with httpx.Client(timeout=1.5) as client:
                resp = client.post(
                    self.ollama_url,
                    json={"model": self.model, "prompt": full_prompt, "stream": False},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    return data.get("response", "").strip()
        except Exception:
            return None
        return None

    def _call_openai_compatible(self, full_prompt: str) -> Optional[str]:
        """Calls OpenRouter or OpenAI chat completions endpoint."""
        base_url = os.getenv("LLM_BASE_URL", "https://openrouter.ai/api/v1/chat/completions")
        try:
            with httpx.Client(timeout=self.timeout_seconds) as client:
                resp = client.post(
                    base_url,
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json={
                        "model": self.model,
                        "messages": [{"role": "user", "content": full_prompt}],
                        "temperature": 0.2,
                    },
                )
                if resp.status_code == 200:
                    data = resp.json()
                    return data["choices"][0]["message"]["content"].strip()
        except Exception:
            return None
        return None

    @staticmethod
    def _simulate_grounded_rag(prompt: str, context: str) -> str:
        """
        Synthesizes a grounded response strictly from the context for deterministic
        CI/CD testing when no external LLM server is reachable.
        """
        prompt_lower = prompt.lower()
        context_lower = context.lower()
        if prompt_lower.startswith(("does", "can", "is")):
            if "does not" in context_lower or "no " in context_lower:
                return f"No. {context}"
            return f"Yes. {context}"
        return context