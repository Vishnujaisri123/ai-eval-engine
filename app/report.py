import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any

from app.evaluator import AIQualityEvaluator


class ReportGenerator:
    """
    Generates machine-readable JSON reports and executive HTML dashboards
    from AIQualityEvaluator regression runs.
    """

    def __init__(self, output_dir: str = "reports"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def save_json_report(
        self, evaluation_data: Dict[str, Any], filename: str = "evaluation_report.json"
    ) -> Path:
        """Saves structured evaluation summary and case metrics as a JSON artifact."""
        report_payload = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            **evaluation_data,
        }
        output_path = self.output_dir / filename
        with open(output_path, "w", encoding="utf-8") as file:
            json.dump(report_payload, file, indent=2)
        return output_path

    def save_html_report(
        self, evaluation_data: Dict[str, Any], filename: str = "evaluation_report.html"
    ) -> Path:
        """Generates a standalone visual HTML dashboard for engineering review."""
        summary = evaluation_data["summary"]
        results = evaluation_data["results"]
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        rows_html = ""
        for item in results:
            metrics = item["metrics"]
            if item["passed"]:
                badge = '<span class="badge pass">PASS</span>'
            elif item["hallucination_detected"]:
                badge = '<span class="badge fail">HALLUCINATION</span>'
            else:
                badge = '<span class="badge fail">FAIL</span>'

            rows_html += f"""
            <tr>
                <td><strong>{item['id']}</strong></td>
                <td>{item['category']}</td>
                <td>{item['prompt']}</td>
                <td>{item['actual_output']}</td>
                <td>{metrics['accuracy']}</td>
                <td>{metrics['relevance']}</td>
                <td>{metrics['groundedness']}</td>
                <td><strong>{metrics['overall_score']}</strong></td>
                <td>{badge}</td>
            </tr>
            """

        html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Atomberg AI Quality Evaluation Report</title>
    <style>
        body {{ font-family: 'Segoe UI', system-ui, sans-serif; background: #0b1120; color: #e2e8f0; margin: 0; padding: 32px; }}
        .container {{ max-width: 1200px; margin: 0 auto; }}
        h1 {{ color: #38bdf8; margin-bottom: 4px; }}
        .timestamp {{ color: #94a3b8; font-size: 14px; margin-bottom: 24px; }}
        .cards {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 32px; }}
        .card {{ background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 18px; text-align: center; }}
        .card .label {{ font-size: 13px; color: #94a3b8; text-transform: uppercase; }}
        .card .value {{ font-size: 28px; font-weight: 700; margin-top: 8px; color: #f8fafc; }}
        table {{ width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 10px; overflow: hidden; }}
        th, td {{ padding: 12px 14px; text-align: left; border-bottom: 1px solid #334155; font-size: 14px; }}
        th {{ background: #0f172a; color: #38bdf8; text-transform: uppercase; font-size: 12px; }}
        .badge {{ padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; }}
        .badge.pass {{ background: rgba(34, 197, 94, 0.2); color: #4ade80; border: 1px solid #22c55e; }}
        .badge.fail {{ background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid #ef4444; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>Atomberg AI Quality & Regression Report</h1>
        <div class="timestamp">Generated: {timestamp}</div>
        <div class="cards">
            <div class="card"><div class="label">Total Cases</div><div class="value">{summary['total_cases']}</div></div>
            <div class="card"><div class="label">Pass Rate</div><div class="value">{summary['pass_rate']}%</div></div>
            <div class="card"><div class="label">Avg Quality Score</div><div class="value">{summary['average_quality_score']}</div></div>
            <div class="card"><div class="label">Hallucinations Caught</div><div class="value">{summary['hallucinations_detected']}</div></div>
        </div>
        <table>
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Category</th>
                    <th>Prompt</th>
                    <th>Actual AI Output</th>
                    <th>Acc</th>
                    <th>Rel</th>
                    <th>Grd</th>
                    <th>Score</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                {rows_html}
            </tbody>
        </table>
    </div>
</body>
</html>"""

        output_path = self.output_dir / filename
        with open(output_path, "w", encoding="utf-8") as file:
            file.write(html_content)
        return output_path


if __name__ == "__main__":
    evaluator = AIQualityEvaluator()
    eval_data = evaluator.evaluate_dataset("datasets/golden_dataset.json")

    generator = ReportGenerator(output_dir="reports")
    json_path = generator.save_json_report(eval_data)
    html_path = generator.save_html_report(eval_data)

    print(f"JSON Report saved to: {json_path.resolve()}")
    print(f"HTML Report saved to: {html_path.resolve()}")