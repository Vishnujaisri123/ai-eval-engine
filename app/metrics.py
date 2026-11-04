import re
from typing import List, Set, Dict, Any

STOP_WORDS: Set[str] = {
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "in", "on", "at", "to", "for", "with", "by", "about", "of", "and", "or",
    "can", "i", "you", "it", "this", "that", "does", "do", "what", "how",
    "much", "up", "after", "via", "plus", "all", "upon", "yes"
}

NEGATION_TERMS: Set[str] = {
    "no", "not", "never", "none", "without", "cannot", "cant", "doesnt", "dont", "isnt"
}


def tokenize(text: str) -> Set[str]:
    """Extracts meaningful lowercase alphanumeric tokens, excluding filler stop words."""
    if not text:
        return set()
    words = re.findall(r"[a-z0-9]+(?:-[a-z0-9]+)*", text.lower())
    return {w for w in words if w not in STOP_WORDS}


def extract_numbers(text: str) -> Set[str]:
    """Extracts numeric values and units (e.g., '28w', '65%', '2-year', '50w', '4k')."""
    if not text:
        return set()
    return set(re.findall(r"\b\d+[a-z%0-9-]*\b", text.lower()))


def has_negation_conflict(context: str, expected_output: str, actual_output: str) -> bool:
    """
    Detects contradiction when the reference/context explicitly negates a claim
    (e.g., 'No, it does not have a speaker') while the actual output affirms it
    (e.g., 'Yes! It comes with a speaker').
    """
    expected_lower = expected_output.lower().strip()
    actual_lower = actual_output.lower().strip()

    # Check direct affirmative vs negative opening conflict
    expected_starts_negative = expected_lower.startswith(("no", "no,"))
    actual_starts_affirmative = actual_lower.startswith(("yes", "yes,", "yes!"))
    if expected_starts_negative and actual_starts_affirmative:
        return True

    expected_starts_affirmative = expected_lower.startswith(("yes", "yes,"))
    actual_starts_negative = actual_lower.startswith(("no", "no,", "no!"))
    if expected_starts_affirmative and actual_starts_negative:
        return True

    # Check if context contains explicit negation ('does not have X') missing in actual output
    context_words = set(re.findall(r"[a-z]+", context.lower()))
    actual_words = set(re.findall(r"[a-z]+", actual_output.lower()))
    expected_words = set(re.findall(r"[a-z]+", expected_output.lower()))

    ref_has_negation = bool((context_words | expected_words) & NEGATION_TERMS)
    actual_has_negation = bool(actual_words & NEGATION_TERMS)

    if ref_has_negation and not actual_has_negation and expected_starts_negative:
        return True

    return False


def calculate_accuracy(actual_output: str, expected_keywords: List[str]) -> float:
    """Checks what fraction of required ground-truth keywords appear in actual_output."""
    if not expected_keywords:
        return 1.0

    actual_lower = actual_output.lower()
    matched = sum(1 for kw in expected_keywords if kw.lower() in actual_lower)
    return round(matched / len(expected_keywords), 2)


def calculate_relevance(prompt: str, expected_output: str, actual_output: str) -> float:
    """Measures topical alignment between the prompt/expected answer and actual output."""
    reference_tokens = tokenize(prompt) | tokenize(expected_output)
    actual_tokens = tokenize(actual_output)

    if not reference_tokens or not actual_tokens:
        return 0.0

    overlap = reference_tokens.intersection(actual_tokens)
    denom = len(tokenize(expected_output) or reference_tokens)
    score = len(overlap) / denom
    return round(min(score, 1.0), 2)


def calculate_groundedness(
    context: str, actual_output: str, expected_output: str = ""
) -> float:
    """
    Upgraded Groundedness Metric:
    Combines lexical support from context with penalties for fabricated numbers
    and negation contradictions.
    """
    context_tokens = tokenize(context)
    actual_tokens = tokenize(actual_output)

    if not actual_tokens or not context_tokens:
        return 0.0

    # 1. Base token support from context
    supported_tokens = actual_tokens.intersection(context_tokens)
    base_score = len(supported_tokens) / len(actual_tokens)

    # 2. Numeric fabrication penalty (e.g., claiming '50w' or '4k' when context says '28w')
    context_numbers = extract_numbers(context)
    actual_numbers = extract_numbers(actual_output)
    unverified_numbers = actual_numbers - context_numbers
    if unverified_numbers:
        base_score -= 0.25 * len(unverified_numbers)

    # 3. Negation / Contradiction penalty
    if expected_output and has_negation_conflict(context, expected_output, actual_output):
        base_score -= 0.40

    return round(max(0.0, min(base_score, 1.0)), 2)


def evaluate_hallucination_risk(
    context: str,
    expected_output: str,
    actual_output: str,
    groundedness_score: float,
    threshold: float = 0.60,
) -> Dict[str, Any]:
    """
    Multi-signal Hallucination Detector (Fixes Review Issue #3):
    Flags hallucinations using three distinct signals:
    1. Low groundedness score (< threshold)
    2. Fabricated numbers/specs not present in context
    3. Direct negation/contradiction against ground truth
    """
    unverified_numbers = sorted(list(extract_numbers(actual_output) - extract_numbers(context)))
    contradiction = has_negation_conflict(context, expected_output, actual_output)
    low_groundedness = groundedness_score < threshold

    reasons = []
    if low_groundedness:
        reasons.append(f"low_groundedness ({groundedness_score} < {threshold})")
    if unverified_numbers:
        reasons.append(f"unverified_numbers: {unverified_numbers}")
    if contradiction:
        reasons.append("negation_contradiction_detected")

    return {
        "hallucination_detected": bool(reasons),
        "hallucination_reasons": reasons,
    }


def detect_hallucination(groundedness_score: float, threshold: float = 0.60) -> bool:
    """Backward-compatible helper for simple threshold checks."""
    return groundedness_score < threshold