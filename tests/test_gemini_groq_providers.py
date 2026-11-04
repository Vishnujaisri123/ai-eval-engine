import json
import pytest
from unittest.mock import patch, MagicMock
import httpx

from app.generator import LLMResponseGenerator
from app.judge import LLMJudgeEvaluator
from app.api import app
from starlette.testclient import TestClient


@pytest.fixture
def test_client():
    return TestClient(app)


def test_gemini_provider_success(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-gemini-key")
    monkeypatch.setenv("GEMINI_MODEL", "gemini-3.8-flash")

    generator = LLMResponseGenerator(provider="gemini")

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "choices": [
            {"message": {"role": "assistant", "content": "The fan consumes 28W at speed 5."}}
        ],
        "usage": {
            "prompt_tokens": 42,
            "completion_tokens": 10,
            "total_tokens": 52,
        },
    }

    with patch("httpx.Client.post", return_value=mock_response) as mock_post:
        result = generator.generate(
            prompt="What is the power consumption?",
            context="The fan consumes 28W at speed 5.",
            system_prompt="Answer factually.",
        )

        assert result["success"] is True
        assert result["provider"] == "gemini"
        assert result["model"] == "gemini-3.8-flash"
        assert result["actual_output"] == "The fan consumes 28W at speed 5."
        assert result["telemetry"]["prompt_tokens"] == 42
        assert result["telemetry"]["completion_tokens"] == 10
        assert result["telemetry"]["total_tokens"] == 52
        assert result["telemetry"]["usage_source"] == "provider"
        assert result["telemetry"]["estimated_cost_usd"] > 0

        # Verify endpoint and headers
        mock_post.assert_called_once()
        args, kwargs = mock_post.call_args
        assert args[0] == "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
        assert kwargs["headers"]["Authorization"] == "Bearer test-gemini-key"
        # Verify message segregation
        messages = kwargs["json"]["messages"]
        assert len(messages) == 2
        assert messages[0]["role"] == "system"
        assert "[REFERENCE CONTEXT" in messages[0]["content"]
        assert messages[1]["role"] == "user"
        assert messages[1]["content"] == "What is the power consumption?"


def test_gemini_missing_api_key(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    generator = LLMResponseGenerator(provider="gemini")

    result = generator.generate(
        prompt="Test question",
        allow_offline_fallback=False,
    )

    assert result["success"] is False
    assert result["provider"] == "gemini"
    assert "GEMINI_API_KEY" in result["error"]
    assert "[Provider error:" in result["actual_output"]


def test_gemini_http_error(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "invalid-key")
    generator = LLMResponseGenerator(provider="gemini")

    mock_response = MagicMock()
    mock_response.status_code = 401
    mock_response.text = '{"error": {"message": "API key not valid"}}'

    with patch("httpx.Client.post", return_value=mock_response):
        result = generator.generate(prompt="Hello", allow_offline_fallback=False)

        assert result["success"] is False
        assert result["provider"] == "gemini"
        assert "HTTP 401" in result["error"]


def test_groq_provider_success(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test-groq-key")
    monkeypatch.setenv("GROQ_MODEL", "openai/gpt-oss-20b")

    generator = LLMResponseGenerator(provider="groq")

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "choices": [
            {"message": {"role": "assistant", "content": "BLDC motor saves 65% power."}}
        ],
        "usage": {
            "prompt_tokens": 30,
            "completion_tokens": 8,
            "total_tokens": 38,
        },
    }

    with patch("httpx.Client.post", return_value=mock_response) as mock_post:
        result = generator.generate(prompt="What motor is used?", context="BLDC motor.")

        assert result["success"] is True
        assert result["provider"] == "groq"
        assert result["model"] == "openai/gpt-oss-20b"
        assert result["actual_output"] == "BLDC motor saves 65% power."
        assert result["telemetry"]["usage_source"] == "provider"
        assert result["telemetry"]["total_tokens"] == 38

        args, kwargs = mock_post.call_args
        assert args[0] == "https://api.groq.com/openai/v1/chat/completions"
        assert kwargs["headers"]["Authorization"] == "Bearer test-groq-key"


def test_groq_missing_api_key(monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    generator = LLMResponseGenerator(provider="groq")

    result = generator.generate(
        prompt="Test question",
        allow_offline_fallback=False,
    )

    assert result["success"] is False
    assert result["provider"] == "groq"
    assert "GROQ_API_KEY" in result["error"]


def test_auto_provider_resolution_gemini_first(monkeypatch):
    monkeypatch.setenv("LLM_AUTO_PROVIDER_ORDER", "gemini,groq,openai")
    monkeypatch.setenv("GEMINI_API_KEY", "gemini-live")
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    generator = LLMResponseGenerator(provider="auto")

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "choices": [{"message": {"role": "assistant", "content": "Auto selected Gemini!"}}],
        "usage": {"prompt_tokens": 15, "completion_tokens": 5, "total_tokens": 20},
    }

    with patch("httpx.Client.post", return_value=mock_response):
        result = generator.generate(prompt="Check auto")
        assert result["success"] is True
        assert result["provider"] == "gemini"
        assert result["actual_output"] == "Auto selected Gemini!"


def test_auto_provider_fallback_to_groq_when_gemini_fails(monkeypatch):
    monkeypatch.setenv("LLM_AUTO_PROVIDER_ORDER", "gemini,groq")
    monkeypatch.setenv("GEMINI_API_KEY", "gemini-key")
    monkeypatch.setenv("GROQ_API_KEY", "groq-key")

    generator = LLMResponseGenerator(provider="auto")

    gemini_fail = MagicMock(status_code=500, text="Internal Gemini Error")
    groq_success = MagicMock(
        status_code=200,
        json=lambda: {
            "choices": [{"message": {"role": "assistant", "content": "Groq fallback succeeded!"}}],
            "usage": {"prompt_tokens": 20, "completion_tokens": 6, "total_tokens": 26},
        },
    )

    with patch("httpx.Client.post", side_effect=[gemini_fail, groq_success]):
        result = generator.generate(prompt="Fallback test")
        assert result["success"] is True
        assert result["provider"] == "groq"
        assert result["actual_output"] == "Groq fallback succeeded!"


def test_judge_with_groq_provider(monkeypatch):
    monkeypatch.setenv("JUDGE_PROVIDER", "groq")
    monkeypatch.setenv("GROQ_API_KEY", "groq-judge-key")
    monkeypatch.setenv("GROQ_MODEL", "openai/gpt-oss-20b")

    judge = LLMJudgeEvaluator()

    mock_judge_output = json.dumps({
        "faithfulness_score": 0.95,
        "relevance_score": 0.90,
        "instruction_following_score": 1.0,
        "overall_judge_score": 0.93,
        "hallucination_verdict": "none",
        "passed": True,
        "explanation": "Response adheres perfectly to reference context.",
        "evidence_summary": "No unsupported claims detected.",
        "detected_issues": [],
    })

    mock_response = MagicMock(
        status_code=200,
        json=lambda: {
            "choices": [{"message": {"role": "assistant", "content": f"```json\n{mock_judge_output}\n```"}}],
            "usage": {"prompt_tokens": 120, "completion_tokens": 45, "total_tokens": 165},
        },
    )

    with patch("httpx.Client.post", return_value=mock_response):
        verdict = judge.evaluate_with_judge(
            prompt="What is the speed rating?",
            context="Max speed is 360 RPM.",
            actual_output="The fan runs at 360 RPM maximum speed.",
        )

        assert verdict["is_llm_judge"] is True
        assert verdict["judge_provider"] == "groq"
        assert verdict["overall_judge_score"] == 0.93
        assert verdict["hallucination_verdict"] == "none"
        assert verdict["judge_passed"] is True


def test_judge_fallback_to_heuristic_when_provider_unconfigured(monkeypatch):
    monkeypatch.setenv("JUDGE_PROVIDER", "gemini")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("JUDGE_API_KEY", raising=False)

    judge = LLMJudgeEvaluator()
    verdict = judge.evaluate_with_judge(
        prompt="Tell me about the fan",
        context="Consumes 28W and saves energy.",
        actual_output="Consumes 28W and saves energy.",
    )

    assert verdict["is_llm_judge"] is False
    assert verdict["judge_provider"] == "transparent_heuristic_judge"
    assert verdict["judge_passed"] is True


def test_api_models_endpoint_reports_gemini_and_groq(test_client, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "fake-gemini")
    monkeypatch.delenv("GROQ_API_KEY", raising=False)

    res = test_client.get("/api/models")
    assert res.status_code == 200
    data = res.json()

    assert "provider_status" in data
    assert data["provider_status"]["gemini"] is True
    assert data["provider_status"]["groq"] is False
    assert data["provider_status"]["offline_deterministic"] is True

    providers = [m["provider"] for m in data["configured"]]
    assert "gemini" in providers
    assert "groq" in providers


def test_health_endpoint_with_gemini_key(test_client, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "fake-gemini")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.delenv("GROQ_API_KEY", raising=False)

    res = test_client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["has_live_credentials"] is True
