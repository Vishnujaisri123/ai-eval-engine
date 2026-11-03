# AI Quality Evaluation & Regression Testing Platform

A production-grade Python OOP framework and FastAPI microservice designed to evaluate Large Language Model (LLM) responses for **Accuracy, Relevance, Groundedness, and Hallucination Detection** against curated golden datasets.

---

## 🚀 Key Features
* **Deterministic Metric Engine**: Computes token-overlap accuracy, semantic relevance, and source groundedness without relying on costly LLM-as-a-Judge API calls for initial verification.
* **Hallucination Guardrails**: Automatically flags ungrounded AI claims (e.g., fabricated features) and enforces strict quality thresholds.
* **Reusable OOP Architecture**: Built with modular Python classes (`AIQualityEvaluator`, `ReportGenerator`) for easy integration across testing suites and APIs.
* **Automated `pytest` Suite**: Includes parametrized regression tests, fixture management, negative hallucination tests, and API endpoint verification.
* **FastAPI REST Endpoints**: Exposes real-time evaluation (`POST /evaluate`) and batch regression (`GET /evaluate/dataset`) with Pydantic validation.
* **Executive Reports**: Generates machine-readable JSON artifacts and standalone dark-themed HTML dashboards.

---

## 🛠️ Tech Stack
* **Language**: Python 3.13
* **Framework**: FastAPI & Uvicorn
* **Validation**: Pydantic
* **Testing**: pytest & pytest-client (httpx)
* **Version Control**: Git & GitHub

---

## 📦 Project Structure
```text
ai-quality-evaluation-platform/
├── app/
│   ├── __init__.py
│   ├── evaluator.py     # Core OOP Evaluation Engine
│   ├── metrics.py       # Accuracy, Relevance, Groundedness & Hallucination detection
│   ├── api.py           # FastAPI REST endpoints & Pydantic validation
│   └── report.py        # JSON & HTML report generators
├── datasets/
│   └── golden_dataset.json  # Ground-truth evaluation test cases
├── tests/
│   └── test_evaluator.py    # Automated pytest regression suite
├── reports/             # Generated execution reports
├── requirements.txt
└── README.md