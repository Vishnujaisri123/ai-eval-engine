import csv
import html
import io
import json
from datetime import datetime
from typing import Any, Dict

from sqlalchemy.orm import Session

from app.models import EvaluationResult, EvaluationRun


def get_report_data(db: Session, run_id: str) -> Dict[str, Any]:
    run = db.query(EvaluationRun).filter(EvaluationRun.id == run_id).first()
    if not run:
        return {"error": "Run not found"}
    results = db.query(EvaluationResult).filter(EvaluationResult.run_id == run_id).all()
    return {
        "run_id": run.id,
        "dataset_name": run.dataset_name,
        "model_name": run.model_name,
        "provider": run.provider,
        "status": run.status,
        "summary": {
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
        },
        "created_at": run.created_at.isoformat() if run.created_at else "",
        "results": [
            {
                "id": r.id,
                "test_case_id": r.test_case_id,
                "category": r.category,
                "prompt": r.prompt,
                "actual_output": r.actual_output,
                "expected_output": r.expected_output,
                "metrics": {
                    "accuracy": r.accuracy,
                    "relevance": r.relevance,
                    "groundedness": r.groundedness,
                    "semantic_similarity": r.semantic_similarity,
                    "instruction_following": r.instruction_following,
                    "overall_score": r.overall_score,
                },
                "judge_verdict": r.judge_verdict,
                "judge_reasoning": r.judge_reasoning,
                "is_llm_judge": r.is_llm_judge,
                "hallucination_detected": r.hallucination_detected,
                "hallucination_reasons": r.hallucination_reasons or [],
                "passed": r.passed,
                "latency_ms": r.latency_ms,
                "tokens": r.tokens,
                "error": r.error or "",
            }
            for r in results
        ],
    }


def export_csv(db: Session, run_id: str) -> str:
    data = get_report_data(db, run_id)
    if "error" in data:
        return ""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "test_case_id", "category", "prompt", "actual_output", "expected_output",
        "accuracy", "relevance", "groundedness", "semantic_similarity",
        "instruction_following", "overall_score",
        "hallucination_detected", "hallucination_reasons", "judge_verdict", "passed", "latency_ms"
    ])
    for r in data["results"]:
        m = r["metrics"]
        writer.writerow([
            r["test_case_id"], r["category"], r["prompt"], r["actual_output"], r["expected_output"],
            m["accuracy"], m["relevance"], m["groundedness"], m["semantic_similarity"],
            m.get("instruction_following", 1.0), m["overall_score"],
            r["hallucination_detected"], ";".join(r["hallucination_reasons"]),
            r.get("judge_verdict", "none"), r["passed"], r["latency_ms"],
        ])
    return output.getvalue()


def export_html(db: Session, run_id: str) -> str:
    data = get_report_data(db, run_id)
    if "error" in data:
        return "<p>Report not found</p>"
    s = data["summary"]
    rows = ""
    for r in data["results"]:
        m = r["metrics"]
        badge = (
            '<span style="background:rgba(74,222,128,0.15);color:#4ade80;padding:2px 8px;border-radius:4px;font-weight:600;">PASS</span>'
            if r["passed"]
            else '<span style="background:rgba(248,113,113,0.15);color:#f87171;padding:2px 8px;border-radius:4px;font-weight:600;">FAIL</span>'
        )
        hal_badge = (
            '<span style="color:#f87171;font-weight:600;">YES</span>'
            if r["hallucination_detected"]
            else '<span style="color:#64748b;">No</span>'
        )
        rows += f"""<tr>
            <td style="font-weight:600;color:#38bdf8;">{html.escape(str(r['test_case_id']))}</td>
            <td>{html.escape(str(r['category']))}</td>
            <td style="max-width:250px;">{html.escape(str(r['prompt']))}</td>
            <td style="max-width:320px;color:#cbd5e1;">{html.escape(str(r['actual_output']))}</td>
            <td>{m['accuracy']}</td>
            <td>{m['relevance']}</td>
            <td>{m['groundedness']}</td>
            <td>{m['semantic_similarity']}</td>
            <td style="font-weight:700;color:#f1f5f9;">{m['overall_score']}</td>
            <td>{hal_badge}</td>
            <td>{badge}</td>
        </tr>"""

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>AI Quality Evaluation Report - {html.escape(run_id)}</title>
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b1120; color: #f1f5f9; padding: 40px; margin: 0; }}
  .container {{ max-width: 1400px; margin: 0 auto; }}
  .header {{ margin-bottom: 24px; border-bottom: 1px solid #334155; padding-bottom: 20px; }}
  .header h1 {{ font-size: 24px; color: #38bdf8; margin: 0 0 6px 0; }}
  .header p {{ color: #94a3b8; font-size: 13px; margin: 0; }}
  .cards {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 30px; }}
  .card {{ background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 18px; }}
  .card .label {{ font-size: 11px; text-transform: uppercase; color: #94a3b8; font-weight: 600; letter-spacing: 0.5px; }}
  .card .val {{ font-size: 26px; font-weight: 700; color: #f1f5f9; margin-top: 4px; }}
  table {{ width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 8px; overflow: hidden; }}
  th, td {{ padding: 12px 14px; text-align: left; font-size: 13px; border-bottom: 1px solid #334155; }}
  th {{ background: #0f172a; color: #94a3b8; font-weight: 600; text-transform: uppercase; font-size: 11px; }}
  tr:hover {{ background: #263347; }}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>AI Quality Evaluation Report</h1>
    <p>Run ID: <strong>{html.escape(run_id)}</strong> | Dataset: <strong>{html.escape(data.get('dataset_name', ''))}</strong> | Model: <strong>{html.escape(data.get('model_name', ''))}</strong> | Provider: <strong>{html.escape(data.get('provider', ''))}</strong> | Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
  </div>
  <div class="cards">
    <div class="card"><div class="label">Total Cases</div><div class="val">{s['total_cases']}</div></div>
    <div class="card"><div class="label">Pass Rate</div><div class="val" style="color:#4ade80;">{s['pass_rate']}%</div></div>
    <div class="card"><div class="label">Avg Quality Score</div><div class="val" style="color:#38bdf8;">{s['avg_score']}</div></div>
    <div class="card"><div class="label">Hallucinations</div><div class="val" style="color:{'#f87171' if s['hallucination_count'] > 0 else '#4ade80'};">{s['hallucination_count']}</div></div>
    <div class="card"><div class="label">Avg Latency</div><div class="val">{s['avg_latency_ms']} ms</div></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Case ID</th>
        <th>Category</th>
        <th>Prompt</th>
        <th>Actual Response</th>
        <th>Accuracy</th>
        <th>Relevance</th>
        <th>Groundedness</th>
        <th>Semantic</th>
        <th>Overall</th>
        <th>Hallucination</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      {rows}
    </tbody>
  </table>
</div>
</body>
</html>"""
