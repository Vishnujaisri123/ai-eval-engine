import pytest
from app.evaluator import AIQualityEvaluator


@pytest.fixture
def evaluator() -> AIQualityEvaluator:
    """
    pytest Fixture: Provides a reusable AIQualityEvaluator instance
    with standard production thresholds (0.70 overall, 0.60 groundedness).
    """
    return AIQualityEvaluator(pass_threshold=0.70, groundedness_threshold=0.60)


@pytest.fixture
def golden_cases(evaluator: AIQualityEvaluator):
    """
    pytest Fixture: Loads all test cases from datasets/golden_dataset.json.
    """
    return evaluator.load_dataset("datasets/golden_dataset.json")


def test_golden_dataset_loads_correctly(golden_cases):
    """Verify the golden dataset is non-empty and contains required schema keys."""
    assert len(golden_cases) == 4
    required_keys = {"id", "prompt", "context", "expected_output", "expected_keywords", "actual_output"}
    for case in golden_cases:
        assert required_keys.issubset(case.keys()), f"Missing keys in case {case.get('id')}"


@pytest.mark.parametrize("case_id", ["TC001", "TC002", "TC003"])
def test_verified_golden_cases_pass_regression(evaluator, golden_cases, case_id):
    """
    Regression Test: Ensures verified production responses (TC001, TC002, TC003)
    maintain high accuracy, groundedness, and zero hallucinations.
    """
    case = next(c for c in golden_cases if c["id"] == case_id)
    result = evaluator.evaluate_case(case)

    assert result["passed"] is True, f"{case_id} failed regression with score {result['metrics']['overall_score']}"
    assert result["hallucination_detected"] is False, f"Unexpected hallucination in {case_id}"
    assert result["metrics"]["accuracy"] >= 0.80
    assert result["metrics"]["groundedness"] >= 0.60


def test_hallucination_trap_is_caught(evaluator, golden_cases):
    """
    Negative / Guardrail Test: Ensures TC004 (ungrounded Bluetooth speaker/camera claim)
    is strictly flagged as a hallucination and marked as FAILED.
    """
    trap_case = next(c for c in golden_cases if c["id"] == "TC004")
    result = evaluator.evaluate_case(trap_case)

    assert result["hallucination_detected"] is True, "Engine failed to detect hallucination in TC004!"
    assert result["passed"] is False, "Hallucinated response TC004 should never pass!"


def test_dataset_summary_quality_gate(evaluator):
    """
    Batch Quality Gate: Ensures overall dataset evaluation computes accurate aggregates.
    """
    report = evaluator.evaluate_dataset("datasets/golden_dataset.json")
    summary = report["summary"]

    assert summary["total_cases"] == 4
    assert summary["passed_cases"] == 3
    assert summary["failed_cases"] == 1
    assert summary["hallucinations_detected"] == 1
    assert summary["pass_rate"] >= 75.0

from fastapi.testclient import TestClient
from app.api import app

client = TestClient(app)


def test_api_health_endpoint():
    """Verify the FastAPI /health endpoint returns HTTP 200 and service metadata."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_api_post_evaluate_endpoint():
    """Verify POST /evaluate scores a live payload via FastAPI."""
    payload = {
        "id": "API-TC01",
        "category": "power_consumption",
        "prompt": "How much power does the Atomberg Renesa fan consume?",
        "context": "The Atomberg Renesa ceiling fan uses a 28W BLDC motor.",
        "expected_output": "The Atomberg Renesa fan consumes 28W using a BLDC motor.",
        "expected_keywords": ["28w", "bldc"],
        "actual_output": "The Atomberg Renesa ceiling fan consumes 28W with its BLDC motor."
    }
    response = client.post("/evaluate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["passed"] is True
    assert data["hallucination_detected"] is False
    assert data["metrics"]["accuracy"] == 1.0