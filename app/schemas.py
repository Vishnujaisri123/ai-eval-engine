from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# ── Dataset ──────────────────────────────────────────────────────────────────
class TestCaseCreate(BaseModel):
    id: Optional[str] = None
    name: str = ""
    prompt: str
    system_instructions: str = ""
    context: str = ""
    expected_output: str = ""
    expected_keywords: List[str] = []
    category: str = "general"
    threshold: float = 0.70
    tags: List[str] = []


class TestCaseOut(TestCaseCreate):
    id: str
    dataset_id: str
    created_at: datetime

    class Config:
        from_attributes = True


class DatasetCreate(BaseModel):
    name: str
    description: str = ""


class DatasetOut(BaseModel):
    id: str
    name: str
    description: str
    created_at: datetime
    test_case_count: int = 0

    class Config:
        from_attributes = True


class DatasetDetail(DatasetOut):
    test_cases: List[TestCaseOut] = []


# ── Playground ────────────────────────────────────────────────────────────────
class PlaygroundRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    system_prompt: str = ""
    context: str = ""
    provider: str = "auto"
    model: str = "llama3"
    temperature: float = 0.2


class PlaygroundResponse(BaseModel):
    response: str
    provider: str
    model: str
    latency_ms: float
    tokens: int
    prompt_tokens: int
    completion_tokens: int
    estimated_cost_usd: float
    history_id: str


# ── Evaluation ────────────────────────────────────────────────────────────────
class EvaluationRunRequest(BaseModel):
    dataset_id: str
    model_config_id: Optional[str] = None
    use_live_generator: bool = False
    pass_threshold: float = 0.70
    groundedness_threshold: float = 0.60


class EvaluationRunOut(BaseModel):
    id: str
    dataset_name: str
    model_name: str
    provider: str
    status: str
    total_cases: int
    passed_cases: int
    failed_cases: int
    pass_rate: float
    avg_score: float
    hallucination_count: int
    avg_latency_ms: float
    execution_time_ms: float
    created_at: datetime

    class Config:
        from_attributes = True


# ── Regression ────────────────────────────────────────────────────────────────
class BaselineCreate(BaseModel):
    name: str
    run_id: str


class BaselineOut(BaseModel):
    id: str
    name: str
    run_id: str
    dataset_id: str
    model_name: str
    avg_score: float
    pass_rate: float
    total_cases: int
    created_at: datetime

    class Config:
        from_attributes = True


class RegressionRunRequest(BaseModel):
    baseline_id: str
    current_run_id: str
    threshold_delta: float = 0.05


class RegressionOut(BaseModel):
    id: str
    baseline_id: str
    current_run_id: str
    score_delta: float
    pass_rate_delta: float
    new_failures: int
    resolved_failures: int
    regression_detected: bool
    details: Dict[str, Any]
    created_at: datetime

    class Config:
        from_attributes = True


# ── Safety ────────────────────────────────────────────────────────────────────
class SafetyRunRequest(BaseModel):
    model_name: str = ""
    dataset_path: Optional[str] = None


class SafetyRunOut(BaseModel):
    id: str
    model_name: str
    total_cases: int
    passed_cases: int
    failed_cases: int
    pass_rate: float
    created_at: datetime
    results: List[Dict[str, Any]] = []

    class Config:
        from_attributes = True


# ── Dashboard ─────────────────────────────────────────────────────────────────
class DashboardSummary(BaseModel):
    total_runs: int
    total_test_cases: int
    avg_score: float
    pass_rate: float
    failed_count: int
    regression_count: int
    safety_failure_count: int
    hallucination_count: int


# ── Model Comparison ──────────────────────────────────────────────────────────
class ModelCompareRequest(BaseModel):
    dataset_id: str
    model_configs: List[Dict[str, str]]
    pass_threshold: float = 0.70
