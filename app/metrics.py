import re
from typing import List, Set

# Common English filler words ("stop words") that we ignore when comparing meaning
STOP_WORDS: Set[str] = {
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "in", "on", "at", "to", "for", "with", "by", "about", "of", "and", "or",
    "can", "i", "you", "it", "this", "that", "does", "do", "what", "how",
    "much", "up", "after", "via", "plus", "all", "upon"
}


def tokenize(text: str) -> Set[str]:
    """
    Cleans text: converts to lowercase, extracts alphanumeric words/numbers,
    and removes filler stop words so we only compare meaningful words.
    """
    if not text:
        return set()
    # Extract words including hyphenated terms like '2-year' or numbers like '28w'
    words = re.findall(r"[a-z0-9]+(?:-[a-z0-9]+)*", text.lower())
    return {w for w in words if w not in STOP_WORDS}


def calculate_accuracy(actual_output: str, expected_keywords: List[str]) -> float:
    """
    Accuracy Metric: Checks what fraction of required ground-truth keywords
    appear in the AI's actual response. Returns a score between 0.0 and 1.0.
    """
    if not expected_keywords:
        return 1.0

    actual_lower = actual_output.lower()
    matched = sum(1 for kw in expected_keywords if kw.lower() in actual_lower)
    return round(matched / len(expected_keywords), 2)


def calculate_relevance(prompt: str, expected_output: str, actual_output: str) -> float:
    """
    Relevance Metric: Checks how closely the AI response aligns with the topic
    of the prompt and expected answer using token overlap.
    """
    reference_tokens = tokenize(prompt) | tokenize(expected_output)
    actual_tokens = tokenize(actual_output)

    if not reference_tokens or not actual_tokens:
        return 0.0

    overlap = reference_tokens.intersection(actual_tokens)
    # Ratio of reference topic words covered by the actual response (capped at 1.0)
    score = len(overlap) / len( tokenize(expected_output) or reference_tokens )
    return round(min(score, 1.0), 2)


def calculate_groundedness(context: str, actual_output: str) -> float:
    """
    Groundedness (Faithfulness) Metric: Measures what fraction of meaningful words
    in the AI's actual_output are supported by the source context.
    Low groundedness = High Hallucination!
    """
    context_tokens = tokenize(context)
    actual_tokens = tokenize(actual_output)

    if not actual_tokens:
        return 0.0
    if not context_tokens:
        return 0.0

    supported_tokens = actual_tokens.intersection(context_tokens)
    return round(len(supported_tokens) / len(actual_tokens), 2)


def detect_hallucination(groundedness_score: float, threshold: float = 0.6) -> bool:
    """
    Flags True if the AI response groundedness falls below the safety threshold.
    """
    return groundedness_score < threshold