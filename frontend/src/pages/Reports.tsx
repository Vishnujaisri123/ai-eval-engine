import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  FileText, Download, ArrowLeft,
  Search, Eye
} from 'lucide-react';
import { listEvaluations, getReport, exportReport } from '../api';
import Header from '../components/Header';
import MetricCard from '../components/MetricCard';
import StatusBadge from '../components/StatusBadge';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';

export default function Reports() {
  const { runId } = useParams<{ runId?: string }>();
  const navigate = useNavigate();

  const [runs, setRuns] = useState<any[]>([]);
  const [activeReport, setActiveReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCase, setSelectedCase] = useState<any>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await listEvaluations();
      setRuns(res.data);

      if (runId) {
        const reportRes = await getReport(runId);
        setActiveReport(reportRes.data);
      } else {
        setActiveReport(null);
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

  const handleDownload = (format: string) => {
    if (!activeReport) return;
    exportReport(activeReport.run_id, format)
      .then((res) => {
        const url = window.URL.createObjectURL(new Blob([res.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `eval_report_${activeReport.run_id}.${format}`);
        document.body.appendChild(link);
        link.click();
        link.remove();
      })
      .catch((err) => console.error(err));
  };

  if (loading) {
    return (
      <div className="page">
        <Header title="Quality Reports & Export" />
        <LoadingState message="Loading historical reports and audit trails..." />
      </div>
    );
  }

  const summary = activeReport?.summary || {};
  const results = activeReport?.results || [];

  return (
    <div className="page">
      <Header
        title={activeReport ? `Evaluation Report: ${activeReport.run_id}` : 'Evaluation Reports & Export'}
        description={
          activeReport
            ? `Generated audit report for ${activeReport.dataset_name} (${activeReport.model_name})`
            : 'Review historical evaluations, inspect test failures, and export auditable JSON, CSV, and HTML reports.'
        }
        actions={
          activeReport ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => navigate('/reports')}
              >
                <ArrowLeft size={13} /> Back to Reports
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => handleDownload('json')}
              >
                <Download size={13} /> Export JSON
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => handleDownload('csv')}
              >
                <Download size={13} /> Export CSV
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => handleDownload('html')}
              >
                <Download size={13} /> Download Executive HTML
              </button>
            </div>
          ) : undefined
        }
      />

      {/* DETAILED REPORT VIEW */}
      {activeReport ? (
        <div className="flex flex-col gap-4">
          {/* Executive Summary Cards */}
          <div className="cards-grid cards-grid-4">
            <MetricCard
              label="Overall Score"
              value={summary.avg_score}
              sub="Aggregate benchmark score"
              color="var(--accent-violet)"
            />
            <MetricCard
              label="Pass Rate"
              value={`${summary.pass_rate}%`}
              sub={`${summary.passed_cases} / ${summary.total_cases} passed`}
              color={summary.pass_rate >= 80 ? 'var(--accent-green)' : 'var(--accent-red)'}
            />
            <MetricCard
              label="Hallucinations"
              value={summary.hallucination_count}
              sub="Grounding contradictions"
              color={summary.hallucination_count > 0 ? 'var(--accent-red)' : 'var(--accent-green)'}
            />
            <MetricCard
              label="Avg Latency"
              value={`${summary.avg_latency_ms} ms`}
              sub={`Total duration: ${Math.round(summary.execution_time_ms || 0)}ms`}
              color="var(--accent-blue)"
            />
          </div>

          {/* Results Table */}
          <div className="card">
            <div className="section-header">
              <h3>Individual Case Results ({results.length})</h3>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  className="form-input"
                  style={{ paddingLeft: '28px', width: '220px' }}
                  placeholder="Filter cases..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <Search size={13} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Case ID</th>
                    <th>Category</th>
                    <th>User Prompt</th>
                    <th>Model Response</th>
                    <th>Accuracy</th>
                    <th>Groundedness</th>
                    <th>Score</th>
                    <th>Status</th>
                    <th>Inspect</th>
                  </tr>
                </thead>
                <tbody>
                  {results
                    .filter((r: any) =>
                      r.prompt.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      r.actual_output.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      r.test_case_id.toLowerCase().includes(searchQuery.toLowerCase())
                    )
                    .map((r: any) => (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 600, color: 'var(--accent-blue)' }}>{r.test_case_id}</td>
                        <td>
                          <span className="badge badge-gray">{r.category}</span>
                        </td>
                        <td style={{ maxWidth: '240px' }} className="truncate">
                          {r.prompt}
                        </td>
                        <td style={{ maxWidth: '300px' }} className="truncate">
                          {r.actual_output}
                        </td>
                        <td>{Math.round(r.metrics.accuracy * 100)}%</td>
                        <td>{Math.round(r.metrics.groundedness * 100)}%</td>
                        <td style={{ fontWeight: 700 }}>{r.metrics.overall_score}</td>
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
                            className="btn-icon"
                            onClick={() => setSelectedCase(r)}
                            title="Inspect complete prompt & diagnostics"
                          >
                            <Eye size={14} />
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
        /* REPORTS LIST VIEW */
        <div className="card">
          <div className="section-header">
            <h2>Available Evaluation Reports</h2>
            <span className="text-muted" style={{ fontSize: '12px' }}>{runs.length} runs on record</span>
          </div>

          {runs.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No reports generated yet"
              description="Execute an evaluation to generate exportable JSON, CSV, and HTML reports."
              actionLabel="Go to Evaluation Center"
              onAction={() => navigate('/evaluations')}
            />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Report ID</th>
                    <th>Dataset Suite</th>
                    <th>Model</th>
                    <th>Provider</th>
                    <th>Pass Rate</th>
                    <th>Score</th>
                    <th>Hallucinations</th>
                    <th>Created At</th>
                    <th>Actions</th>
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
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => navigate(`/reports/${r.id}`)}
                          >
                            View
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* CASE INSPECTION MODAL */}
      {selectedCase && (
        <div className="modal-overlay" onClick={() => setSelectedCase(null)}>
          <div className="modal" style={{ maxWidth: '700px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="flex items-center gap-2">
                <StatusBadge passed={selectedCase.passed} />
                <h3>Case: {selectedCase.test_case_id}</h3>
              </div>
            </div>
            <div className="modal-body flex flex-col gap-3">
              <div>
                <label className="form-label">Prompt</label>
                <div className="code-block" style={{ color: 'var(--text-primary)' }}>
                  {selectedCase.prompt}
                </div>
              </div>
              <div>
                <label className="form-label">Model Response</label>
                <div className="code-block" style={{ color: selectedCase.passed ? 'var(--text-primary)' : 'var(--accent-red)' }}>
                  {selectedCase.actual_output}
                </div>
              </div>
              <div>
                <label className="form-label">Expected Reference Output</label>
                <div className="code-block" style={{ color: 'var(--text-secondary)' }}>
                  {selectedCase.expected_output || 'No expected output defined'}
                </div>
              </div>
              {selectedCase.judge_reasoning && (
                <div>
                  <label className="form-label">Judge Reasoning</label>
                  <div className="card card-sm" style={{ fontSize: '13px', background: 'var(--bg-primary)' }}>
                    {selectedCase.judge_reasoning}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSelectedCase(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
