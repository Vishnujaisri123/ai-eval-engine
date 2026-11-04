import json
import re
from pathlib import Path
from typing import Dict, Any, List, Optional, Union

BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_MULTITURN_DATASET_PATH = BASE_DIR / "datasets" / "multiturn_dataset.json"


class MultiTurnToolEvaluator:
    """
    Evaluates multi-turn conversational memory, tool selection accuracy,
    parameter extraction, and tool error recovery.
    """

    @staticmethod
    def evaluate_tool_call(
        expected_tool: Optional[Dict[str, Any]], actual_tool: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Validates tool name and exact parameter arguments."""
        if expected_tool is None and actual_tool is None:
            return {"tool_passed": True, "reason": "No tool call expected or made"}
        if expected_tool is None and actual_tool is not None:
            return {
                "tool_passed": False,
                "reason": f"Unexpected tool call executed: {actual_tool.get('name')}",
            }
        if expected_tool is not None and actual_tool is None:
            return {
                "tool_passed": False,
                "reason": f"Expected tool call missing: {expected_tool.get('name')}",
            }

        exp_name = expected_tool.get("name")
        act_name = actual_tool.get("name")
        if exp_name != act_name:
            return {
                "tool_passed": False,
                "reason": f"Tool name mismatch: expected {exp_name}, got {act_name}",
            }

        exp_args = expected_tool.get("arguments", {})
        act_args = actual_tool.get("arguments", {})
        if exp_args != act_args:
            return {
                "tool_passed": False,
                "reason": f"Argument mismatch: expected {exp_args}, got {act_args}",
            }

        return {"tool_passed": True, "reason": "Tool name and arguments matched exactly"}

    @staticmethod
    def _contains_keyword(keyword: str, text: str) -> bool:
        """
        Matches keywords while handling plurals, spaces, and hyphens
        (e.g., '2 hours' matches '2-hour' or '2 hours').
        """
        kw_norm = re.sub(r"s\b", "", keyword.lower().replace("-", " "))
        text_norm = re.sub(r"s\b", "", text.lower().replace("-", " "))
        return kw_norm in text_norm

    def evaluate_conversation_turn(self, turn: Dict[str, Any]) -> Dict[str, Any]:
        """Evaluates memory retention and tool execution for a single dialogue turn."""
        turn_id = turn.get("turn_id", 1)
        user_message = turn.get("user_message", "")
        expected_tool = turn.get("expected_tool")
        actual_tool = turn.get("actual_tool")
        expected_keywords = turn.get("expected_keywords", [])
        actual_response = turn.get("actual_response", "")

        tool_result = self.evaluate_tool_call(expected_tool, actual_tool)

        matched_kw = sum(
            1 for kw in expected_keywords if self._contains_keyword(kw, actual_response)
        )
        memory_retention_score = (
            round(matched_kw / len(expected_keywords), 2)
            if expected_keywords
            else 1.0
        )

        passed = tool_result["tool_passed"] and (memory_retention_score >= 0.70)

        return {
            "turn_id": turn_id,
            "user_message": user_message,
            "actual_response": actual_response,
            "tool_result": tool_result,
            "memory_retention_score": memory_retention_score,
            "passed": passed,
        }

    def evaluate_dialogue_session(self, session: Dict[str, Any]) -> Dict[str, Any]:
        session_id = session.get("session_id", "SESSION-01")
        scenario = session.get("scenario", "iot_smart_control")
        turns = session.get("turns", [])

        turn_results = [self.evaluate_conversation_turn(t) for t in turns]
        all_passed = all(r["passed"] for r in turn_results)

        return {
            "session_id": session_id,
            "scenario": scenario,
            "total_turns": len(turns),
            "all_turns_passed": all_passed,
            "turn_results": turn_results,
        }

    def evaluate_dataset(
        self, dataset_path: Optional[Union[str, Path]] = None
    ) -> Dict[str, Any]:
        path = Path(dataset_path) if dataset_path else DEFAULT_MULTITURN_DATASET_PATH
        if not path.is_absolute() and not path.exists():
            path = BASE_DIR / path

        with open(path, "r", encoding="utf-8") as f:
            sessions = json.load(f)

        results = [self.evaluate_dialogue_session(s) for s in sessions]
        total_sessions = len(results)
        passed_sessions = sum(1 for r in results if r["all_turns_passed"])

        return {
            "summary": {
                "total_dialogue_sessions": total_sessions,
                "passed_sessions": passed_sessions,
                "failed_sessions": total_sessions - passed_sessions,
                "session_pass_rate": round((passed_sessions / total_sessions) * 100, 1)
                if total_sessions > 0
                else 0.0,
            },
            "results": results,
        }


if __name__ == "__main__":
    evaluator = MultiTurnToolEvaluator()
    report = evaluator.evaluate_dataset()
    print("\n=== ATOMBERG MULTI-TURN & TOOL EVALUATION SUMMARY ===")
    print(json.dumps(report["summary"], indent=2))