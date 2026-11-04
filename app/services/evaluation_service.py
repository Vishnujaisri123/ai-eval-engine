import time
import uuid
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.evaluator import AIQualityEvaluator
from app.generator import LLMResponseGenerator
from app.models import Dataset, EvaluationResult, EvaluationRun, TestCase


def _new_id(prefix: str = "") -> str:
    return f"{prefix}{uuid.uuid4().hex[:12]}"


def run_evaluation(
    db: Session,
    dataset_id: str,
    model_name: Optional[str] = None,
    provider: Optional[str] = None,
    pass_threshold: float = 0.70,
    groundedness_threshold: float = 0.60,
    use_live_generator: bool = False,
    system_instructions_override: Optional[str] = None,
) -> Dict[str, Any]:
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not ds:
        return {"error": f"Dataset with ID '{dataset_id}' not found"}

    test_cases = db.query(TestCase).filter(TestCase.dataset_id == dataset_id).all()
    if not test_cases:
        return {"error": f"Dataset '{ds.name}' has no test cases to evaluate"}

    # Determine provider and model settings
    effective_provider = provider or ("auto" if use_live_generator else "deterministic")
    effective_model = model_name or ("live_model" if use_live_generator else "deterministic_baseline")

    generator = LLMResponseGenerator(
        provider=effective_provider,
        model=effective_model,
    )
    evaluator = AIQualityEvaluator(
        pass_threshold=pass_threshold,
        groundedness_threshold=groundedness_threshold,
        generator=generator,
    )

    run_id = _new_id("run_")
    run = EvaluationRun(
        id=run_id,
        dataset_id=dataset_id,
        dataset_name=ds.name,
        model_name=effective_model,
        provider=effective_provider,
        status="running",
    )
    db.add(run)
    db.commit()

    start_time = time.perf_counter()
    results = []

    for tc in test_cases:
        effective_instructions = system_instructions_override or tc.system_instructions or ""
        case_dict = {
            "id": tc.id,
            "category": tc.category or "general",
            "prompt": tc.prompt,
            "system_instructions": effective_instructions,
            "context": tc.context or "",
            "expected_output": tc.expected_output or "",
            "expected_keywords": tc.expected_keywords or [],
            "actual_output": tc.actual_output or "",
        }

        # If offline evaluation is requested and tc has pre-recorded actual_output, evaluate that
        should_generate_live = use_live_generator or not bool(tc.actual_output.strip())
        res = evaluator.evaluate_case(case_dict, use_live_generator=should_generate_live)
        results.append(res)

        judge_verdict = res.get("judge_verdict", {})
        er = EvaluationResult(
            id=_new_id("er_"),
            run_id=run_id,
            test_case_id=tc.id,
            category=tc.category or "general",
            prompt=tc.prompt,
            actual_output=res.get("actual_output", ""),
            expected_output=tc.expected_output or "",
            accuracy=res["metrics"].get("accuracy", 0.0),
            relevance=res["metrics"].get("relevance", 0.0),
            groundedness=res["metrics"].get("groundedness", 0.0),
            semantic_similarity=res["metrics"].get("semantic_similarity", 0.0),
            instruction_following=res["metrics"].get("instruction_following", 1.0),
            overall_score=res["metrics"].get("overall_score", 0.0),
            hallucination_detected=res.get("hallucination_detected", False),
            hallucination_reasons=res.get("hallucination_reasons", []),
            judge_verdict=judge_verdict.get("hallucination_verdict", "none"),
            judge_reasoning=judge_verdict.get("judge_reasoning", ""),
            is_llm_judge=judge_verdict.get("is_llm_judge", False),
            passed=res.get("passed", False),
            latency_ms=res["performance"].get("latency_ms", 0.0),
            tokens=res["performance"].get("total_tokens", 0),
            error=res.get("error", ""),
        )
        db.add(er)

    total_duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
    total = len(results)
    passed = sum(1 for r in results if r["passed"])

    run.status = "completed"
    run.total_cases = total
    run.passed_cases = passed
    run.failed_cases = total - passed
    run.pass_rate = round(passed / total * 100, 1) if total else 0.0
    run.avg_score = round(sum(r["metrics"]["overall_score"] for r in results) / total, 2) if total else 0.0
    run.hallucination_count = sum(1 for r in results if r["hallucination_detected"])
    run.avg_latency_ms = round(sum(r["performance"]["latency_ms"] for r in results) / total, 2) if total else 0.0
    run.total_tokens = sum(r["performance"]["total_tokens"] for r in results)
    run.execution_time_ms = total_duration_ms
    run.provider = results[0].get("provider", effective_provider) if results else effective_provider

    db.commit()
    db.refresh(run)

    return _run_to_dict(run, include_results=True)


def list_runs(db: Session, limit: int = 50) -> List[Dict]:
    rows = db.query(EvaluationRun).order_by(EvaluationRun.created_at.desc()).limit(limit).all()
    return [_run_to_dict(r) for r in rows]


def get_run(db: Session, run_id: str) -> Optional[Dict]:
    run = db.query(EvaluationRun).filter(EvaluationRun.id == run_id).first()
    if not run:
        return None
    return _run_to_dict(run, include_results=True)


def get_run_results(db: Session, run_id: str) -> List[Dict]:
    rows = db.query(EvaluationResult).filter(EvaluationResult.run_id == run_id).all()
    return [_result_to_dict(r) for r in rows]


def _run_to_dict(run: EvaluationRun, include_results: bool = False) -> Dict[str, Any]:
    data = {
        "id": run.id,
        "dataset_id": run.dataset_id,
        "dataset_name": run.dataset_name,
        "model_name": run.model_name,
        "provider": run.provider,
        "status": run.status,
        "total_cases": run.total_cases,
        "passed_cases": run.passed_cases,
        "failed_cases": run.failed_cases,
        "pass_rate": run.pass_rate,
        "avg_score": run.avg_score,
        "hallucination_count": run.hallucination_count,
        "avg_latency_ms": run.avg_latency_ms,
        "total_tokens": run.total_tokens,
        "execution_time_ms": run.execution_time_ms,
        "notes": run.notes or "",
        "created_at": run.created_at.isoformat() if run.created_at else "",
    }
    if include_results:
        data["results"] = [_result_to_dict(r) for r in run.results]
    return data


def _result_to_dict(r: EvaluationResult) -> Dict[str, Any]:
    return {
        "id": r.id,
        "run_id": r.run_id,
        "test_case_id": r.test_case_id,
        "category": r.category,
        "prompt": r.prompt,
        "actual_output": r.actual_output,
        "expected_output": r.expected_output,
        "accuracy": r.accuracy,
        "relevance": r.relevance,
        "groundedness": r.groundedness,
        "semantic_similarity": r.semantic_similarity,
        "instruction_following": r.instruction_following,
        "overall_score": r.overall_score,
        "hallucination_detected": r.hallucination_detected,
        "hallucination_reasons": r.hallucination_reasons or [],
        "judge_verdict": r.judge_verdict,
        "judge_reasoning": r.judge_reasoning,
        "is_llm_judge": r.is_llm_judge,
        "passed": r.passed,
        "latency_ms": r.latency_ms,
        "tokens": r.tokens,
        "error": r.error or "",
    }
