import json
from pathlib import Path
from typing import Dict, Any, List

from app.metrics import (
    calculate_accuracy,
    calculate_relevance,
    calculate_groundedness,
    detect_hallucination,
)


class AIQualityEvaluator:
    """
    Reusable OOP Evaluation Engine that scores AI responses on Accuracy,
    Relevance, and Groundedness, and flags Hallucinations.
    """

    def __init__(
        self,
        pass_threshold: float = 0.70,
        groundedness_threshold: float = 0.60,
    ):
        # Store thresholds as instance attributes so each evaluator instance is configurable
        self.pass_threshold = pass_threshold
        self.groundedness_threshold = groundedness_threshold

    def evaluate_case(self, test_case: Dict[str, Any]) -> Dict[str, Any]:
        """
        Evaluates a single test case dictionary and returns a structured result.
        """
        case_id = test_case.get("id", "CUSTOM")
        category = test_case.get("category", "general")
        prompt = test_case.get("prompt", "")
        context = test_case.get("context", "")
        expected_output = test_case.get("expected_output", "")
        expected_keywords = test_case.get("expected_keywords", [])
        actual_output = test_case.get("actual_output", "")

        # 1. Compute individual metrics
        accuracy = calculate_accuracy(actual_output, expected_keywords)
        relevance = calculate_relevance(prompt, expected_output, actual_output)
        groundedness = calculate_groundedness(context, actual_output)

        # 2. Check for hallucination
        hallucinated = detect_hallucination(
            groundedness, threshold=self.groundedness_threshold
        )

        # 3. Compute overall weighted quality score (equal 1/3 weight each)
        overall_score = round((accuracy + relevance + groundedness) / 3.0, 2)

        # 4. A test case passes ONLY if overall_score >= pass_threshold AND it did NOT hallucinate
        passed = (overall_score >= self.pass_threshold) and (not hallucinated)

        return {
            "id": case_id,
            "category": category,
            "prompt": prompt,
            "actual_output": actual_output,
            "metrics": {
                "accuracy": accuracy,
                "relevance": relevance,
                "groundedness": groundedness,
                "overall_score": overall_score,
            },
            "hallucination_detected": hallucinated,
            "passed": passed,
        }

    def load_dataset(self, dataset_path: str = "datasets/golden_dataset.json") -> List[Dict[str, Any]]:
        """
        Loads the Golden Dataset JSON file from disk.
        """
        path = Path(dataset_path)
        if not path.exists():
            raise FileNotFoundError(f"Golden dataset not found at: {path.resolve()}")

        with open(path, "r", encoding="utf-8") as file:
            return json.load(file)

    def evaluate_dataset(self, dataset_path: str = "datasets/golden_dataset.json") -> Dict[str, Any]:
        """
        Runs evaluation across the entire Golden Dataset and returns a full summary.
        """
        dataset = self.load_dataset(dataset_path)
        results = [self.evaluate_case(case) for case in dataset]

        total_cases = len(results)
        passed_cases = sum(1 for r in results if r["passed"])
        failed_cases = total_cases - passed_cases
        hallucination_count = sum(1 for r in results if r["hallucination_detected"])

        avg_score = (
            round(sum(r["metrics"]["overall_score"] for r in results) / total_cases, 2)
            if total_cases > 0
            else 0.0
        )

        return {
            "summary": {
                "total_cases": total_cases,
                "passed_cases": passed_cases,
                "failed_cases": failed_cases,
                "pass_rate": round((passed_cases / total_cases) * 100, 1) if total_cases > 0 else 0.0,
                "average_quality_score": avg_score,
                "hallucinations_detected": hallucination_count,
            },
            "results": results,
        }


# Allow running `python -m app.evaluator` directly from terminal for a quick CLI check
if __name__ == "__main__":
    evaluator = AIQualityEvaluator()
    report = evaluator.evaluate_dataset()
    print("\n=== ATOMBERG AI QUALITY EVALUATION SUMMARY ===")
    print(json.dumps(report["summary"], indent=2))
    print("\n=== INDIVIDUAL TEST CASE RESULTS ===")
    for item in report["results"]:
        status = "PASS" if item["passed"] else "FAIL (HALLUCINATION)" if item["hallucination_detected"] else "FAIL"
        print(
            f"[{item['id']}] {status} | Score: {item['metrics']['overall_score']} "
            f"(Acc: {item['metrics']['accuracy']}, Rel: {item['metrics']['relevance']}, Grd: {item['metrics']['groundedness']})"
        )