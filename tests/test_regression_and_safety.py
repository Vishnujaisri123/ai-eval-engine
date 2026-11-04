import json
import pytest
from fastapi.testclient import TestClient

from app.api import app
from app.generator import LLMResponseGenerator
from app.metrics import calculate_instruction_following, calculate_token_f1

client = TestClient(app)


def test_evaluations_run_and_report_export():
    datasets = client.get("/api/datasets").json()
    golden_ds = next(d for d in datasets if "Golden" in d["name"])

    # Run evaluation
    run_res = client.post("/api/evaluations/run", json={
        "dataset_id": golden_ds["id"],
        "model_name": "baseline-model-v1",
        "provider": "deterministic",
        "use_live_generator": False,
        "pass_threshold": 0.70,
        "groundedness_threshold": 0.60
    })
    assert run_res.status_code == 200
    run_data = run_res.json()
    run_id = run_data["id"]
    assert run_data["total_cases"] == 4
    assert run_data["passed_cases"] == 3
    assert run_data["failed_cases"] == 1

    # Fetch run details and results
    get_run = client.get(f"/api/evaluations/{run_id}")
    assert get_run.status_code == 200
    assert len(get_run.json()["results"]) == 4

    get_results = client.get(f"/api/evaluations/{run_id}/results")
    assert get_results.status_code == 200
    assert len(get_results.json()) == 4

    # Reports export
    report_json = client.get(f"/api/reports/{run_id}/export?format=json")
    assert report_json.status_code == 200
    assert report_json.json()["run_id"] == run_id

    report_csv = client.get(f"/api/reports/{run_id}/export?format=csv")
    assert report_csv.status_code == 200
    assert "test_case_id,category,prompt" in report_csv.text

    report_html = client.get(f"/api/reports/{run_id}/export?format=html")
    assert report_html.status_code == 200
    assert "<!DOCTYPE html>" in report_html.text
    assert run_id in report_html.text


def test_regression_workflow():
    datasets = client.get("/api/datasets").json()
    golden_ds = next(d for d in datasets if "Golden" in d["name"])

    # 1. Run Baseline Evaluation
    run_res1 = client.post("/api/evaluations/run", json={
        "dataset_id": golden_ds["id"],
        "model_name": "v1.0-release",
        "provider": "deterministic",
        "use_live_generator": False,
    })
    run_id_1 = run_res1.json()["id"]

    # 2. Create Baseline
    bl_res = client.post("/api/regression/baselines", json={
        "name": "Production v1.0 Baseline",
        "run_id": run_id_1
    })
    assert bl_res.status_code == 201
    baseline_id = bl_res.json()["id"]

    # 3. Run Second Evaluation (e.g. prompt update)
    run_res2 = client.post("/api/evaluations/run", json={
        "dataset_id": golden_ds["id"],
        "model_name": "v1.1-experimental",
        "provider": "deterministic",
        "use_live_generator": False,
    })
    run_id_2 = run_res2.json()["id"]

    # 4. Compare Current Run against Baseline
    reg_res = client.post("/api/regression/run", json={
        "baseline_id": baseline_id,
        "current_run_id": run_id_2,
        "threshold_delta": 0.05
    })
    assert reg_res.status_code == 201
    reg_data = reg_res.json()
    assert "score_delta" in reg_data
    assert "details" in reg_data
    assert "case_comparisons" in reg_data["details"]

    # 5. Get regression comparison
    comp_id = reg_data["id"]
    get_comp = client.get(f"/api/regression/{comp_id}")
    assert get_comp.status_code == 200
    assert get_comp.json()["id"] == comp_id


def test_safety_evaluation_suite():
    # Run safety evaluation via API
    safe_res = client.post("/api/safety/run", json={
        "model_name": "safety-audit-v1",
        "use_live_generator": False,
    })
    assert safe_res.status_code == 201
    data = safe_res.json()
    assert data["total_cases"] >= 5
    assert len(data["results"]) >= 5

    # List safety results
    list_safe = client.get("/api/safety/results")
    assert list_safe.status_code == 200
    assert len(list_safe.json()) >= 1

    # Get individual safety run
    run_id = data["id"]
    detail_res = client.get(f"/api/safety/runs/{run_id}")
    assert detail_res.status_code == 200
    assert detail_res.json()["id"] == run_id


def test_provider_failure_does_not_silently_simulate():
    """
    CRITICAL REQUIREMENT:
    When a real provider is unavailable or lacks API credentials,
    the platform must display a clear error and NEVER silently substitute
    a simulated response.
    """
    generator = LLMResponseGenerator(provider="openai", model="gpt-4o")
    generator.api_key = None  # Ensure no credentials

    result = generator.generate(
        prompt="Tell me a joke",
        context="",
        allow_offline_fallback=False
    )
    assert result["success"] is False
    assert result["error"] is not None
    assert "API key is missing" in result["error"]
    assert result["provider"] != "rag_simulator_fallback"


def test_instruction_following_and_token_f1_metrics():
    # 1. Instruction Following: Negative Constraint Respected
    res_pass = calculate_instruction_following(
        system_instructions="You must answer politely. Do not mention competitor.",
        actual_output="Here are your product features."
    )
    assert res_pass["score"] == 1.0
    assert len(res_pass["violations"]) == 0

    # 2. Instruction Following: Negative Constraint Violated
    res_fail = calculate_instruction_following(
        system_instructions="You must answer politely. Do not mention competitor.",
        actual_output="Here are your features compared to competitor."
    )
    assert res_fail["score"] < 1.0
    assert len(res_fail["violations"]) == 1

    # 3. Token F1
    f1_perfect = calculate_token_f1("The fan consumes 28W", "The fan consumes 28W")
    assert f1_perfect == 1.0

    f1_partial = calculate_token_f1("The fan consumes 28W", "The motor uses 28W")
    assert 0.0 < f1_partial < 1.0
