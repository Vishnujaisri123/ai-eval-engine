import re
from typing import List, Set, Dict, Any

STOP_WORDS: Set[str] = {
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "in", "on", "at", "to", "for", "with", "by", "about", "of", "and", "or",
    "can", "i", "you", "it", "this", "that", "does", "do", "what", "how",
    "much", "up", "after", "via", "plus", "all", "upon", "yes", "its", "driven", "runs", "on"
}

NEGATION_TERMS: Set[str] = {
    "no", "not", "never", "none", "without", "cannot", "cant", "doesnt", "dont", "isnt"
}

SYNONYM_MAP: Dict[str, str] = {
    "watts": "w",
    "watt": "w",
    "percent": "%",
    "percentage": "%",
    "power": "energy",
    "electricity": "energy",
    "consumes": "uses",
    "utilizes": "uses",
    "draws": "uses",
    "saves": "reduces",
    "reducing": "reduces",
    "reduction": "reduces",
    "top": "max",
    "maximum": "max",
    "speed": "velocity",
}


def tokenize(text: str) -> Set[str]:
    """Extracts meaningful lowercase alphanumeric tokens with domain synonym and unit normalization."""
    if not text:
        return set()
    norm = re.sub(r"[\u2000-\u200f\u2028-\u202f\xa0]", " ", text.lower())
    norm = re.sub(r"(\d+)[\s]+([a-z%])\b", r"\1\2", norm)
    words = re.findall(r"[a-z0-9]+(?:-[a-z0-9]+)*", norm)
    return {SYNONYM_MAP.get(w, w) for w in words if w not in STOP_WORDS}


def extract_numbers(text: str) -> Set[str]:
    """Extracts numeric values and units (e.g., '28w', '65%', '2-year', '50w', '4k')."""
    if not text:
        return set()
    norm_text = re.sub(r"(\d+)[\s\u2000-\u200f\u2028-\u202f\xa0]+([a-z%])\b", r"\1\2", text.lower())
    return set(re.findall(r"\b\d+[a-z%0-9-]*\b", norm_text))


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
    actual_collapsed = re.sub(r"[\s\u2000-\u200f\u2028-\u202f\xa0]+", "", actual_lower)

    matched = 0
    for kw in expected_keywords:
        kw_clean = kw.lower().strip()
        kw_collapsed = re.sub(r"[\s\u2000-\u200f\u2028-\u202f\xa0]+", "", kw_clean)
        if kw_clean in actual_lower or (kw_collapsed and kw_collapsed in actual_collapsed):
            matched += 1

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


def calculate_token_f1(expected_output: str, actual_output: str) -> float:
    """Calculates token-level F1 score between expected and actual output."""
    exp_tokens = tokenize(expected_output)
    act_tokens = tokenize(actual_output)
    if not exp_tokens and not act_tokens:
        return 1.0
    if not exp_tokens or not act_tokens:
        return 0.0
    common = exp_tokens.intersection(act_tokens)
    if not common:
        return 0.0
    precision = len(common) / len(act_tokens)
    recall = len(common) / len(exp_tokens)
    f1 = 2 * (precision * recall) / (precision + recall)
    return round(f1, 3)


def calculate_instruction_following(
    system_instructions: str, actual_output: str
) -> Dict[str, Any]:
    """
    Evaluates whether the actual output respects instructions such as
    negative constraints ("do not mention X", "never output Y"), length constraints,
    or formatting constraints.
    """
    if not system_instructions:
        return {"score": 1.0, "violations": []}

    instr_lower = system_instructions.lower()
    actual_lower = actual_output.lower()
    violations = []

    # Check negative constraints: "do not mention X", "never disclose X", "without X"
    neg_matches = re.findall(r"(?:do not|don't|never|must not)\s+(?:mention|include|say|use|disclose)\s+([a-z0-9_-]+)", instr_lower)
    for forbidden in neg_matches:
        if forbidden in actual_lower:
            violations.append(f"Forbidden term mentioned: '{forbidden}'")

    # Check JSON output constraint if requested
    if "json" in instr_lower and ("return json" in instr_lower or "output in json" in instr_lower or "respond in json" in instr_lower):
        if not (actual_output.strip().startswith("{") and actual_output.strip().endswith("}")):
            violations.append("Response is not formatted as valid JSON object")

    score = 1.0 if not violations else max(0.0, round(1.0 - (0.4 * len(violations)), 2))
    return {"score": score, "violations": violations}


def calculate_groundedness(
    context: str, actual_output: str, expected_output: str = ""
) -> float:
    """
    Upgraded Groundedness Metric:
    Combines lexical support from context and expected output with penalties for fabricated numbers
    and negation contradictions.
    """
    context_tokens = tokenize(context)
    if expected_output:
        context_tokens |= tokenize(expected_output)
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
    Multi-signal Hallucination Detector:
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
