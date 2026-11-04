import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ShieldAlert, ShieldCheck, Play, ArrowLeft, AlertOctagon
} from 'lucide-react';
import { runSafety, listSafetyResults, getSafetyRun } from '../api';
import Header from '../components/Header';
import MetricCard from '../components/MetricCard';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';

export default function SafetyTesting() {
  const { runId } = useParams<{ runId?: string }>();
  const navigate = useNavigate();

  const [runs, setRuns] = useState<any[]>([]);
  const [activeRun, setActiveRun] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Run Safety Modal State
  const [showModal, setShowModal] = useState(false);
  const [modelName, setModelName] = useState('llama3');
  const [provider, setProvider] = useState('auto');
  const [useLive, setUseLive] = useState(false);
  const [running, setRunning] = useState(false);

  // Detail filter
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'critical' | 'high' | 'passed'>('all');

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await listSafetyResults();
      setRuns(res.data);

      if (runId) {
        const detailRes = await getSafetyRun(runId);
        setActiveRun(detailRes.data);
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

  const handleRunSafety = async () => {
    try {
      setRunning(true);
      const res = await runSafety({
        model_name: modelName,
        provider,
        use_live_generator: useLive,
      });
      setShowModal(false);
      navigate(`/safety/${res.data.id}`);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Safety evaluation run failed');
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <Header title="Safety & Red Team Testing" />
        <LoadingState message="Loading safety audit results and jailbreak probes..." />
      </div>
    );
  }

  const results = activeRun?.results || [];
  const filteredResults = results.filter((r: any) => {
    if (filterSeverity === 'passed') return r.passed;
    if (filterSeverity === 'critical') return r.severity === 'critical';
    if (filterSeverity === 'high') return r.severity === 'high';
    return true;
  });

  return (
    <div className="page">
      <Header
        title={activeRun ? `Safety Audit: ${activeRun.id}` : 'AI Safety & Red-Team Testing'}
        description={
          activeRun
            ? `Target Model: ${activeRun.model_name} | Pass Rate: ${activeRun.pass_rate}%`
            : 'Adversarial jailbreak attacks, prompt injection defenses, PII leakage detection, and refusal accuracy.'
        }
        actions={
          <div className="flex items-center gap-2">
            {activeRun ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => navigate('/safety')}
              >
                <ArrowLeft size={13} /> Back to Audits
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setShowModal(true)}
              >
                <Play size={13} /> Run Safety Red-Team Suite
              </button>
            )}
          </div>
        }
      />

      {/* DETAIL VIEW OF SAFETY AUDIT */}
      {activeRun ? (
        <div className="flex flex-col gap-4">
          <div className="cards-grid cards-grid-4">
            <MetricCard
              label="Safety Pass Rate"
              value={`${activeRun.pass_rate}%`}
              sub={`${activeRun.passed_cases} defended / ${activeRun.total_cases} attacks`}
              color={activeRun.pass_rate >= 85 ? 'var(--accent-green)' : 'var(--accent-red)'}
            />
            <MetricCard
              label="Vulnerabilities Flagged"
              value={activeRun.failed_cases}
              sub={activeRun.failed_cases === 0 ? 'Resistant across all vectors' : 'Requires guardrail hardening'}
              color={activeRun.failed_cases > 0 ? 'var(--accent-red)' : 'var(--accent-green)'}
            />
            <MetricCard
              label="Audited Model"
              value={activeRun.model_name}
              sub={`Provider: ${activeRun.provider || 'configured'}`}
              color="var(--accent-violet)"
            />
            <MetricCard
              label="Audit Status"
              value={activeRun.failed_cases === 0 ? 'COMPLIANT' : 'VULNERABLE'}
              sub={activeRun.failed_cases === 0 ? 'Passed security benchmark' : 'High risk findings'}
              color={activeRun.failed_cases === 0 ? 'var(--accent-green)' : 'var(--accent-red)'}
            />
          </div>

          {/* Test Cases Table with Severity Filters */}
          <div className="card">
            <div className="section-header">
              <div className="flex items-center gap-3">
                <h3>Adversarial Probes & Attack Diagnostics</h3>
                <span className="badge badge-gray">{filteredResults.length} probes</span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className={`btn btn-sm ${filterSeverity === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setFilterSeverity('all')}
                >
                  All
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${filterSeverity === 'critical' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setFilterSeverity('critical')}
                >
                  Critical Only
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${filterSeverity === 'high' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setFilterSeverity('high')}
                >
                  High Only
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${filterSeverity === 'passed' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setFilterSeverity('passed')}
                >
                  Defended (Pass)
                </button>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Probe ID</th>
                    <th>Attack Vector</th>
                    <th>Adversarial Input Prompt</th>
                    <th>Model Output</th>
                    <th>Expected Defense</th>
                    <th>Severity</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResults.map((tc: any) => (
                    <tr key={tc.id}>
                      <td style={{ fontWeight: 600, color: 'var(--accent-blue)' }}>{tc.case_id}</td>
                      <td>
                        <span className="badge badge-violet">{tc.attack_type}</span>
                      </td>
                      <td style={{ maxWidth: '240px' }} className="truncate">
                        {tc.prompt}
                      </td>
                      <td style={{ maxWidth: '280px' }} className="truncate">
                        {tc.actual_output}
                      </td>
                      <td style={{ maxWidth: '200px' }} className="truncate text-muted">
                        {tc.expected_safe_behavior}
                      </td>
                      <td>
                        {tc.severity === 'critical' ? (
                          <span className="badge badge-red">CRITICAL</span>
                        ) : tc.severity === 'high' ? (
                          <span className="badge badge-yellow">HIGH</span>
                        ) : (
                          <span className="badge badge-gray">LOW</span>
                        )}
                      </td>
                      <td>
                        {tc.passed ? (
                          <span className="badge badge-green flex items-center gap-1">
                            <ShieldCheck size={12} /> DEFENDED
                          </span>
                        ) : (
                          <span className="badge badge-red flex items-center gap-1">
                            <AlertOctagon size={12} /> BREACH
                          </span>
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
        /* LIST OF PAST SAFETY AUDITS */
        <div className="card">
          <div className="section-header">
            <h2>Safety Audit History</h2>
            <span className="text-muted" style={{ fontSize: '12px' }}>{runs.length} audits logged</span>
          </div>

          {runs.length === 0 ? (
            <EmptyState
              icon={ShieldAlert}
              title="No Safety Audits Executed"
              description="Run the safety & red-team probe suite to verify that your AI model resists prompt injection, avoids PII leaks, and properly refuses dangerous instructions."
              actionLabel="Launch Red-Team Audit"
              onAction={() => setShowModal(true)}
            />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Audit ID</th>
                    <th>Target Model</th>
                    <th>Provider</th>
                    <th>Total Probes</th>
                    <th>Defended</th>
                    <th>Breaches</th>
                    <th>Safety Pass Rate</th>
                    <th>Date</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600, color: 'var(--accent-blue)' }}>{r.id}</td>
                      <td style={{ fontWeight: 600 }}>{r.model_name}</td>
                      <td>
                        <span className="badge badge-gray">{r.provider || 'deterministic'}</span>
                      </td>
                      <td>{r.total_cases}</td>
                      <td>
                        <span className="text-green font-semibold">{r.passed_cases}</span>
                      </td>
                      <td>
                        {r.failed_cases > 0 ? (
                          <span className="text-red font-semibold">{r.failed_cases}</span>
                        ) : (
                          <span className="text-muted">0</span>
                        )}
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, color: r.pass_rate >= 80 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                          {r.pass_rate}%
                        </span>
                      </td>
                      <td className="text-muted" style={{ fontSize: '11px' }}>
                        {r.created_at ? new Date(r.created_at).toLocaleString() : ''}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => navigate(`/safety/${r.id}`)}
                        >
                          View Audit
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

      {/* RUN SAFETY SUITE MODAL */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Execute Safety & Red-Team Audit</h3>
            </div>
            <div className="modal-body flex flex-col gap-3">
              <div className="form-group">
                <label className="form-label">Target Model Identifier</label>
                <input
                  type="text"
                  className="form-input"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  disabled={running}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Provider</label>
                <select
                  className="form-select"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  disabled={running}
                >
                  <option value="auto">Auto (Configured Live / Offline)</option>
                  <option value="openai">OpenAI / OpenRouter API</option>
                  <option value="ollama">Ollama Localhost</option>
                  <option value="offline">Offline Pre-recorded Benchmark</option>
                </select>
              </div>

              <div className="form-group" style={{ marginTop: '8px' }}>
                <label className="flex items-center gap-2" style={{ cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={useLive}
                    onChange={(e) => setUseLive(e.target.checked)}
                    disabled={running}
                  />
                  <span>
                    <strong>Generate Live Adversarial Probes:</strong> Sends live prompt injection payloads to the configured model.
                  </span>
                </label>
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
                onClick={handleRunSafety}
                disabled={running}
              >
                {running ? <div className="spinner" /> : <Play size={14} />}
                {running ? 'Executing Probes...' : 'Start Red-Team Audit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
