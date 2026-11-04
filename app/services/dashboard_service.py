from typing import Any, Dict, List
from collections import defaultdict
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import EvaluationResult, EvaluationRun, RegressionComparison, SafetyResult, SafetyRun


def get_summary(db: Session) -> Dict[str, Any]:
    total_runs = db.query(func.count(EvaluationRun.id)).scalar() or 0
    total_cases = db.query(func.sum(EvaluationRun.total_cases)).scalar() or 0
    avg_score_row = db.query(func.avg(EvaluationRun.avg_score)).filter(
        EvaluationRun.status == "completed"
    ).scalar()
    avg_score = round(float(avg_score_row), 3) if avg_score_row else 0.0

    avg_pass_rate_row = db.query(func.avg(EvaluationRun.pass_rate)).filter(
        EvaluationRun.status == "completed"
    ).scalar()
    pass_rate = round(float(avg_pass_rate_row), 1) if avg_pass_rate_row else 0.0

    failed_count = db.query(func.sum(EvaluationRun.failed_cases)).scalar() or 0
    hallucination_count = db.query(func.sum(EvaluationRun.hallucination_count)).scalar() or 0
    regression_count = db.query(func.count(RegressionComparison.id)).filter(
        RegressionComparison.regression_detected == True  # noqa: E712
    ).scalar() or 0
    safety_failure_count = db.query(func.sum(SafetyRun.failed_cases)).scalar() or 0

    return {
        "total_runs": int(total_runs),
        "total_test_cases": int(total_cases),
        "avg_score": avg_score,
        "pass_rate": pass_rate,
        "failed_count": int(failed_count),
        "regression_count": int(regression_count),
        "safety_failure_count": int(safety_failure_count or 0),
        "hallucination_count": int(hallucination_count),
    }


def get_recent_activity(db: Session, limit: int = 10) -> List[Dict]:
    runs = db.query(EvaluationRun).order_by(EvaluationRun.created_at.desc()).limit(limit).all()
    return [
        {
            "id": r.id,
            "type": "evaluation",
            "dataset_name": r.dataset_name,
            "model_name": r.model_name,
            "provider": r.provider,
            "status": r.status,
            "total_cases": r.total_cases,
            "passed_cases": r.passed_cases,
            "failed_cases": r.failed_cases,
            "pass_rate": r.pass_rate,
            "avg_score": r.avg_score,
            "created_at": r.created_at.isoformat() if r.created_at else "",
        }
        for r in runs
    ]


def get_analytics(db: Session) -> Dict[str, Any]:
    runs = db.query(EvaluationRun).filter(
        EvaluationRun.status == "completed"
    ).order_by(EvaluationRun.created_at.asc()).all()

    score_over_time = [
        {
            "date": r.created_at.strftime("%b %d, %H:%M") if r.created_at else "",
            "avg_score": r.avg_score,
            "pass_rate": r.pass_rate,
            "run_id": r.id,
            "name": f"{r.dataset_name or 'Run'} ({r.model_name})",
        }
        for r in runs
    ]

    total_passed = sum(r.passed_cases for r in runs)
    total_failed = sum(r.failed_cases for r in runs)

    # Model performance comparison
    model_perf: Dict[str, Dict] = {}
    for r in runs:
        key = r.model_name or "unknown"
        if key not in model_perf:
            model_perf[key] = {"scores": [], "pass_rates": [], "latencies": [], "runs": 0}
        model_perf[key]["scores"].append(r.avg_score)
        model_perf[key]["pass_rates"].append(r.pass_rate)
        if r.avg_latency_ms:
            model_perf[key]["latencies"].append(r.avg_latency_ms)
        model_perf[key]["runs"] += 1

    model_comparison = [
        {
            "model": k,
            "avg_score": round(sum(v["scores"]) / len(v["scores"]), 3),
            "avg_pass_rate": round(sum(v["pass_rates"]) / len(v["pass_rates"]), 1),
            "avg_latency": round(sum(v["latencies"]) / len(v["latencies"]), 1) if v["latencies"] else 0.0,
            "runs": v["runs"],
        }
        for k, v in model_perf.items()
    ]

    # Category breakdown from evaluation results
    cat_stats = defaultdict(lambda: {"scores": [], "passed": 0, "total": 0})
    eval_results = db.query(EvaluationResult).all()
    for res in eval_results:
        cat = res.category or "general"
        cat_stats[cat]["scores"].append(res.overall_score)
        cat_stats[cat]["total"] += 1
        if res.passed:
            cat_stats[cat]["passed"] += 1

    category_breakdown = [
        {
            "category": cat,
            "avg_score": round(sum(d["scores"]) / len(d["scores"]), 2) if d["scores"] else 0.0,
            "pass_rate": round((d["passed"] / d["total"]) * 100, 1) if d["total"] else 0.0,
            "total_cases": d["total"],
        }
        for cat, d in cat_stats.items()
    ]

    # Safety breakdown
    safety_results = db.query(SafetyResult).all()
    safety_by_attack = defaultdict(lambda: {"passed": 0, "failed": 0})
    for sr in safety_results:
        att = sr.attack_type or "general"
        if sr.passed:
            safety_by_attack[att]["passed"] += 1
        else:
            safety_by_attack[att]["failed"] += 1

    safety_breakdown = [
        {
            "attack_type": att,
            "passed": d["passed"],
            "failed": d["failed"],
            "total": d["passed"] + d["failed"],
        }
        for att, d in safety_by_attack.items()
    ]

    return {
        "score_over_time": score_over_time,
        "pass_fail_distribution": {"passed": total_passed, "failed": total_failed},
        "model_comparison": model_comparison,
        "category_breakdown": category_breakdown,
        "safety_breakdown": safety_breakdown,
    }
