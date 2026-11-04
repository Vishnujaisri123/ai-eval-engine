import io
import json
import pytest
from fastapi.testclient import TestClient

from app.api import app

client = TestClient(app)


def test_health_check_endpoint():
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert "configured_provider" in data


def test_dashboard_summary_and_activity():
    res = client.get("/api/dashboard/summary")
    assert res.status_code == 200
    summary = res.json()
    assert "total_runs" in summary
    assert "total_test_cases" in summary
    assert "pass_rate" in summary

    res2 = client.get("/api/dashboard/activity")
    assert res2.status_code == 200
    assert isinstance(res2.json(), list)

    res3 = client.get("/api/dashboard/analytics")
    assert res3.status_code == 200
    analytics = res3.json()
    assert "score_over_time" in analytics
    assert "pass_fail_distribution" in analytics


def test_dataset_lifecycle_and_seeding():
    # 1. Seed datasets
    seed_res = client.post("/api/datasets/seed")
    assert seed_res.status_code == 200

    # 2. List datasets
    list_res = client.get("/api/datasets")
    assert list_res.status_code == 200
    datasets = list_res.json()
    assert len(datasets) >= 1
    ds_id = datasets[0]["id"]

    # 3. Create a custom dataset
    create_res = client.post("/api/datasets", json={"name": "Test Suite Alpha", "description": "Temporary unit test suite"})
    assert create_res.status_code == 201
    custom_id = create_res.json()["id"]

    # 4. Add a testcase
    tc_res = client.post(f"/api/datasets/{custom_id}/cases", json={
        "prompt": "What is the speed rating of Renesa?",
        "context": "Renesa operates at 5 speed levels.",
        "expected_output": "Renesa operates at 5 speed levels.",
        "expected_keywords": ["5", "speed"],
        "category": "speed",
        "threshold": 0.70
    })
    assert tc_res.status_code == 201
    tc_id = tc_res.json()["id"]

    # 5. Export dataset
    export_json = client.get(f"/api/datasets/{custom_id}/export?format=json")
    assert export_json.status_code == 200
    exported_cases = json.loads(export_json.text)
    assert len(exported_cases) == 1

    export_csv = client.get(f"/api/datasets/{custom_id}/export?format=csv")
    assert export_csv.status_code == 200
    assert "What is the speed rating" in export_csv.text

    # 6. Delete testcase & dataset
    del_tc = client.delete(f"/api/datasets/{custom_id}/cases/{tc_id}")
    assert del_tc.status_code == 204

    del_ds = client.delete(f"/api/datasets/{custom_id}")
    assert del_ds.status_code == 204


def test_playground_run_and_save_test_case():
    # Run playground with offline/deterministic provider
    pg_res = client.post("/api/playground/run", json={
        "prompt": "How much electricity does it consume?",
        "context": "The appliance consumes 28W.",
        "system_prompt": "Answer strictly based on context.",
        "provider": "offline",
        "model": "offline-model",
        "temperature": 0.0
    })
    assert pg_res.status_code == 200
    pg_data = pg_res.json()
    assert "response" in pg_data
    assert "latency_ms" in pg_data

    # Check playground history
    hist_res = client.get("/api/playground/history")
    assert hist_res.status_code == 200
    history = hist_res.json()
    assert len(history) >= 1

    # Save as test case into first available dataset
    datasets = client.get("/api/datasets").json()
    assert len(datasets) > 0
    target_ds_id = datasets[0]["id"]

    save_res = client.post("/api/playground/save-test-case", json={
        "dataset_id": target_ds_id,
        "name": "Saved from Playground",
        "prompt": "How much electricity does it consume?",
        "context": "The appliance consumes 28W.",
        "expected_output": "The appliance consumes 28W.",
        "actual_output": pg_data["response"],
        "expected_keywords": ["28w"],
        "category": "power"
    })
    assert save_res.status_code == 200
    assert save_res.json()["name"] == "Saved from Playground"


def test_models_test_connection_and_comparison():
    # Test connection to offline deterministic model
    test_conn = client.post("/api/models/test-connection", json={
        "provider": "offline",
        "model": "deterministic-test",
    })
    assert test_conn.status_code == 200
    assert test_conn.json()["success"] is True

    # Compare models on golden dataset
    datasets = client.get("/api/datasets").json()
    golden_ds = next(d for d in datasets if "Golden" in d["name"])

    compare_res = client.post("/api/models/compare", json={
        "dataset_id": golden_ds["id"],
        "model_configs": [
            {"model_name": "Model-A", "provider": "offline"},
            {"model_name": "Model-B", "provider": "deterministic"}
        ],
        "pass_threshold": 0.70
    })
    assert compare_res.status_code == 200
    data = compare_res.json()
    assert len(data["comparisons"]) == 2
    assert "analysis" in data
