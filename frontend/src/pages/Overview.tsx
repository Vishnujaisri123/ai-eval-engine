import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend, PieChart, Pie, Cell
} from 'recharts';
import {
  Play, PlusCircle, AlertTriangle,
  ArrowUpRight, Database
} from 'lucide-react';
import { getDashboardSummary, getDashboardAnalytics, getDashboardActivity, seedDatasets } from '../api';
import Header from '../components/Header';
import MetricCard from '../components/MetricCard';
import StatusBadge from '../components/StatusBadge';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';

export default function Overview() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [seeding, setSeeding] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [sumRes, anaRes, actRes] = await Promise.all([
        getDashboardSummary(),
        getDashboardAnalytics(),
        getDashboardActivity(),
      ]);
      setSummary(sumRes.data);
      setAnalytics(anaRes.data);
      setActivity(actRes.data);
    } catch (err) {
      console.error('Failed to load dashboard data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSeed = async () => {
    try {
      setSeeding(true);
      await seedDatasets();
      await fetchData();
    } catch (err) {
      console.error('Failed to seed datasets', err);
    } finally {
      setSeeding(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <Header title="Quality Overview & Metrics" />
        <LoadingState message="Loading platform analytics and telemetry..." />
      </div>
    );
  }

  const hasRuns = summary && summary.total_runs > 0;

  return (
    <div className="page">
      <Header
        title="Quality Overview & Analytics"
        description="Real-time quality indicators, hallucination rates, model latency, and regression metrics."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleSeed}
              disabled={seeding}
            >
              <Database size={13} />
              {seeding ? 'Seeding...' : 'Seed Datasets'}
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => navigate('/evaluations')}
            >
              <Play size={13} />
              New Evaluation
            </button>
          </div>
        }
      />

      {!hasRuns ? (
        <EmptyState
          icon={PlusCircle}
          title="No evaluations recorded yet"
          description="Initialize test suites and run your first benchmark to start monitoring AI quality, hallucinations, and prompt regressions."
          actionLabel="Seed Starter Datasets & Evaluate"
          onAction={async () => {
            await handleSeed();
            navigate('/evaluations');
          }}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {/* Top Metric Cards Grid */}
          <div className="cards-grid cards-grid-4">
            <MetricCard
              label="Total Evaluations"
              value={summary.total_runs}
              sub={`${summary.total_test_cases} test cases evaluated`}
              color="var(--accent-blue)"
            />
            <MetricCard
              label="Quality Pass Rate"
              value={`${summary.pass_rate}%`}
              sub={`${summary.failed_count} failures caught`}
              color={summary.pass_rate >= 80 ? 'var(--accent-green)' : 'var(--accent-yellow)'}
            />
            <MetricCard
              label="Average Quality Score"
              value={summary.avg_score}
              sub="Across accuracy, groundedness & similarity"
              color="var(--accent-violet)"
            />
            <MetricCard
              label="Hallucinations Detected"
              value={summary.hallucination_count}
              sub={`${summary.safety_failure_count} safety policy violations`}
              color={summary.hallucination_count > 0 ? 'var(--accent-red)' : 'var(--accent-green)'}
            />
          </div>

          {/* Quick Notice Banner if Regressions or Safety Violations Detected */}
          {(summary.regression_count > 0 || summary.safety_failure_count > 0) && (
            <div className="alert alert-warning flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} />
                <span>
                  <strong>Active Quality Alerts:</strong> {summary.regression_count} regressions detected and {summary.safety_failure_count} safety vulnerabilities flagged.
                </span>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => navigate('/regression')}
              >
                Inspect Regressions
                <ArrowUpRight size={13} />
              </button>
            </div>
          )}

          {/* Analytics Charts Grid */}
          <div className="cards-grid cards-grid-2">
            {/* Score & Pass Rate Over Time */}
            <div className="card">
              <div className="section-header">
                <h3>Evaluation Score History</h3>
                <span className="text-muted" style={{ fontSize: '11px' }}>Chronological Runs</span>
              </div>
              <div style={{ height: 240, width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={analytics?.score_over_time || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 2" stroke="#2d1a54" />
                    <XAxis dataKey="date" stroke="#7b6ab0" fontSize={11} fontFamily="var(--font-mono)" />
                    <YAxis stroke="#7b6ab0" fontSize={11} domain={[0, 1]} fontFamily="var(--font-mono)" />
                    <Tooltip
                      contentStyle={{ background: '#150c28', border: '1px solid #4b2f7e', borderRadius: '2px', fontSize: '11px', fontFamily: 'var(--font-mono)', color: '#f4e6c8' }}
                    />
                    <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }} />
                    <Line type="monotone" dataKey="avg_score" name="Avg Quality Score" stroke="#f9c74f" strokeWidth={2} dot={{ r: 3, fill: '#f47b5c' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Model Performance Comparison */}
            <div className="card">
              <div className="section-header">
                <h3>Model Performance Comparison</h3>
                <span className="text-muted" style={{ fontSize: '11px' }}>Avg Quality by Model</span>
              </div>
              <div style={{ height: 240, width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics?.model_comparison || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 2" stroke="#2d1a54" />
                    <XAxis dataKey="model" stroke="#7b6ab0" fontSize={11} fontFamily="var(--font-mono)" />
                    <YAxis stroke="#7b6ab0" fontSize={11} domain={[0, 1]} fontFamily="var(--font-mono)" />
                    <Tooltip
                      contentStyle={{ background: '#150c28', border: '1px solid #4b2f7e', borderRadius: '2px', fontSize: '11px', fontFamily: 'var(--font-mono)', color: '#f4e6c8' }}
                    />
                    <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }} />
                    <Bar dataKey="avg_score" name="Model Score" fill="#f47b5c" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Secondary Charts: Category Breakdown & Pass/Fail */}
          <div className="cards-grid cards-grid-3">
            {/* Pass vs Fail Distribution */}
            <div className="card">
              <div className="section-header">
                <h3>Test Pass / Fail Ratio</h3>
              </div>
              <div style={{ height: 200, width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Passed', value: analytics?.pass_fail_distribution?.passed || 0, color: '#4ade80' },
                        { name: 'Failed', value: analytics?.pass_fail_distribution?.failed || 0, color: '#f87171' },
                      ]}
                      innerRadius={50}
                      outerRadius={75}
                      dataKey="value"
                      paddingAngle={4}
                    >
                      <Cell fill="#4ade80" />
                      <Cell fill="#f87171" />
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', fontSize: '12px' }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Category Performance Breakdown */}
            <div className="card" style={{ gridColumn: 'span 2' }}>
              <div className="section-header">
                <h3>Performance Across Evaluation Categories</h3>
                <span className="text-muted" style={{ fontSize: '11px' }}>Domain Reliability</span>
              </div>
              <div style={{ height: 200, width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics?.category_breakdown || []} layout="vertical" margin={{ top: 5, right: 20, left: 40, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis type="number" domain={[0, 1]} stroke="#64748b" fontSize={11} />
                    <YAxis type="category" dataKey="category" stroke="#64748b" fontSize={11} />
                    <Tooltip
                      contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', fontSize: '12px' }}
                    />
                    <Bar dataKey="avg_score" name="Category Score" fill="#38bdf8" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Recent Activity Table */}
          <div className="card">
            <div className="section-header">
              <h2>Recent Evaluation Runs</h2>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => navigate('/reports')}
              >
                View Full History
              </button>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Run ID</th>
                    <th>Dataset</th>
                    <th>Model</th>
                    <th>Provider</th>
                    <th>Pass Rate</th>
                    <th>Quality Score</th>
                    <th>Cases</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600, color: 'var(--accent-blue)' }}>{r.id}</td>
                      <td>{r.dataset_name || 'Standard Suite'}</td>
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
                        <StatusBadge passed={r.status === 'completed'} label={r.status.toUpperCase()} />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => navigate(`/evaluations/${r.id}`)}
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
