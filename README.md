# AI Quality Evaluation & Automated Regression Testing Platform

An enterprise-grade, full-stack AI evaluation and automated regression-testing platform engineered to benchmark, monitor, and guard LLM-powered applications against quality regressions, hallucinations, adversarial prompt injection, and performance degradation.

---

## 1. Executive Summary & Business Problem

Deploying Large Language Models (LLMs) into customer-facing applications introduces critical reliability risks:
- **Hallucinations & Ungrounded Claims**: Models inventing specs, policies, or technical parameters not present in knowledge bases.
- **Silent Regressions**: Prompt tweaks or foundation model upgrades (e.g., GPT-4o update, Llama-3.1 migration) inadvertently breaking previously passing production edge-cases.
- **Instruction Non-Compliance**: Models violating negative constraints (e.g., disclosing internal prompt secrets or mentioning restricted competitor products).
- **Adversarial Safety Vulnerabilities**: Jailbreaks, prompt injection attacks, and sensitive PII disclosure.
- **Lack of Objective Quality Visibility**: Teams relying on manual "vibe checks" rather than systematic, reproducible, telemetry-backed regression benchmarks.

**AI Quality Evaluation Platform** replaces ad-hoc testing with automated quality engineering: locked golden baselines, delta score analysis, transparent multi-signal hallucination detection, adversarial safety red-teaming, and model comparison.

---

## 2. System Architecture

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                            REACT FRONTEND (Vite + TS)                       │
│   Overview  •  Playground  •  Evaluations  •  Datasets  •  Regression       │
│   Safety & Red-Team  •  Model Comparison  •  Reports & Export  •  Settings  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ REST / JSON (Axios)
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                            FASTAPI BACKEND SERVICE                          │
│                                                                             │
│  ┌───────────────────────┐  ┌─────────────────────┐  ┌───────────────────┐  │
│  │   Playground Service  │  │ Evaluation Engine   │  │ Regression Engine │  │
│  └───────────────────────┘  └─────────────────────┘  └───────────────────┘  │
│  ┌───────────────────────┐  ┌─────────────────────┐  ┌───────────────────┐  │
│  │ Safety / Red-Team     │  │ Dataset Management  │  │ Model Comparison  │  │
│  └───────────────────────┘  └─────────────────────┘  └───────────────────┘  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                    EVALUATION METRIC & JUDGE LAYER                    │  │
│  │  • Accuracy (Keyword)     • Relevance (Overlap)  • Groundedness (RAG) │  │
│  │  • Semantic Similarity    • Instruction Follow   • Multi-signal Hal.  │  │
│  │  • Structured LLM Judge   • Telemetry & Cost     • Token F1 Score     │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└──────────────────────┬───────────────────────────────────────┬──────────────┘
                       │                                       │
┌──────────────────────▼──────────┐         ┌──────────────────▼──────────────┐
│       AI PROVIDER LAYER         │         │      PERSISTENCE (SQLite)       │
│  • OpenAI / OpenRouter Cloud    │         │  • Datasets & Test Cases        │
│  • Localhost Ollama             │         │  • Evaluation Runs & Results    │
│  • Dedicated Evaluation Judge   │         │  • Regression Baselines & Diffs │
│  • Zero-Cred Offline Benchmark  │         │  • Safety Audits & History      │
└─────────────────────────────────┘         └─────────────────────────────────┘
```

---

## 3. Technology Stack

### Backend
- **Python 3.13**
- **FastAPI**: High-throughput REST API with dependency injection and lifespan management
- **SQLAlchemy 2.0 & SQLite**: Persistent relational storage for datasets, evaluation runs, baselines, and safety audits
- **Pydantic v2**: Strict schema validation for requests, outputs, and structured LLM Judge verdicts
- **HTTPX**: Robust asynchronous HTTP client with timeout resilience
- **Pytest**: Comprehensive automated regression and unit test suite

### Frontend
- **React 19 & Vite 8** (TypeScript)
- **React Router v7**: Seamless single-page routing across 9 operational modules
- **Recharts 3**: Responsive real-time telemetry, trend lines, and category distribution charts
- **Lucide React**: Clean developer-tool icon hierarchy
- **Custom Enterprise CSS**: Dark-themed charcoal design system (`#0b1120`, `#111827`, `#1e293b`) with zero Tailwind dependency

### AI Provider Integrations
- **Cloud OpenAI-Compatible APIs**: OpenAI, OpenRouter, Groq, LiteLLM, vLLM
- **Local Ollama Integration**: Direct REST generation for local private models
- **Deterministic Offline Benchmark**: High-precision lexical and heuristic evaluation requiring zero paid credentials

---

## 4. Core Capabilities

### A. AI Playground
- Interactive playground with user prompt, role-defining system prompt, and RAG context inputs.
- Provider and model selector (OpenAI, Ollama, Offline).
- Real-time generation latency (ms), token usage (prompt, completion, total), and estimated API cost.
- **Save as Test Case**: One-click promotion of any playground interaction into a persistent test suite.

### B. Modular 8-Dimension Evaluation Engine
1. **Accuracy**: Measures keyword presence and ground-truth coverage.
2. **Relevance**: Measures lexical and topical overlap with user intent.
3. **Keyword Coverage**: Validates mandatory technical tokens (e.g. wattage, protocol, specs).
4. **Semantic Similarity**: Hybrid cosine similarity with smart domain token normalization.
5. **Instruction Following**: Detects negative constraint breaches (e.g. forbidden mentions) and formatting errors.
6. **Groundedness**: Verifies contextual support and penalizes unsupported claims.
7. **Multi-Signal Hallucination Diagnostics**: Flags low groundedness, ungrounded numbers, and direct negation contradictions.
8. **Latency & Cost Telemetry**: Monitors response duration and token economy.

### C. Automated Regression Testing & Baseline Locking
- Lock any completed evaluation run as an immutable **Regression Baseline**.
- Re-run test cases after prompt engineering or model migration.
- Automatic delta calculation:
  - Overall score delta and pass rate delta
  - **New Failures**: Test cases that previously passed but broke
  - **Resolved Failures**: Test cases that previously failed and are now fixed
  - **New Hallucinations**: Cases where ungrounded claims emerged
  - **Sensitivity Threshold**: Flags regressions when score drops exceed configurable margin (e.g. 5%).

### D. Dataset Management
- Test suite organization by domain and feature tags.
- Full CRUD on test cases with custom prompt, context, ground truth, and threshold parameters.
- CSV and JSON import/export with input validation.
- Built-in one-click seeding for Golden Appliance QA, Adversarial Safety, and Multi-turn dialogue suites.

### E. AI Safety & Adversarial Red-Team Testing
- Pre-configured probes across 7 security vectors:
  - Prompt injection and jailbreak overrides
  - Developer Mode escalation attempts
  - Dangerous electrical or operational advice
  - PII leakage (emails, phone numbers, API keys)
  - Unauthorized system instruction disclosure
- Evaluates refusal accuracy (defending unsafe prompts without false refusals on benign requests).

### F. Multi-Model Benchmarking
- Side-by-side execution of multiple models on identical datasets.
- Automated winner analysis highlights highest accuracy, lowest latency, and best pass rate.

### G. Auditable Reporting & Export
- Standalone, downloadable **XSS-Safe HTML Reports**.
- Full CSV and JSON data export for automated CI/CD gating and compliance audits.

---

## 5. Offline Deterministic vs. Live Provider Evaluation

| Dimension | Offline Deterministic Mode | Live AI Provider Mode |
| :--- | :--- | :--- |
| **Credentials Required** | **None** (Zero-configuration out of the box) | API Key (`OPENAI_API_KEY`) or local Ollama instance |
| **Model Generation** | Uses pre-recorded actual outputs or deterministic RAG synthesis | Generates fresh completions via live LLM inference |
| **Evaluation Metrics** | Accuracy, Groundedness, Negation Checks, Token Overlap, Numeric Integrity | All deterministic metrics + Optional Structured LLM-as-a-Judge |
| **Use Cases** | GitHub Actions CI/CD, unit tests, reproducible regression verification | Prompt development, red-teaming, live model benchmarking |
| **Failure Handling** | Guaranteed reproducible execution | **Never silently simulated**: Connection/API errors explicitly reported |

---

## 6. Installation & Quickstart

### Prerequisites
- Python 3.11+ (Python 3.13 recommended)
- Node.js 18+ and npm
- (Optional) Local [Ollama](https://ollama.ai) or OpenAI API Key

### Step 1: Clone & Setup Backend
```bash
git clone https://github.com/Vishnujaisri123/ai-eval-engine.git
cd ai-quality-evaluation-platform

# Activate or create virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment (optional for offline testing)
cp .env.example .env
```

### Step 2: Start Backend Server
```bash
# Runs FastAPI on http://localhost:8000
python -m uvicorn app.api:app --host 0.0.0.0 --port 8000 --reload
```

### Step 3: Setup & Start Frontend
In a separate terminal:
```bash
cd frontend

# Install dependencies
npm install

# Start Vite dev server on http://localhost:5173
npm run dev
```
Open **`http://localhost:5173`** in your browser.

---

## 7. Running Automated Tests & CI Pipeline

Run the comprehensive pytest suite covering API routes, regression engine, safety guardrails, and telemetry:
```bash
# Run all automated tests
python -m pytest -v

# Generate local HTML & JSON evaluation reports
python -m app.report

# Test frontend build and linting
cd frontend
npm run lint
npm run build
```

---

## 8. API Reference

### Health & Preserved Backward-Compatible Endpoints
- `GET /health`: Platform health check and active configuration metadata
- `POST /evaluate`: Evaluates a single payload against accuracy, groundedness, and hallucination metrics
- `GET /evaluate/dataset`: Evaluates the default golden benchmark dataset
- `GET /evaluate/safety`: Evaluates the baseline safety suite

### Dashboard & Telemetry
- `GET /api/dashboard/summary`: Overall runs, pass rate, failed counts, and regression metrics
- `GET /api/dashboard/activity`: Recent evaluation runs
- `GET /api/dashboard/analytics`: Time-series scores, model performance, and category distribution

### Playground
- `POST /api/playground/run`: Query configured AI models with latency and token telemetry
- `GET /api/playground/history`: List recent playground interactions
- `POST /api/playground/save-test-case`: Save a playground prompt/response as a new test case

### Evaluation Runs & Reporting
- `POST /api/evaluations/run`: Trigger evaluation run on a dataset
- `GET /api/evaluations`: List all evaluation runs
- `GET /api/evaluations/{run_id}`: Get evaluation summary and individual results
- `GET /api/reports/{run_id}/export?format={json|csv|html}`: Export auditable reports

### Datasets & Test Cases
- `GET /api/datasets`: List all test suites
- `POST /api/datasets`: Create new test suite
- `POST /api/datasets/seed`: Auto-seed starter suites (Golden QA, Safety, Multiturn)
- `GET /api/datasets/{id}`: Get suite test cases
- `POST /api/datasets/{id}/cases`: Add individual test case
- `POST /api/datasets/{id}/import`: Upload and validate CSV or JSON dataset
- `GET /api/datasets/{id}/export?format={json|csv}`: Export dataset

### Regression Engine
- `POST /api/regression/baselines`: Lock an evaluation run as an immutable baseline
- `GET /api/regression/baselines`: List all baselines
- `POST /api/regression/run`: Run comparison between baseline and candidate run
- `GET /api/regression/{id}`: Detailed regression diff report

### Safety & Red-Team
- `POST /api/safety/run`: Execute adversarial safety probes against configured model
- `GET /api/safety/results`: List historical safety audits

### Models & Benchmarking
- `GET /api/models`: Configured providers and connection statuses
- `POST /api/models/test-connection`: Ping and verify provider connectivity
- `POST /api/models/compare`: Side-by-side multi-model benchmark

---

## 9. Security & Data Integrity Guarantees

1. **No Plaintext API Keys in Frontend or Database**: All AI provider credentials remain exclusively within backend environment variables.
2. **No Silent Fake Responses**: If an external AI provider fails or lacks credentials, the system returns an explicit provider error rather than simulating live completion.
3. **XSS Protection**: All generated HTML reports and UI components rigorously escape untrusted model outputs to prevent HTML/script injection attacks.
4. **Isolated Baselines**: Regression comparisons only evaluate test cases sharing stable IDs across matching datasets.

---

## 10. License

MIT License. Designed for AI Quality Engineers, Product Teams, and LLM Application Developers.
