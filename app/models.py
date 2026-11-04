from datetime import datetime, timezone
from sqlalchemy import Column, String, Float, Integer, Boolean, DateTime, Text, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class Dataset(Base):
    __tablename__ = "datasets"
    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    description = Column(Text, default="")
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    test_cases = relationship("TestCase", back_populates="dataset", cascade="all, delete-orphan")


class TestCase(Base):
    __tablename__ = "test_cases"
    id = Column(String, primary_key=True)
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=False)
    name = Column(String, default="")
    prompt = Column(Text, nullable=False)
    system_instructions = Column(Text, default="")
    context = Column(Text, default="")
    expected_output = Column(Text, default="")
    actual_output = Column(Text, default="")
    expected_keywords = Column(JSON, default=list)
    category = Column(String, default="general")
    threshold = Column(Float, default=0.70)
    tags = Column(JSON, default=list)
    created_at = Column(DateTime, default=utcnow)
    dataset = relationship("Dataset", back_populates="test_cases")


class ModelConfig(Base):
    __tablename__ = "model_configs"
    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    provider = Column(String, nullable=False)  # openai, ollama, openrouter, offline
    model_name = Column(String, nullable=False)
    base_url = Column(String, default="")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)


class EvaluationRun(Base):
    __tablename__ = "evaluation_runs"
    id = Column(String, primary_key=True)
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=True)
    dataset_name = Column(String, default="")
    model_config_id = Column(String, nullable=True)
    model_name = Column(String, default="")
    provider = Column(String, default="")
    status = Column(String, default="pending")  # pending, running, completed, failed
    total_cases = Column(Integer, default=0)
    passed_cases = Column(Integer, default=0)
    failed_cases = Column(Integer, default=0)
    pass_rate = Column(Float, default=0.0)
    avg_score = Column(Float, default=0.0)
    hallucination_count = Column(Integer, default=0)
    avg_latency_ms = Column(Float, default=0.0)
    total_tokens = Column(Integer, default=0)
    execution_time_ms = Column(Float, default=0.0)
    notes = Column(Text, default="")
    created_at = Column(DateTime, default=utcnow)
    results = relationship("EvaluationResult", back_populates="run", cascade="all, delete-orphan")


class EvaluationResult(Base):
    __tablename__ = "evaluation_results"
    id = Column(String, primary_key=True)
    run_id = Column(String, ForeignKey("evaluation_runs.id"), nullable=False)
    test_case_id = Column(String, default="")
    category = Column(String, default="")
    prompt = Column(Text, default="")
    actual_output = Column(Text, default="")
    expected_output = Column(Text, default="")
    accuracy = Column(Float, default=0.0)
    relevance = Column(Float, default=0.0)
    groundedness = Column(Float, default=0.0)
    semantic_similarity = Column(Float, default=0.0)
    instruction_following = Column(Float, default=1.0)
    overall_score = Column(Float, default=0.0)
    hallucination_detected = Column(Boolean, default=False)
    hallucination_reasons = Column(JSON, default=list)
    judge_verdict = Column(String, default="none")
    judge_reasoning = Column(Text, default="")
    is_llm_judge = Column(Boolean, default=False)
    passed = Column(Boolean, default=False)
    latency_ms = Column(Float, default=0.0)
    tokens = Column(Integer, default=0)
    error = Column(Text, default="")
    run = relationship("EvaluationRun", back_populates="results")


class RegressionBaseline(Base):
    __tablename__ = "regression_baselines"
    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    run_id = Column(String, ForeignKey("evaluation_runs.id"), nullable=False)
    dataset_id = Column(String, default="")
    model_name = Column(String, default="")
    avg_score = Column(Float, default=0.0)
    pass_rate = Column(Float, default=0.0)
    total_cases = Column(Integer, default=0)
    created_at = Column(DateTime, default=utcnow)


class RegressionComparison(Base):
    __tablename__ = "regression_comparisons"
    id = Column(String, primary_key=True)
    baseline_id = Column(String, ForeignKey("regression_baselines.id"), nullable=False)
    current_run_id = Column(String, ForeignKey("evaluation_runs.id"), nullable=False)
    score_delta = Column(Float, default=0.0)
    pass_rate_delta = Column(Float, default=0.0)
    new_failures = Column(Integer, default=0)
    resolved_failures = Column(Integer, default=0)
    regression_detected = Column(Boolean, default=False)
    details = Column(JSON, default=dict)
    created_at = Column(DateTime, default=utcnow)


class SafetyRun(Base):
    __tablename__ = "safety_runs"
    id = Column(String, primary_key=True)
    model_name = Column(String, default="")
    provider = Column(String, default="")
    total_cases = Column(Integer, default=0)
    passed_cases = Column(Integer, default=0)
    failed_cases = Column(Integer, default=0)
    pass_rate = Column(Float, default=0.0)
    created_at = Column(DateTime, default=utcnow)
    results = relationship("SafetyResult", back_populates="run", cascade="all, delete-orphan")


class SafetyResult(Base):
    __tablename__ = "safety_results"
    id = Column(String, primary_key=True)
    run_id = Column(String, ForeignKey("safety_runs.id"), nullable=False)
    case_id = Column(String, default="")
    attack_type = Column(String, default="")
    prompt = Column(Text, default="")
    actual_output = Column(Text, default="")
    expected_safe_behavior = Column(Text, default="")
    passed = Column(Boolean, default=False)
    violations = Column(JSON, default=list)
    severity = Column(String, default="low")
    explanation = Column(Text, default="")
    run = relationship("SafetyRun", back_populates="results")


class PlaygroundHistory(Base):
    __tablename__ = "playground_history"
    id = Column(String, primary_key=True)
    prompt = Column(Text, default="")
    system_prompt = Column(Text, default="")
    context = Column(Text, default="")
    response = Column(Text, default="")
    provider = Column(String, default="")
    model_name = Column(String, default="")
    latency_ms = Column(Float, default=0.0)
    tokens = Column(Integer, default=0)
    created_at = Column(DateTime, default=utcnow)
