import uuid
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.generator import LLMResponseGenerator
from app.models import SafetyRun, SafetyResult
from app.safety import AISafetyEvaluator


def _new_id(prefix: str = "") -> str:
    return f"{prefix}{uuid.uuid4().hex[:12]}"


def run_safety_evaluation(
    db: Session,
    model_name: str = "",
    provider: str = "",
    use_live_generator: bool = False,
    dataset_path: Optional[str] = None,
) -> Dict[str, Any]:
    effective_provider = provider or ("auto" if use_live_generator else "deterministic")
    effective_model = model_name or ("live_model" if use_live_generator else "deterministic_safety_suite")

    generator = LLMResponseGenerator(
        provider=effective_provider,
        model=effective_model,
    )
    evaluator = AISafetyEvaluator(generator=generator)
    report = evaluator.evaluate_safety_dataset(
        dataset_path=dataset_path,
        use_live_generator=use_live_generator,
    )

    run = SafetyRun(
        id=_new_id("sr_"),
        model_name=effective_model,
        provider=effective_provider,
        total_cases=report["summary"]["total_safety_cases"],
        passed_cases=report["summary"]["passed_safety_cases"],
        failed_cases=report["summary"]["failed_safety_cases"],
        pass_rate=report["summary"]["safety_pass_rate"],
    )
    db.add(run)

    for r in report["results"]:
        sr = SafetyResult(
            id=_new_id("sres_"),
            run_id=run.id,
            case_id=r["id"],
            attack_type=r["attack_type"],
            prompt=r["prompt"],
            actual_output=r["actual_output"],
            expected_safe_behavior=r.get("expected_safe_behavior", "Safe refusal or policy adherence"),
            passed=r["passed"],
            violations=r["violations"],
            severity=r.get("severity", "low"),
            explanation=r.get("explanation", ""),
        )
        db.add(sr)

    db.commit()
    db.refresh(run)

    return {
        "id": run.id,
        "model_name": run.model_name,
        "provider": run.provider,
        "total_cases": run.total_cases,
        "passed_cases": run.passed_cases,
        "failed_cases": run.failed_cases,
        "pass_rate": run.pass_rate,
        "created_at": run.created_at.isoformat() if run.created_at else "",
        "results": report["results"],
    }


def list_safety_runs(db: Session) -> List[Dict]:
    runs = db.query(SafetyRun).order_by(SafetyRun.created_at.desc()).all()
    return [
        {
            "id": r.id,
            "model_name": r.model_name,
            "provider": r.provider,
            "total_cases": r.total_cases,
            "passed_cases": r.passed_cases,
            "failed_cases": r.failed_cases,
            "pass_rate": r.pass_rate,
            "created_at": r.created_at.isoformat() if r.created_at else "",
        }
        for r in runs
    ]


def get_safety_run(db: Session, run_id: str) -> Optional[Dict]:
    run = db.query(SafetyRun).filter(SafetyRun.id == run_id).first()
    if not run:
        return None
    return {
        "id": run.id,
        "model_name": run.model_name,
        "provider": run.provider,
        "total_cases": run.total_cases,
        "passed_cases": run.passed_cases,
        "failed_cases": run.failed_cases,
        "pass_rate": run.pass_rate,
        "created_at": run.created_at.isoformat() if run.created_at else "",
        "results": [
            {
                "id": sr.id,
                "case_id": sr.case_id,
                "attack_type": sr.attack_type,
                "prompt": sr.prompt,
                "actual_output": sr.actual_output,
                "expected_safe_behavior": sr.expected_safe_behavior,
                "passed": sr.passed,
                "violations": sr.violations or [],
                "severity": sr.severity,
                "explanation": sr.explanation,
            }
            for sr in run.results
        ],
    }
