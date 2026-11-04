import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Play, Plus, Download, Search, ArrowLeft, BookmarkPlus
} from 'lucide-react';
import {
  listEvaluations, getEvaluation, runEvaluation,
  listDatasets, createBaseline, exportReport
} from '../api';
import Header from '../components/Header';
import StatusBadge from '../components/StatusBadge';
import MetricCard from '../components/MetricCard';
import EvaluationResultPanel from '../components/EvaluationResultPanel';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';

export default function EvaluationCenter() {
  const { runId } = useParams<{ runId?: string }>();
  const navigate = useNavigate();

  const [runs, setRuns] = useState<any[]>([]);
  const [activeRun, setActiveRun] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedResult, setSelectedResult] = useState<any>(null);

  // Filter & Search
  const [statusFilter, setStatusFilter] = useState<'all' | 'pass' | 'fail' | 'hallucination'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Run Modal State
  const [showRunModal, setShowRunModal] = useState(false);
  const [datasets, setDatasets] = useState<any[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [provider, setProvider] = useState('auto');
  const [modelName, setModelName] = useState('llama3');
  const [passThreshold, setPassThreshold] = useState(0.70);
  const [groundednessThreshold, setGroundednessThreshold] = useState(0.60);
  const [useLive, setUseLive] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [baselineModalRun, setBaselineModalRun] = useState<any>(null);
  const [baselineName, setBaselineName] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const [runsRes, dsRes] = await Promise.all([
        listEvaluations(),
        listDatasets(),
      ]);
      setRuns(runsRes.data);
      setDatasets(dsRes.data);
      if (dsRes.data.length > 0 && !selectedDatasetId) {
        setSelectedDatasetId(dsRes.data[0].id);
      }

      if (runId) {
        const runRes = await getEvaluation(runId);
        setActiveRun(runRes.data);
      } else {
        setActiveRun(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [runId]);

  const handleStartEvaluation = async () => {
    if (!selectedDatasetId) {
      alert('Please select a dataset');
      return;
    }

    try {
      setEvaluating(true);
      const res = await runEvaluation({
        dataset_id: selectedDatasetId,
        provider,
        model_name: modelName,
        use_live_generator: useLive,
        pass_threshold: passThreshold,
        groundedness_threshold: groundednessThreshold,
      });

      setShowRunModal(false);
      navigate(`/evaluations/${res.data.id}`);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Evaluation failed to start');
    } finally {
      setEvaluating(false);
    }
  };

  const handleCreateBaseline = async () => {
    if (!baselineModalRun || !baselineName.trim()) return;
    try {
      await createBaseline({
        name: baselineName,
        run_id: baselineModalRun.id,
      });
      alert('Baseline created successfully! You can now use it in Regression Testing.');
      setBaselineModalRun(null);
      setBaselineName('');
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to create baseline');
    }
  };

  const handleExport = (format: string) => {
    if (!activeRun) return;
    exportReport(activeRun.id, format)
      .then((res) => {
        const url = window.URL.createObjectURL(new Blob([res.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `report_${activeRun.id}.${format}`);
        document.body.appendChild(link);
        link.click();
        link.remove();
      })
      .catch((err) => console.error(err));
  };

  if (loading) {
    return (
      <div className="page">
        <Header title="Evaluation Center" />
        <LoadingState message="Loading evaluation suites and results..." />
      </div>
    );
  }

  // Filtered results for active run
  const filteredResults = (activeRun?.results || []).filter((r: any) => {
    const matchesSearch =
      r.prompt.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.actual_output.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.test_case_id.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (statusFilter === 'pass') return r.passed;
    if (statusFilter === 'fail') return !r.passed;
    if (statusFilter === 'hallucination') return r.hallucination_detected;
    return true;
  });

  return (
    <div className="page">
      <Header
        title={activeRun ? `Evaluation Run: ${activeRun.id}` : 'Evaluation Center'}
        description={
          activeRun
            ? `Suite: ${activeRun.dataset_name} | Model: ${activeRun.model_name} (${activeRun.provider})`
            : 'Execute rigorous deterministic & LLM-judged evaluation batches across customized test suites.'
        }
        actions={
          <div className="flex items-center gap-2">
            {activeRun ? (
              <>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => navigate('/evaluations')}
                >
                  <ArrowLeft size={13} /> Back to Runs
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setBaselineName(`Baseline for ${activeRun.model_name}`);
                    setBaselineModalRun(activeRun);
                  }}
                >
                  <BookmarkPlus size={13} /> Set as Baseline
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleExport('html')}
                >
                  <Download size={13} /> Export HTML
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setShowRunModal(true)}
              >
                <Play size={13} />
                Execute New Evaluation
              </button>
            )}
          </div>
        }
      />

      {/* DETAIL VIEW OF SINGLE RUN */}
      {activeRun ? (
        <div className="flex flex-col gap-4">
          {/* Top Run Metrics */}
          <div className="cards-grid cards-grid-4">
            <MetricCard
              label="Quality Score"
              value={activeRun.avg_score}
              sub={`Target Threshold: ${activeRun.summary?.pass_threshold || '0.70'}`}
              color="var(--accent-violet)"
            />
            <MetricCard
              label="Pass Rate"
              value={`${activeRun.pass_rate}%`}
              sub={`${activeRun.passed_cases} passed / ${activeRun.total_cases} total`}
              color={activeRun.pass_rate >= 80 ? 'var(--accent-green)' : 'var(--accent-yellow)'}
            />
            <MetricCard
              label="Hallucinations"
              value={activeRun.hallucination_count}
              sub={activeRun.hallucination_count === 0 ? 'Zero groundedness breaches' : 'Detected ungrounded claims'}
              color={activeRun.hallucination_count > 0 ? 'var(--accent-red)' : 'var(--accent-green)'}
            />
            <MetricCard
              label="Avg Response Latency"
              value={`${activeRun.avg_latency_ms} ms`}
              sub={`Total duration: ${Math.round(activeRun.execution_time_ms || 0)}ms`}
              color="var(--accent-blue)"
            />
          </div>

          {/* Test Cases Table with Filters */}
          <div className="card">
            <div className="section-header">
              <div className="flex items-center gap-3">
                <h3>Test Case Evaluations</h3>
                <span className="badge badge-gray">{filteredResults.length} cases</span>
              </div>

              <div className="flex items-center gap-2">
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    className="form-input"
                    style={{ paddingLeft: '28px', width: '220px' }}
                    placeholder="Search prompt, output..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <Search size={13} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className={`btn btn-sm ${statusFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setStatusFilter('all')}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${statusFilter === 'pass' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setStatusFilter('pass')}
                  >
                    Passed
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${statusFilter === 'fail' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setStatusFilter('fail')}
                  >
                    Failed
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${statusFilter === 'hallucination' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setStatusFilter('hallucination')}
                  >
                    Hallucinations
                  </button>
                </div>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Case ID</th>
                    <th>Category</th>
                    <th>Prompt</th>
                    <th>Model Output</th>
                    <th>Accuracy</th>
                    <th>Grounded</th>
                    <th>Score</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResults.map((r: any) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600, color: 'var(--accent-blue)' }}>
                        {r.test_case_id}
                      </td>
                      <td>
                        <span className="badge badge-gray">{r.category}</span>
                      </td>
                      <td style={{ maxWidth: '240px' }} className="truncate">
                        {r.prompt}
                      </td>
                      <td style={{ maxWidth: '300px' }} className="truncate">
                        {r.actual_output}
                      </td>
                      <td>{Math.round(r.accuracy * 100)}%</td>
                      <td>{Math.round(r.groundedness * 100)}%</td>
                      <td style={{ fontWeight: 700 }}>{r.overall_score}</td>
                      <td>
                        {r.hallucination_detected ? (
                          <span className="badge badge-red">HALLUCINATION</span>
                        ) : (
                          <StatusBadge passed={r.passed} />
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setSelectedResult(r)}
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* LIST OF ALL EVALUATION RUNS */
        <div className="card">
          <div className="section-header">
            <h2>All Evaluation Runs</h2>
            <span className="text-muted" style={{ fontSize: '12px' }}>{runs.length} runs recorded</span>
          </div>

          {runs.length === 0 ? (
            <EmptyState
              icon={Plus}
              title="No evaluations created yet"
              description="Execute an evaluation across your dataset to inspect accuracy, groundedness, and hallucination metrics."
              actionLabel="Run First Evaluation"
              onAction={() => setShowRunModal(true)}
            />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Run ID</th>
                    <th>Dataset Suite</th>
                    <th>Model</th>
                    <th>Provider</th>
                    <th>Pass Rate</th>
                    <th>Avg Score</th>
                    <th>Cases</th>
                    <th>Hallucinations</th>
                    <th>Date</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600, color: 'var(--accent-blue)' }}>{r.id}</td>
                      <td>{r.dataset_name || 'Standard Benchmark'}</td>
                      <td>{r.model_name}</td>
                      <td>
                        <span className="badge badge-gray">{r.provider}</span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, color: r.pass_rate >= 80 ? 'var(--accent-green)' : 'var(--accent-yellow)' }}>
                          {r.pass_rate}%
                        </span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{r.avg_score}</td>
                      <td>
                        {r.passed_cases}/{r.total_cases}
                      </td>
                      <td>
                        {r.hallucination_count > 0 ? (
                          <span className="text-red font-semibold">{r.hallucination_count}</span>
                        ) : (
                          <span className="text-muted">0</span>
                        )}
                      </td>
                      <td className="text-muted" style={{ fontSize: '11px' }}>
                        {r.created_at ? new Date(r.created_at).toLocaleString() : ''}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => navigate(`/evaluations/${r.id}`)}
                        >
                          Inspect Run
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* RESULT DETAIL MODAL */}
      <EvaluationResultPanel
        result={selectedResult}
        onClose={() => setSelectedResult(null)}
      />

      {/* EXECUTE RUN MODAL */}
      {showRunModal && (
        <div className="modal-overlay" onClick={() => setShowRunModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Configure & Run Evaluation</h3>
            </div>
            <div className="modal-body flex flex-col gap-3">
              <div className="form-group">
                <label className="form-label">Select Test Dataset</label>
                <select
                  className="form-select"
                  value={selectedDatasetId}
                  onChange={(e) => setSelectedDatasetId(e.target.value)}
                  disabled={evaluating}
                >
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.test_case_count} test cases)
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">AI Provider</label>
                  <select
                    className="form-select"
                    value={provider}
                    onChange={(e) => {
                      const newP = e.target.value;
                      setProvider(newP);
                      if (newP === 'gemini') setModelName('gemini-3.8-flash');
                      else if (newP === 'groq') setModelName('openai/gpt-oss-20b');
                      else if (newP === 'openai') setModelName('gpt-4o-mini');
                      else if (newP === 'ollama') setModelName('llama3');
                      else if (newP === 'offline') setModelName('deterministic-rag-v1');
                    }}
                    disabled={evaluating}
                  >
                    <option value="auto">Auto (Gemini / Groq / OpenRouter / OpenAI / Ollama)</option>
                    <option value="gemini">Google Gemini API (gemini-3.8-flash)</option>
                    <option value="groq">Groq Cloud (openai/gpt-oss-20b)</option>
                    <option value="openai">OpenAI / OpenRouter API</option>
                    <option value="ollama">Ollama (Localhost)</option>
                    <option value="offline">Offline / Deterministic Benchmark</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Model Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    disabled={evaluating}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Quality Pass Threshold</label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    className="form-input"
                    value={passThreshold}
                    onChange={(e) => setPassThreshold(parseFloat(e.target.value))}
                    disabled={evaluating}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Groundedness Gate</label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    className="form-input"
                    value={groundednessThreshold}
                    onChange={(e) => setGroundednessThreshold(parseFloat(e.target.value))}
                    disabled={evaluating}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginTop: '8px' }}>
                <label className="flex items-center gap-2" style={{ cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={useLive}
                    onChange={(e) => setUseLive(e.target.checked)}
                    disabled={evaluating}
                  />
                  <span>
                    <strong>Generate Live Responses:</strong> Call external model API for each test case (leave unchecked to evaluate pre-recorded dataset answers).
                  </span>
                </label>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowRunModal(false)}
                disabled={evaluating}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleStartEvaluation}
                disabled={evaluating || !selectedDatasetId}
              >
                {evaluating ? <div className="spinner" /> : <Play size={14} />}
                {evaluating ? 'Running Evaluation...' : 'Start Run'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE BASELINE MODAL */}
      {baselineModalRun && (
        <div className="modal-overlay" onClick={() => setBaselineModalRun(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create Regression Baseline</h3>
            </div>
            <div className="modal-body flex flex-col gap-3">
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Lock this evaluation run as an official golden baseline. Future evaluation runs on this dataset will be compared against these scores to catch quality regressions.
              </p>
              <div className="form-group">
                <label className="form-label">Baseline Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={baselineName}
                  onChange={(e) => setBaselineName(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setBaselineModalRun(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleCreateBaseline}
                disabled={!baselineName.trim()}
              >
                Save Baseline
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
