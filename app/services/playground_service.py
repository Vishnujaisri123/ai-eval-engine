import uuid
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.generator import LLMResponseGenerator
from app.models import Dataset, PlaygroundHistory, TestCase


def _new_id(prefix: str = "pg_") -> str:
    return f"{prefix}{uuid.uuid4().hex[:12]}"


def run_playground(db: Session, payload: Dict[str, Any]) -> Dict[str, Any]:
    provider = payload.get("provider", "auto")
    model = payload.get("model", "llama3")
    temperature = float(payload.get("temperature", 0.2))

    generator = LLMResponseGenerator(
        provider=provider,
        model=model,
    )

    system_prompt = payload.get("system_prompt", "")
    context = payload.get("context", "")
    prompt = payload["prompt"]

    result = generator.generate(
        prompt=prompt,
        context=context,
        system_prompt=system_prompt,
        temperature=temperature,
        allow_offline_fallback=(provider in ("auto", "offline", "deterministic")),
    )

    telemetry = result.get("telemetry", {})
    history = PlaygroundHistory(
        id=_new_id("pg_"),
        prompt=prompt,
        system_prompt=system_prompt,
        context=context,
        response=result.get("actual_output", ""),
        provider=result.get("provider", provider),
        model_name=result.get("model", model),
        latency_ms=telemetry.get("latency_ms", 0.0),
        tokens=telemetry.get("total_tokens", 0),
    )
    db.add(history)
    db.commit()

    return {
        "response": result.get("actual_output", ""),
        "provider": result.get("provider", provider),
        "model": result.get("model", model),
        "error": result.get("error"),
        "success": result.get("success", True),
        "latency_ms": telemetry.get("latency_ms", 0.0),
        "tokens": telemetry.get("total_tokens", 0),
        "prompt_tokens": telemetry.get("prompt_tokens", 0),
        "completion_tokens": telemetry.get("completion_tokens", 0),
        "estimated_cost_usd": telemetry.get("estimated_cost_usd", 0.0),
        "history_id": history.id,
    }


def save_as_test_case(db: Session, dataset_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """Saves a playground prompt/response as a new test case in a dataset."""
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not ds:
        return {"error": "Target dataset not found"}

    tc = TestCase(
        id=f"tc_{uuid.uuid4().hex[:8]}",
        dataset_id=dataset_id,
        name=data.get("name") or f"Playground Test - {data.get('prompt', '')[:30]}",
        prompt=data["prompt"],
        system_instructions=data.get("system_prompt", ""),
        context=data.get("context", ""),
        expected_output=data.get("expected_output", ""),
        actual_output=data.get("actual_output") or data.get("response", ""),
        expected_keywords=data.get("expected_keywords", []),
        category=data.get("category", "playground"),
        threshold=float(data.get("threshold", 0.70)),
        tags=data.get("tags", ["playground"]),
    )
    db.add(tc)
    db.commit()
    db.refresh(tc)

    return {
        "id": tc.id,
        "dataset_id": tc.dataset_id,
        "name": tc.name,
        "prompt": tc.prompt,
        "category": tc.category,
    }


def get_history(db: Session, limit: int = 30):
    rows = db.query(PlaygroundHistory).order_by(PlaygroundHistory.created_at.desc()).limit(limit).all()
    return [
        {
            "id": r.id,
            "prompt": r.prompt,
            "system_prompt": r.system_prompt,
            "context": r.context,
            "response": r.response,
            "provider": r.provider,
            "model_name": r.model_name,
            "latency_ms": r.latency_ms,
            "tokens": r.tokens,
            "created_at": r.created_at.isoformat() if r.created_at else "",
        }
        for r in rows
    ]
