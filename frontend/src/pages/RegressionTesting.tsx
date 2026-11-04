import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  GitCompare, Play, Plus, AlertTriangle, CheckCircle,
  TrendingDown, TrendingUp, ArrowLeft, ShieldAlert
} from 'lucide-react';
import {
  listBaselines, listEvaluations, runRegression,
  getRegression, listComparisons
} from '../api';
import Header from '../components/Header';
import MetricCard from '../components/MetricCard';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';

export default function RegressionTesting() {
  const { comparisonId } = useParams<{ comparisonId?: string }>();
  const navigate = useNavigate();

  const [baselines, setBaselines] = useState<any[]>([]);
  const [evalRuns, setEvalRuns] = useState<any[]>([]);
  const [comparisons, setComparisons] = useState<any[]>([]);
  const [activeComparison, setActiveComparison] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // New Regression Run Modal State
  const [showModal, setShowModal] = useState(false);
  const [selectedBaselineId, setSelectedBaselineId] = useState('');
  const [selectedCurrentRunId, setSelectedCurrentRunId] = useState('');
  const [thresholdDelta, setThresholdDelta] = useState(0.05);
  const [running, setRunning] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [blRes, runsRes, compRes] = await Promise.all([
        listBaselines(),
        listEvaluations(),
        listComparisons(),
      ]);
      setBaselines(blRes.data);
      setEvalRuns(runsRes.data);
      setComparisons(compRes.data);

      if (blRes.data.length > 0 && !selectedBaselineId) {
        setSelectedBaselineId(blRes.data[0].id);
      }
      if (runsRes.data.length > 0 && !selectedCurrentRunId) {
        setSelectedCurrentRunId(runsRes.data[0].id);
      }

      if (comparisonId) {
        const cRes = await getRegression(comparisonId);
        setActiveComparison(cRes.data);
      } else {
        setActiveComparison(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [comparisonId]);

  const handleRunRegression = async () => {
    if (!selectedBaselineId || !selectedCurrentRunId) {
      alert('Please select a baseline and current evaluation run.');
      return;
    }

    try {
      setRunning(true);
      const res = await runRegression({
        baseline_id: selectedBaselineId,
        current_run_id: selectedCurrentRunId,
        threshold_delta: thresholdDelta,
      });
      setShowModal(false);
      navigate(`/regression/${res.data.id}`);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Regression comparison failed.');
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <Header title="Automated Regression Testing" />
        <LoadingState message="Loading regression baselines and historical comparisons..." />
      </div>
    );
  }

  const details = activeComparison?.details || {};
  const caseDiffs = details.case_comparisons || [];

  return (
    <div className="page">
      <Header
        title={activeComparison ? `Regression Report: ${activeComparison.id}` : 'Regression Testing Engine'}
        description={
          activeComparison
            ? `Baseline: ${details.baseline_name} (${details.baseline_model}) vs Current: ${details.current_model}`
            : 'Detect quality regressions, pass-to-fail drops, and new hallucinations between prompt/model revisions.'
        }
        actions={
          <div className="flex items-center gap-2">
            {activeComparison ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => navigate('/regression')}
              >
                <ArrowLeft size={13} /> Back to Comparisons
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setShowModal(true)}
                disabled={baselines.length === 0 || evalRuns.length === 0}
              >
                <Play size={13} /> Run Regression Test
              </button>
            )}
          </div>
        }
      />

      {/* COMPARISON DETAIL VIEW */}
      {activeComparison ? (
        <div className="flex flex-col gap-4">
          {/* Top Outcome Alert */}
          {activeComparison.regression_detected ? (
            <div className="alert alert-error flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle size={20} />
                <div>
                  <strong>QUALITY REGRESSION DETECTED!</strong>
                  <div style={{ fontSize: '12px', marginTop: '2px' }}>
                    {details.new_failures_count} test case(s) broke from PASS to FAIL. Score delta: {activeComparison.score_delta}.
                  </div>
                </div>
              </div>
              <span className="badge badge-red" style={{ fontSize: '13px', padding: '6px 12px' }}>
                FAILED GATE
              </span>
            </div>
          ) : (
            <div className="alert alert-success flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle size={20} />
                <div>
                  <strong>NO CRITICAL REGRESSIONS</strong>
                  <div style={{ fontSize: '12px', marginTop: '2px' }}>
                    Model update maintained or improved quality scores across all verified cases.
                  </div>
                </div>
              </div>
              <span className="badge badge-green" style={{ fontSize: '13px', padding: '6px 12px' }}>
                PASSED GATE
              </span>
            </div>
          )}

          {/* Metric Comparison Cards */}
          <div className="cards-grid cards-grid-4">
            <MetricCard
              label="Score Change"
              value={`${activeComparison.score_delta > 0 ? '+' : ''}${activeComparison.score_delta}`}
              sub={`Previous: ${details.baseline_avg_score} → Current: ${details.current_avg_score}`}
              color={activeComparison.score_delta >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}
            />
            <MetricCard
              label="Pass Rate Delta"
              value={`${activeComparison.pass_rate_delta > 0 ? '+' : ''}${activeComparison.pass_rate_delta}%`}
              sub={`Previous: ${details.baseline_pass_rate}% → Current: ${details.current_pass_rate}%`}
              color={activeComparison.pass_rate_delta >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}
            />
            <MetricCard
              label="New Failures"
              value={details.new_failures_count || 0}
              sub={`${details.resolved_failures_count || 0} previously failed resolved`}
              color={details.new_failures_count > 0 ? 'var(--accent-red)' : 'var(--accent-green)'}
            />
            <MetricCard
              label="Regression Rate"
              value={`${details.regression_percentage || 0}%`}
              sub={`${details.regressed_cases_count || 0} cases with score drops > ${details.threshold_delta * 100}%`}
              color={details.regression_percentage > 0 ? 'var(--accent-yellow)' : 'var(--accent-green)'}
            />
          </div>

          {/* Case Diff Breakdown Table */}
          <div className="card">
            <div className="section-header">
              <h3>Case-by-Case Regression Diff ({caseDiffs.length} matched cases)</h3>
              <span className="text-muted" style={{ fontSize: '12px' }}>
                Threshold sensitivity: {details.threshold_delta * 100}%
              </span>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Case ID</th>
                    <th>Category</th>
                    <th>Prompt Snippet</th>
                    <th>Baseline Score</th>
                    <th>Current Score</th>
                    <th>Score Delta</th>
                    <th>Status Transition</th>
                    <th>New Hallucination</th>
                  </tr>
                </thead>
                <tbody>
                  {caseDiffs.map((c: any) => (
                    <tr key={c.test_case_id}>
                      <td style={{ fontWeight: 600, color: 'var(--accent-blue)' }}>{c.test_case_id}</td>
                      <td>
                        <span className="badge badge-gray">{c.category}</span>
                      </td>
                      <td style={{ maxWidth: '280px' }} className="truncate">
                        {c.prompt}
                      </td>
                      <td>{c.baseline_score}</td>
                      <td style={{ fontWeight: 600 }}>{c.current_score}</td>
                      <td
                        style={{
                          fontWeight: 700,
                          color: c.score_delta < 0 ? 'var(--accent-red)' : (c.score_delta > 0 ? 'var(--accent-green)' : 'var(--text-muted)'),
                        }}
                      >
                        {c.score_delta > 0 ? `+${c.score_delta}` : c.score_delta}
                      </td>
                      <td>
                        {c.status_change === 'REGRESSED' ? (
                          <span className="badge badge-red flex items-center gap-1">
                            <TrendingDown size={12} /> REGRESSED (Pass → Fail)
                          </span>
                        ) : c.status_change === 'RESOLVED' ? (
                          <span className="badge badge-green flex items-center gap-1">
                            <TrendingUp size={12} /> RESOLVED (Fail → Pass)
                          </span>
                        ) : c.status_change === 'MAINTAINED_PASS' ? (
                          <span className="badge badge-green">Maintained Pass</span>
                        ) : (
                          <span className="badge badge-red">Maintained Fail</span>
                        )}
                      </td>
                      <td>
                        {c.new_hallucination ? (
                          <span className="badge badge-red flex items-center gap-1">
                            <ShieldAlert size={12} /> NEW HALLUCINATION
                          </span>
                        ) : (
                          <span className="text-muted">None</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* REGRESSION LANDING: BASELINES & PAST COMPARISONS */
        <div className="flex flex-col gap-4">
          {/* Baselines Section */}
          <div className="card">
            <div className="section-header">
              <h3>Active Regression Baselines</h3>
              <span className="badge badge-blue">{baselines.length} baselines</span>
            </div>

            {baselines.length === 0 ? (
              <EmptyState
                icon={GitCompare}
                title="No Baselines Created"
                description="Go to Evaluation Center, execute an evaluation, and click 'Set as Baseline' to establish a quality benchmark."
                actionLabel="Go to Evaluation Center"
                onAction={() => navigate('/evaluations')}
              />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Baseline ID</th>
                      <th>Name</th>
                      <th>Model Reference</th>
                      <th>Avg Score</th>
                      <th>Pass Rate</th>
                      <th>Cases</th>
                      <th>Created At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {baselines.map((b) => (
                      <tr key={b.id}>
                        <td style={{ fontWeight: 600, color: 'var(--accent-blue)' }}>{b.id}</td>
                        <td style={{ fontWeight: 600 }}>{b.name}</td>
                        <td>{b.model_name}</td>
                        <td style={{ fontWeight: 600 }}>{b.avg_score}</td>
                        <td>
                          <span className="text-green font-semibold">{b.pass_rate}%</span>
                        </td>
                        <td>{b.total_cases}</td>
                        <td className="text-muted" style={{ fontSize: '11px' }}>
                          {b.created_at ? new Date(b.created_at).toLocaleDateString() : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Past Regression Comparisons Section */}
          <div className="card">
            <div className="section-header">
              <h2>Historical Regression Comparisons</h2>
              <span className="text-muted" style={{ fontSize: '12px' }}>{comparisons.length} comparisons logged</span>
            </div>

            {comparisons.length === 0 ? (
              <EmptyState
                icon={Plus}
                title="No comparisons yet"
                description="Run a regression test comparing an experimental evaluation against a locked baseline."
                actionLabel="Run Regression Test"
                onAction={() => setShowModal(true)}
              />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Comparison ID</th>
                      <th>Score Delta</th>
                      <th>Pass Rate Delta</th>
                      <th>New Failures</th>
                      <th>Resolved</th>
                      <th>Outcome</th>
                      <th>Date</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisons.map((c) => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 600, color: 'var(--accent-blue)' }}>{c.id}</td>
                        <td
                          style={{
                            fontWeight: 700,
                            color: c.score_delta >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
                          }}
                        >
                          {c.score_delta > 0 ? `+${c.score_delta}` : c.score_delta}
                        </td>
                        <td>{c.pass_rate_delta > 0 ? `+${c.pass_rate_delta}%` : `${c.pass_rate_delta}%`}</td>
                        <td>
                          {c.new_failures > 0 ? (
                            <span className="text-red font-semibold">{c.new_failures}</span>
                          ) : (
                            <span className="text-muted">0</span>
                          )}
                        </td>
                        <td>{c.resolved_failures}</td>
                        <td>
                          {c.regression_detected ? (
                            <span className="badge badge-red">REGRESSION</span>
                          ) : (
                            <span className="badge badge-green">PASSED</span>
                          )}
                        </td>
                        <td className="text-muted" style={{ fontSize: '11px' }}>
                          {c.created_at ? new Date(c.created_at).toLocaleString() : ''}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => navigate(`/regression/${c.id}`)}
                          >
                            View Report
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* RUN REGRESSION MODAL */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Run Automated Regression Analysis</h3>
            </div>
            <div className="modal-body flex flex-col gap-3">
              <div className="form-group">
                <label className="form-label">Select Baseline (Golden Target)</label>
                <select
                  className="form-select"
                  value={selectedBaselineId}
                  onChange={(e) => setSelectedBaselineId(e.target.value)}
                  disabled={running}
                >
                  {baselines.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.model_name} - Score: {b.avg_score})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Select Current / Candidate Evaluation Run</label>
                <select
                  className="form-select"
                  value={selectedCurrentRunId}
                  onChange={(e) => setSelectedCurrentRunId(e.target.value)}
                  disabled={running}
                >
                  {evalRuns.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.id} ({r.model_name} - {r.dataset_name} - Score: {r.avg_score})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Regression Drop Sensitivity Threshold</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="0.5"
                  className="form-input"
                  value={thresholdDelta}
                  onChange={(e) => setThresholdDelta(parseFloat(e.target.value))}
                  disabled={running}
                />
                <span className="text-muted" style={{ fontSize: '11px', marginTop: '4px', display: 'block' }}>
                  A drop greater than {(thresholdDelta * 100).toFixed(0)}% flags a case-level regression.
                </span>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowModal(false)}
                disabled={running}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleRunRegression}
                disabled={running || !selectedBaselineId || !selectedCurrentRunId}
              >
                {running ? <div className="spinner" /> : <GitCompare size={14} />}
                {running ? 'Comparing Runs...' : 'Compute Regression'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
