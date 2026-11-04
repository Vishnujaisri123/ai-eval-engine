import os
import time
from typing import Dict, Any, Optional
import httpx


class LLMResponseGenerator:
    """
    Production LLM Client & Telemetry Tracker.
    Supports live generation via OpenAI-compatible APIs, local Ollama,
    or explicitly labeled deterministic mode for offline CI/CD pipelines.
    Never silently substitutes a fake response when a requested live provider fails.
    """

    # Default pricing per 1,000 tokens (USD) for cost estimation (based on standard models)
    INPUT_COST_PER_1K = 0.0005
    OUTPUT_COST_PER_1K = 0.0015

    def __init__(
        self,
        provider: str = "auto",
        model: Optional[str] = None,
        ollama_url: Optional[str] = None,
        timeout_seconds: float = 12.0,
    ):
        self.provider = (provider or os.getenv("LLM_PROVIDER", "auto")).lower()
        self.model = model or os.getenv("LLM_MODEL", "llama3")
        self.ollama_url = ollama_url or os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        self.timeout_seconds = timeout_seconds
        self.api_key = os.getenv("OPENROUTER_API_KEY") or os.getenv("OPENAI_API_KEY")
        self.base_url = os.getenv("LLM_BASE_URL")

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

    def _build_system_prompt(self, context: str, prompt: str, system_prompt: Optional[str] = None) -> str:
        if system_prompt:
            base = system_prompt.strip()
        else:
            base = (
                "You are an official AI Support Assistant. "
                "Answer the user question strictly using ONLY the provided context if provided. "
                "Do not invent specifications, features, or claims not present in the context."
            )
        parts = [base]
        if context:
            parts.append(f"Context: {context}")
        parts.append(f"Question: {prompt}")
        parts.append("Answer:")
        return "\n\n".join(parts)

    def generate(
        self,
        prompt: str,
        context: str = "",
        system_prompt: Optional[str] = None,
        temperature: float = 0.2,
        allow_offline_fallback: bool = True,
    ) -> Dict[str, Any]:
        """
        Generates an AI response from prompt + context and records latency,
        token usage, and estimated USD cost.
        Never silently substitutes simulated responses when an explicit provider fails.
        """
        full_prompt = self._build_system_prompt(context, prompt, system_prompt)
        start_time = time.perf_counter()
        used_provider = self.provider
        response_text: Optional[str] = None
        error_msg: Optional[str] = None

        # 1. Explicitly requested offline / deterministic mode
        if self.provider in ("offline", "deterministic"):
            response_text = self._simulate_grounded_rag(prompt, context)
            used_provider = "offline_deterministic"

        # 2. OpenAI-compatible API
        elif self.provider in ("openai", "openai_compatible", "openrouter"):
            if not self.api_key:
                error_msg = (
                    "Provider error: OpenAI/OpenRouter API key is missing. "
                    "Please set OPENAI_API_KEY or OPENROUTER_API_KEY in backend environment."
                )
            else:
                try:
                    response_text, err = self._call_openai_compatible(full_prompt, temperature)
                    if err:
                        error_msg = f"Provider error (OpenAI-compatible): {err}"
                    else:
                        used_provider = "openai_compatible"
                except Exception as exc:
                    error_msg = f"Provider error (OpenAI-compatible): {str(exc)}"

        # 3. Local Ollama
        elif self.provider == "ollama":
            try:
                response_text, err = self._call_ollama(full_prompt, temperature)
                if err:
                    error_msg = f"Provider error (Ollama): {err}"
                else:
                    used_provider = "ollama"
            except Exception as exc:
                error_msg = f"Provider error (Ollama): {str(exc)}"

        # 4. Auto mode: check API key first, then Ollama, then fallback only if allowed
        elif self.provider == "auto":
            if self.api_key:
                try:
                    response_text, _ = self._call_openai_compatible(full_prompt, temperature)
                    if response_text:
                        used_provider = "openai_compatible"
                except Exception:
                    pass

            if response_text is None:
                try:
                    response_text, _ = self._call_ollama(full_prompt, temperature)
                    if response_text:
                        used_provider = "ollama"
                except Exception:
                    pass

            if response_text is None:
                if allow_offline_fallback:
                    response_text = self._simulate_grounded_rag(prompt, context)
                    used_provider = "rag_simulator_fallback"
                else:
                    error_msg = (
                        "Auto provider could not reach any live AI provider. "
                        "Configure OPENAI_API_KEY/OPENROUTER_API_KEY, start Ollama locally, "
                        "or switch to offline deterministic mode."
                    )
        else:
            error_msg = f"Unknown provider '{self.provider}' requested."

        latency_ms = round((time.perf_counter() - start_time) * 1000.0, 2)
        final_text = response_text or (f"[{error_msg}]" if error_msg else "")
        prompt_tokens = self.estimate_tokens(full_prompt)
        completion_tokens = self.estimate_tokens(final_text)
        total_tokens = prompt_tokens + completion_tokens
        estimated_cost_usd = self.calculate_cost(prompt_tokens, completion_tokens)

        return {
            "actual_output": final_text,
            "provider": used_provider,
            "model": self.model,
            "error": error_msg,
            "success": error_msg is None and bool(response_text),
            "telemetry": {
                "latency_ms": latency_ms,
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": total_tokens,
                "estimated_cost_usd": estimated_cost_usd,
            },
        }

    def _call_ollama(self, full_prompt: str, temperature: float = 0.2) -> tuple[Optional[str], Optional[str]]:
        """Calls local Ollama server if running."""
        url = self.ollama_url.rstrip("/")
        if not url.endswith("/api/generate"):
            url = f"{url}/api/generate"
        try:
            with httpx.Client(timeout=self.timeout_seconds) as client:
                resp = client.post(
                    url,
                    json={
                        "model": self.model,
                        "prompt": full_prompt,
                        "stream": False,
                        "options": {"temperature": temperature},
                    },
                )
                if resp.status_code == 200:
                    data = resp.json()
                    out = data.get("response", "").strip()
                    return out, None
                return None, f"Ollama HTTP {resp.status_code}: {resp.text[:200]}"
        except httpx.ConnectError:
            return None, f"Failed to connect to Ollama at {url}. Is Ollama running?"
        except httpx.TimeoutException:
            return None, f"Ollama request timed out after {self.timeout_seconds}s."
        except Exception as exc:
            return None, str(exc)

    def _call_openai_compatible(
        self, full_prompt: str, temperature: float = 0.2
    ) -> tuple[Optional[str], Optional[str]]:
        """Calls OpenAI or OpenRouter chat completions endpoint."""
        endpoint = self.base_url
        if not endpoint:
            if os.getenv("OPENROUTER_API_KEY"):
                endpoint = "https://openrouter.ai/api/v1/chat/completions"
            else:
                endpoint = "https://api.openai.com/v1/chat/completions"

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": [{"role": "user", "content": full_prompt}],
            "temperature": temperature,
        }
        try:
            with httpx.Client(timeout=self.timeout_seconds) as client:
                resp = client.post(endpoint, headers=headers, json=payload)
                if resp.status_code == 200:
                    data = resp.json()
                    choices = data.get("choices", [])
                    if choices and "message" in choices[0]:
                        return choices[0]["message"].get("content", "").strip(), None
                    return None, "No text completion choices in response."
                return None, f"HTTP {resp.status_code}: {resp.text[:200]}"
        except httpx.TimeoutException:
            return None, f"OpenAI-compatible request timed out after {self.timeout_seconds}s."
        except Exception as exc:
            return None, str(exc)

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
        return context or "Grounded response placeholder."
