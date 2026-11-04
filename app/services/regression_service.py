import uuid
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models import EvaluationResult, EvaluationRun, RegressionBaseline, RegressionComparison


def _new_id(prefix: str = "") -> str:
    return f"{prefix}{uuid.uuid4().hex[:12]}"


def create_baseline(db: Session, name: str, run_id: str) -> Dict[str, Any]:
    run = db.query(EvaluationRun).filter(EvaluationRun.id == run_id).first()
    if not run:
        return {"error": "Evaluation run not found"}

    baseline = RegressionBaseline(
        id=_new_id("bl_"),
        name=name,
        run_id=run_id,
        dataset_id=run.dataset_id or "",
        model_name=run.model_name,
        avg_score=run.avg_score,
        pass_rate=run.pass_rate,
        total_cases=run.total_cases,
    )
    db.add(baseline)
    db.commit()
    db.refresh(baseline)
    return _bl_to_dict(baseline)


def list_baselines(db: Session) -> List[Dict]:
    rows = db.query(RegressionBaseline).order_by(RegressionBaseline.created_at.desc()).all()
    return [_bl_to_dict(b) for b in rows]


def list_comparisons(db: Session, limit: int = 20) -> List[Dict]:
    rows = db.query(RegressionComparison).order_by(RegressionComparison.created_at.desc()).limit(limit).all()
    return [_comp_to_dict(c) for c in rows]


def run_regression(
    db: Session,
    baseline_id: str,
    current_run_id: str,
    threshold_delta: float = 0.05,
) -> Dict[str, Any]:
    baseline = db.query(RegressionBaseline).filter(RegressionBaseline.id == baseline_id).first()
    if not baseline:
        return {"error": "Baseline not found"}

    current_run = db.query(EvaluationRun).filter(EvaluationRun.id == current_run_id).first()
    if not current_run:
        return {"error": "Current run not found"}

    baseline_run = db.query(EvaluationRun).filter(EvaluationRun.id == baseline.run_id).first()

    # Fetch per-case results for both runs
    baseline_results = {
        r.test_case_id: r
        for r in db.query(EvaluationResult).filter(EvaluationResult.run_id == baseline.run_id).all()
    }
    current_results = {
        r.test_case_id: r
        for r in db.query(EvaluationResult).filter(EvaluationResult.run_id == current_run_id).all()
    }

    new_failures = []
    resolved_failures = []
    regressions = []
    improvements = []
    new_hallucinations = []
    case_comparisons = []

    for tc_id, cur in current_results.items():
        base = baseline_results.get(tc_id)
        if base is None:
            continue

        was_passing = base.passed
        now_passing = cur.passed
        score_drop = round(base.overall_score - cur.overall_score, 3)

        status_change = "MAINTAINED_PASS" if (was_passing and now_passing) else (
            "MAINTAINED_FAIL" if (not was_passing and not now_passing) else (
                "REGRESSED" if (was_passing and not now_passing) else "RESOLVED"
            )
        )

        has_new_hallucination = not base.hallucination_detected and cur.hallucination_detected

        if was_passing and not now_passing:
            new_failures.append(tc_id)
        elif not was_passing and now_passing:
            resolved_failures.append(tc_id)

        if has_new_hallucination:
            new_hallucinations.append(tc_id)

        if score_drop > threshold_delta:
            regressions.append({
                "test_case_id": tc_id,
                "baseline_score": base.overall_score,
                "current_score": cur.overall_score,
                "drop": score_drop,
            })
        elif score_drop < -threshold_delta:
            improvements.append({
                "test_case_id": tc_id,
                "baseline_score": base.overall_score,
                "current_score": cur.overall_score,
                "gain": round(-score_drop, 3),
            })

        case_comparisons.append({
            "test_case_id": tc_id,
            "prompt": cur.prompt[:100],
            "category": cur.category,
            "baseline_passed": base.passed,
            "current_passed": cur.passed,
            "baseline_score": base.overall_score,
            "current_score": cur.overall_score,
            "score_delta": round(cur.overall_score - base.overall_score, 3),
            "status_change": status_change,
            "new_hallucination": has_new_hallucination,
            "baseline_output": base.actual_output,
            "current_output": cur.actual_output,
        })

    score_delta = round(current_run.avg_score - baseline.avg_score, 3)
    pass_rate_delta = round(current_run.pass_rate - baseline.pass_rate, 1)
    regression_detected = len(new_failures) > 0 or score_delta < -threshold_delta or len(new_hallucinations) > 0

    total_matched = len(case_comparisons)
    regression_percentage = round((len(regressions) / total_matched) * 100, 1) if total_matched else 0.0

    details = {
        "baseline_name": baseline.name,
        "baseline_model": baseline.model_name,
        "current_model": current_run.model_name,
        "baseline_avg_score": baseline.avg_score,
        "current_avg_score": current_run.avg_score,
        "previous_overall_score": baseline.avg_score,
        "current_overall_score": current_run.avg_score,
        "score_difference": score_delta,
        "baseline_pass_rate": baseline.pass_rate,
        "current_pass_rate": current_run.pass_rate,
        "tests_passed_previously": baseline_run.passed_cases if baseline_run else 0,
        "tests_passed_currently": current_run.passed_cases,
        "total_matched_cases": total_matched,
        "new_failures_count": len(new_failures),
        "new_failure_ids": new_failures,
        "resolved_failures_count": len(resolved_failures),
        "resolved_failure_ids": resolved_failures,
        "new_hallucinations_count": len(new_hallucinations),
        "new_hallucination_ids": new_hallucinations,
        "regressed_cases_count": len(regressions),
        "regressions": regressions,
        "improved_cases_count": len(improvements),
        "improvements": improvements,
        "regression_percentage": regression_percentage,
        "threshold_delta": threshold_delta,
        "case_comparisons": case_comparisons,
    }

    comp = RegressionComparison(
        id=_new_id("rc_"),
        baseline_id=baseline_id,
        current_run_id=current_run_id,
        score_delta=score_delta,
        pass_rate_delta=pass_rate_delta,
        new_failures=len(new_failures),
        resolved_failures=len(resolved_failures),
        regression_detected=regression_detected,
        details=details,
    )
    db.add(comp)
    db.commit()
    db.refresh(comp)
    return _comp_to_dict(comp)


def get_comparison(db: Session, comparison_id: str) -> Optional[Dict]:
    comp = db.query(RegressionComparison).filter(RegressionComparison.id == comparison_id).first()
    return _comp_to_dict(comp) if comp else None


def _bl_to_dict(b: RegressionBaseline) -> Dict:
    return {
        "id": b.id,
        "name": b.name,
        "run_id": b.run_id,
        "dataset_id": b.dataset_id,
        "model_name": b.model_name,
        "avg_score": b.avg_score,
        "pass_rate": b.pass_rate,
        "total_cases": b.total_cases,
        "created_at": b.created_at.isoformat() if b.created_at else "",
    }


def _comp_to_dict(c: RegressionComparison) -> Dict:
    return {
        "id": c.id,
        "baseline_id": c.baseline_id,
        "current_run_id": c.current_run_id,
        "score_delta": c.score_delta,
        "pass_rate_delta": c.pass_rate_delta,
        "new_failures": c.new_failures,
        "resolved_failures": c.resolved_failures,
        "regression_detected": c.regression_detected,
        "details": c.details or {},
        "created_at": c.created_at.isoformat() if c.created_at else "",
    }
