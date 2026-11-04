import os
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, PlainTextResponse, JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db, init_db
from app.evaluator import AIQualityEvaluator
from app.generator import LLMResponseGenerator
from app.safety import AISafetyEvaluator
from app.services import (
    dashboard_service,
    dataset_service,
    evaluation_service,
    playground_service,
    regression_service,
    report_service,
    safety_service,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize SQLite database and tables on startup
    init_db()
    # Auto-seed starter datasets if DB is completely fresh
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        from app.models import Dataset
        if db.query(Dataset).count() == 0:
            dataset_service.seed_starter_datasets(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title="AI Quality Evaluation & Automated Regression Testing Platform",
    description="Enterprise platform to evaluate, test, benchmark, and monitor AI quality and guard against regressions.",
    version="2.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Preserved Legacy Evaluators for Backward Compatibility ────────────────────
_evaluator = AIQualityEvaluator(pass_threshold=0.70, groundedness_threshold=0.60)
_safety_evaluator = AISafetyEvaluator()


class EvaluationRequest(BaseModel):
    id: Optional[str] = Field(default="LIVE-001")
    category: Optional[str] = Field(default="live_check")
    prompt: str = Field(..., min_length=1)
    context: str = Field(..., min_length=1)
    expected_output: str = Field(..., min_length=1)
    expected_keywords: List[str] = Field(default_factory=list)
    actual_output: str = Field(..., min_length=1)


# ── Existing Required Endpoints (Strict Compatibility) ────────────────────────
@app.get("/health")
def health_check():
    has_api_key = bool(os.getenv("OPENROUTER_API_KEY") or os.getenv("OPENAI_API_KEY"))
    provider = os.getenv("LLM_PROVIDER", "auto")
    model = os.getenv("LLM_MODEL", "llama3")
    return {
        "status": "healthy",
        "service": "ai-quality-evaluation-platform",
        "version": "2.1.0",
        "pass_threshold": _evaluator.pass_threshold,
        "groundedness_threshold": _evaluator.groundedness_threshold,
        "configured_provider": provider,
        "configured_model": model,
        "has_live_credentials": has_api_key,
    }


@app.post("/evaluate")
def evaluate_single_response(payload: EvaluationRequest):
    return _evaluator.evaluate_case(payload.model_dump())


@app.get("/evaluate/dataset")
def evaluate_golden_dataset():
    try:
        return _evaluator.evaluate_dataset("datasets/golden_dataset.json")
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@app.get("/evaluate/safety")
def evaluate_safety_suite():
    return _safety_evaluator.evaluate_safety_dataset()


# ── Dashboard & Analytics ─────────────────────────────────────────────────────
@app.get("/api/dashboard/summary")
def dashboard_summary(db: Session = Depends(get_db)):
    return dashboard_service.get_summary(db)


@app.get("/api/dashboard/activity")
def dashboard_activity(db: Session = Depends(get_db)):
    return dashboard_service.get_recent_activity(db)


@app.get("/api/dashboard/analytics")
def dashboard_analytics(db: Session = Depends(get_db)):
    return dashboard_service.get_analytics(db)


# ── AI Playground ─────────────────────────────────────────────────────────────
class PlaygroundRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    system_prompt: str = ""
    context: str = ""
    provider: str = "auto"
    model: str = "llama3"
    temperature: float = 0.2


class SaveTestCaseRequest(BaseModel):
    dataset_id: str
    name: Optional[str] = None
    prompt: str
    system_prompt: str = ""
    context: str = ""
    expected_output: str = ""
    actual_output: str = ""
    expected_keywords: List[str] = []
    category: str = "playground"
    threshold: float = 0.70


@app.post("/api/playground/run")
def playground_run(payload: PlaygroundRequest, db: Session = Depends(get_db)):
    return playground_service.run_playground(db, payload.model_dump())


@app.post("/api/playground/save-test-case")
def playground_save_test_case(payload: SaveTestCaseRequest, db: Session = Depends(get_db)):
    result = playground_service.save_as_test_case(db, payload.dataset_id, payload.model_dump())
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@app.get("/api/playground/history")
def playground_history(db: Session = Depends(get_db)):
    return playground_service.get_history(db)


# ── Evaluations ───────────────────────────────────────────────────────────────
class EvalRunRequest(BaseModel):
    dataset_id: str
    model_name: Optional[str] = None
    provider: Optional[str] = None
    use_live_generator: bool = False
    pass_threshold: float = 0.70
    groundedness_threshold: float = 0.60
    system_instructions_override: Optional[str] = None


@app.post("/api/evaluations/run")
def run_evaluation(payload: EvalRunRequest, db: Session = Depends(get_db)):
    result = evaluation_service.run_evaluation(
        db,
        dataset_id=payload.dataset_id,
        model_name=payload.model_name,
        provider=payload.provider,
        pass_threshold=payload.pass_threshold,
        groundedness_threshold=payload.groundedness_threshold,
        use_live_generator=payload.use_live_generator,
        system_instructions_override=payload.system_instructions_override,
    )
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@app.get("/api/evaluations")
def list_evaluations(db: Session = Depends(get_db)):
    return evaluation_service.list_runs(db)


@app.get("/api/evaluations/{run_id}")
def get_evaluation(run_id: str, db: Session = Depends(get_db)):
    result = evaluation_service.get_run(db, run_id)
    if not result:
        raise HTTPException(status_code=404, detail="Run not found")
    return result


@app.get("/api/evaluations/{run_id}/results")
def get_evaluation_results(run_id: str, db: Session = Depends(get_db)):
    return evaluation_service.get_run_results(db, run_id)


# ── Datasets ──────────────────────────────────────────────────────────────────
class DatasetCreate(BaseModel):
    name: str
    description: str = ""


class TestCaseCreate(BaseModel):
    id: Optional[str] = None
    name: str = ""
    prompt: str
    system_instructions: str = ""
    context: str = ""
    expected_output: str = ""
    actual_output: str = ""
    expected_keywords: List[str] = []
    category: str = "general"
    threshold: float = 0.70
    tags: List[str] = []


@app.get("/api/datasets")
def list_datasets(db: Session = Depends(get_db)):
    return dataset_service.list_datasets(db)


@app.post("/api/datasets/seed")
def seed_starter_datasets(db: Session = Depends(get_db)):
    return dataset_service.seed_starter_datasets(db)


@app.post("/api/datasets", status_code=201)
def create_dataset(payload: DatasetCreate, db: Session = Depends(get_db)):
    return dataset_service.create_dataset(db, payload.name, payload.description)


@app.get("/api/datasets/{dataset_id}")
def get_dataset(dataset_id: str, db: Session = Depends(get_db)):
    result = dataset_service.get_dataset(db, dataset_id)
    if not result:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return result


@app.put("/api/datasets/{dataset_id}")
def update_dataset(dataset_id: str, payload: DatasetCreate, db: Session = Depends(get_db)):
    result = dataset_service.update_dataset(db, dataset_id, payload.name, payload.description)
    if not result:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return result


@app.delete("/api/datasets/{dataset_id}", status_code=204)
def delete_dataset(dataset_id: str, db: Session = Depends(get_db)):
    if not dataset_service.delete_dataset(db, dataset_id):
        raise HTTPException(status_code=404, detail="Dataset not found")


@app.get("/api/datasets/{dataset_id}/export")
def export_dataset(dataset_id: str, format: str = "json", db: Session = Depends(get_db)):
    content, media_type = dataset_service.export_dataset(db, dataset_id, format=format)
    if media_type == "error":
        raise HTTPException(status_code=404, detail="Dataset not found")
    filename = f"dataset_{dataset_id}.{format}"
    return PlainTextResponse(
        content,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@app.post("/api/datasets/{dataset_id}/cases", status_code=201)
def add_test_case(dataset_id: str, payload: TestCaseCreate, db: Session = Depends(get_db)):
    result = dataset_service.add_test_case(db, dataset_id, payload.model_dump())
    if not result:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return result


@app.put("/api/datasets/{dataset_id}/cases/{tc_id}")
def update_test_case(dataset_id: str, tc_id: str, payload: TestCaseCreate, db: Session = Depends(get_db)):
    result = dataset_service.update_test_case(db, tc_id, payload.model_dump())
    if not result:
        raise HTTPException(status_code=404, detail="Test case not found")
    return result


@app.delete("/api/datasets/{dataset_id}/cases/{tc_id}", status_code=204)
def delete_test_case(dataset_id: str, tc_id: str, db: Session = Depends(get_db)):
    if not dataset_service.delete_test_case(db, tc_id):
        raise HTTPException(status_code=404, detail="Test case not found")


@app.post("/api/datasets/{dataset_id}/import")
async def import_dataset(dataset_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = await file.read()
    result = dataset_service.import_dataset_cases(db, dataset_id, content, file.filename or "")
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


# ── Regression Testing ────────────────────────────────────────────────────────
class BaselineCreate(BaseModel):
    name: str
    run_id: str


class RegressionRunRequest(BaseModel):
    baseline_id: str
    current_run_id: str
    threshold_delta: float = 0.05


@app.post("/api/regression/baselines", status_code=201)
def create_baseline(payload: BaselineCreate, db: Session = Depends(get_db)):
    result = regression_service.create_baseline(db, payload.name, payload.run_id)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@app.get("/api/regression/baselines")
def list_baselines(db: Session = Depends(get_db)):
    return regression_service.list_baselines(db)


@app.get("/api/regression/comparisons")
def list_comparisons(db: Session = Depends(get_db)):
    return regression_service.list_comparisons(db)


@app.post("/api/regression/run", status_code=201)
def run_regression(payload: RegressionRunRequest, db: Session = Depends(get_db)):
    result = regression_service.run_regression(
        db, payload.baseline_id, payload.current_run_id, payload.threshold_delta
    )
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@app.get("/api/regression/{comparison_id}")
def get_regression(comparison_id: str, db: Session = Depends(get_db)):
    result = regression_service.get_comparison(db, comparison_id)
    if not result:
        raise HTTPException(status_code=404, detail="Comparison not found")
    return result


# ── AI Safety & Red-Team Testing ──────────────────────────────────────────────
class SafetyRunRequest(BaseModel):
    model_name: str = ""
    provider: str = ""
    use_live_generator: bool = False
    dataset_path: Optional[str] = None


@app.post("/api/safety/run", status_code=201)
def run_safety(payload: SafetyRunRequest, db: Session = Depends(get_db)):
    return safety_service.run_safety_evaluation(
        db,
        model_name=payload.model_name,
        provider=payload.provider,
        use_live_generator=payload.use_live_generator,
        dataset_path=payload.dataset_path,
    )


@app.get("/api/safety/results")
def list_safety_results(db: Session = Depends(get_db)):
    return safety_service.list_safety_runs(db)


@app.get("/api/safety/runs/{run_id}")
def get_safety_run_details(run_id: str, db: Session = Depends(get_db)):
    result = safety_service.get_safety_run(db, run_id)
    if not result:
        raise HTTPException(status_code=404, detail="Safety run not found")
    return result


# ── Models & Model Comparison ─────────────────────────────────────────────────
@app.get("/api/models")
def list_models():
    provider = os.getenv("LLM_PROVIDER", "auto")
    model = os.getenv("LLM_MODEL", "llama3")
    ollama_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    judge_provider = os.getenv("JUDGE_PROVIDER", "transparent_heuristic")
    judge_model = os.getenv("JUDGE_MODEL", "heuristic-rubric")
    has_api_key = bool(os.getenv("OPENROUTER_API_KEY") or os.getenv("OPENAI_API_KEY"))

    configured = [
        {
            "id": "configured_primary",
            "name": f"{provider.capitalize()} - {model}",
            "provider": provider,
            "model_name": model,
            "is_active": True,
            "has_credentials": has_api_key or provider == "ollama",
        },
        {
            "id": "ollama_local",
            "name": "Ollama Local (llama3 / mistral)",
            "provider": "ollama",
            "model_name": os.getenv("OLLAMA_MODEL", "llama3"),
            "base_url": ollama_url,
            "is_active": True,
            "has_credentials": True,
        },
        {
            "id": "offline_deterministic",
            "name": "Offline Deterministic Benchmark",
            "provider": "offline",
            "model_name": "deterministic-rag-v1",
            "is_active": True,
            "has_credentials": True,
        },
    ]

    return {
        "configured": configured,
        "active_provider": provider,
        "active_model": model,
        "ollama_url": ollama_url,
        "judge_provider": judge_provider,
        "judge_model": judge_model,
        "provider_status": {
            "openai_compatible": has_api_key,
            "ollama_configured": bool(ollama_url),
            "offline_deterministic": True,
        },
    }


class ConnectionTestRequest(BaseModel):
    provider: str
    model: str = "llama3"
    base_url: str = ""


@app.post("/api/models/test-connection")
def test_connection(payload: ConnectionTestRequest):
    gen = LLMResponseGenerator(
        provider=payload.provider,
        model=payload.model,
        ollama_url=payload.base_url or None,
    )
    result = gen.generate(
        prompt="Say 'Connected successfully' in two words.",
        context="",
        allow_offline_fallback=False,
    )
    is_success = result.get("success", False)
    return {
        "success": is_success,
        "provider": result["provider"],
        "model": result["model"],
        "error": result.get("error"),
        "latency_ms": result["telemetry"]["latency_ms"],
        "response_preview": (result.get("actual_output") or "")[:150],
    }


class ModelCompareRequest(BaseModel):
    dataset_id: str
    model_configs: List[Dict[str, Any]]
    pass_threshold: float = 0.70


@app.post("/api/models/compare")
def compare_models(payload: ModelCompareRequest, db: Session = Depends(get_db)):
    ds = dataset_service.get_dataset(db, payload.dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")

    comparison_results = []
    for cfg in payload.model_configs:
        m_name = cfg.get("model_name", "unknown")
        prov = cfg.get("provider", "auto")
        use_live = prov not in ("offline", "deterministic")

        result = evaluation_service.run_evaluation(
            db,
            dataset_id=payload.dataset_id,
            model_name=m_name,
            provider=prov,
            pass_threshold=payload.pass_threshold,
            use_live_generator=use_live,
        )
        comparison_results.append({
            "model_config": cfg,
            "run_id": result.get("id"),
            "model_name": m_name,
            "provider": prov,
            "avg_score": result.get("avg_score", 0.0),
            "pass_rate": result.get("pass_rate", 0.0),
            "hallucination_count": result.get("hallucination_count", 0),
            "avg_latency_ms": result.get("avg_latency_ms", 0.0),
            "total_tokens": result.get("total_tokens", 0),
            "passed_cases": result.get("passed_cases", 0),
            "failed_cases": result.get("failed_cases", 0),
        })

    # Determine winner for overall score, lowest latency, and best pass rate
    best_score_model = max(comparison_results, key=lambda c: c["avg_score"])["model_name"] if comparison_results else "N/A"
    best_latency_model = min(comparison_results, key=lambda c: c["avg_latency_ms"])["model_name"] if comparison_results else "N/A"
    best_pass_model = max(comparison_results, key=lambda c: c["pass_rate"])["model_name"] if comparison_results else "N/A"

    return {
        "dataset_id": payload.dataset_id,
        "dataset_name": ds["name"],
        "comparisons": comparison_results,
        "analysis": {
            "highest_accuracy_model": best_score_model,
            "fastest_response_model": best_latency_model,
            "highest_pass_rate_model": best_pass_model,
            "summary": f"{best_score_model} achieved highest overall score, while {best_latency_model} had lowest latency.",
        },
    }


# ── Reports ───────────────────────────────────────────────────────────────────
@app.get("/api/reports/{run_id}")
def get_report(run_id: str, db: Session = Depends(get_db)):
    data = report_service.get_report_data(db, run_id)
    if "error" in data:
        raise HTTPException(status_code=404, detail=data["error"])
    return data


@app.get("/api/reports/{run_id}/export")
def export_report(run_id: str, format: str = "json", db: Session = Depends(get_db)):
    if format == "csv":
        content = report_service.export_csv(db, run_id)
        return PlainTextResponse(
            content,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=report_{run_id}.csv"},
        )
    elif format == "html":
        content = report_service.export_html(db, run_id)
        return HTMLResponse(content)
    else:
        data = report_service.get_report_data(db, run_id)
        if "error" in data:
            raise HTTPException(status_code=404, detail=data["error"])
        return JSONResponse(
            data,
            headers={"Content-Disposition": f"attachment; filename=report_{run_id}.json"},
        )
