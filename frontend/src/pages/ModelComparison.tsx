import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend
} from 'recharts';
import {
  Layers, Play, Trophy, Plus, Trash2
} from 'lucide-react';
import { listDatasets, compareModels } from '../api';
import Header from '../components/Header';
import LoadingState from '../components/LoadingState';

export default function ModelComparison() {
  const [datasets, setDatasets] = useState<any[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [modelsToCompare, setModelsToCompare] = useState<any[]>([
    { model_name: 'gemini-3.8-flash', provider: 'gemini' },
    { model_name: 'openai/gpt-oss-20b', provider: 'groq' },
  ]);

  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [comparisonResult, setComparisonResult] = useState<any>(null);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const dsRes = await listDatasets();
      setDatasets(dsRes.data);
      if (dsRes.data.length > 0) {
        setSelectedDatasetId(dsRes.data[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  const addModelRow = () => {
    setModelsToCompare([...modelsToCompare, { model_name: 'mistral', provider: 'auto' }]);
  };

  const removeModelRow = (index: number) => {
    if (modelsToCompare.length <= 2) {
      alert('Must compare at least 2 models');
      return;
    }
    setModelsToCompare(modelsToCompare.filter((_, i) => i !== index));
  };

  const updateModelField = (index: number, field: string, value: string) => {
    const updated = [...modelsToCompare];
    updated[index][field] = value;
    setModelsToCompare(updated);
  };

  const handleRunComparison = async () => {
    if (!selectedDatasetId) {
      alert('Please select a dataset');
      return;
    }

    try {
      setComparing(true);
      const res = await compareModels({
        dataset_id: selectedDatasetId,
        model_configs: modelsToCompare,
        pass_threshold: 0.70,
      });
      setComparisonResult(res.data);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Model comparison failed');
    } finally {
      setComparing(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <Header title="Model Benchmarking & Comparison" />
        <LoadingState message="Loading dataset suites and model configurations..." />
      </div>
    );
  }

  const chartData = (comparisonResult?.comparisons || []).map((c: any) => ({
    model: c.model_name,
    Score: c.avg_score,
    'Pass Rate (%)': c.pass_rate,
    'Latency (s)': Math.round(c.avg_latency_ms) / 1000,
  }));

  return (
    <div className="page">
      <Header
        title="Model Comparison & Benchmarking"
        description="Run identical test suites side-by-side across two or more AI models to evaluate quality scores, latency, hallucinations, and token efficiency."
      />

      <div className="cards-grid cards-grid-3">
        {/* Left Column: Model Setup */}
        <div className="card" style={{ height: 'fit-content' }}>
          <div className="section-header">
            <h3>Configure Comparison</h3>
          </div>

          <div className="form-group">
            <label className="form-label">Benchmark Test Suite</label>
            <select
              className="form-select"
              value={selectedDatasetId}
              onChange={(e) => setSelectedDatasetId(e.target.value)}
              disabled={comparing}
            >
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.test_case_count} cases)
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <div className="flex items-center justify-between mb-2">
              <label className="form-label">Models to Evaluate</label>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={addModelRow}
                disabled={comparing}
              >
                <Plus size={12} /> Add Model
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {modelsToCompare.map((m, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    className="form-select"
                    style={{ width: '130px' }}
                    value={m.provider}
                    onChange={(e) => {
                      const newProv = e.target.value;
                      const updated = [...modelsToCompare];
                      updated[idx].provider = newProv;
                      if (newProv === 'gemini') updated[idx].model_name = 'gemini-3.8-flash';
                      else if (newProv === 'groq') updated[idx].model_name = 'openai/gpt-oss-20b';
                      else if (newProv === 'openai') updated[idx].model_name = 'gpt-4o-mini';
                      else if (newProv === 'ollama') updated[idx].model_name = 'llama3';
                      else if (newProv === 'offline') updated[idx].model_name = 'deterministic-rag-v1';
                      setModelsToCompare(updated);
                    }}
                    disabled={comparing}
                  >
                    <option value="auto">Auto</option>
                    <option value="gemini">Gemini</option>
                    <option value="groq">Groq</option>
                    <option value="openai">OpenAI</option>
                    <option value="ollama">Ollama</option>
                    <option value="offline">Offline</option>
                  </select>
                  <input
                    type="text"
                    className="form-input"
                    value={m.model_name}
                    placeholder="Model identifier"
                    onChange={(e) => updateModelField(idx, 'model_name', e.target.value)}
                    disabled={comparing}
                  />
                  {modelsToCompare.length > 2 && (
                    <button
                      type="button"
                      className="btn-icon text-red"
                      onClick={() => removeModelRow(idx)}
                      disabled={comparing}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            className="btn btn-primary w-full mt-4"
            onClick={handleRunComparison}
            disabled={comparing || !selectedDatasetId}
          >
            {comparing ? <div className="spinner" /> : <Play size={14} />}
            {comparing ? 'Benchmarking Models...' : 'Run Side-by-Side Benchmark'}
          </button>
        </div>

        {/* Right Column: Comparison Results (2 spans) */}
        <div style={{ gridColumn: 'span 2' }} className="flex flex-col gap-4">
          {comparisonResult ? (
            <>
              {/* Winner Highlights Banner */}
              <div className="card" style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', border: '1px solid #38bdf8' }}>
                <div className="flex items-center gap-2 mb-2">
                  <Trophy size={20} className="text-yellow" />
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--accent-blue)' }}>
                    Benchmark Winner Summary
                  </h3>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {comparisonResult.analysis.summary}
                </p>
                <div className="cards-grid cards-grid-3 mt-3">
                  <div className="card card-sm">
                    <div className="text-muted" style={{ fontSize: '10px' }}>HIGHEST ACCURACY</div>
                    <div style={{ fontWeight: 700, color: 'var(--accent-green)', fontSize: '15px' }}>
                      {comparisonResult.analysis.highest_accuracy_model}
                    </div>
                  </div>
                  <div className="card card-sm">
                    <div className="text-muted" style={{ fontSize: '10px' }}>FASTEST RESPONSE</div>
                    <div style={{ fontWeight: 700, color: 'var(--accent-blue)', fontSize: '15px' }}>
                      {comparisonResult.analysis.fastest_response_model}
                    </div>
                  </div>
                  <div className="card card-sm">
                    <div className="text-muted" style={{ fontSize: '10px' }}>HIGHEST PASS RATE</div>
                    <div style={{ fontWeight: 700, color: 'var(--accent-violet)', fontSize: '15px' }}>
                      {comparisonResult.analysis.highest_pass_rate_model}
                    </div>
                  </div>
                </div>
              </div>

              {/* Chart Comparison */}
              <div className="card">
                <div className="section-header">
                  <h3>Side-by-Side Quality Scores</h3>
                </div>
                <div style={{ height: 260, width: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="model" stroke="#64748b" fontSize={11} />
                      <YAxis stroke="#64748b" fontSize={11} domain={[0, 1]} />
                      <Tooltip
                        contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', fontSize: '12px' }}
                      />
                      <Legend />
                      <Bar dataKey="Score" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Detailed Metrics Table */}
              <div className="card">
                <div className="section-header">
                  <h3>Model Comparison Breakdown</h3>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Model</th>
                        <th>Provider</th>
                        <th>Avg Score</th>
                        <th>Pass Rate</th>
                        <th>Hallucinations</th>
                        <th>Avg Latency</th>
                        <th>Tokens Consumed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonResult.comparisons.map((c: any) => (
                        <tr key={c.model_name}>
                          <td style={{ fontWeight: 700, color: 'var(--accent-blue)' }}>{c.model_name}</td>
                          <td>
                            <span className="badge badge-gray">{c.provider}</span>
                          </td>
                          <td style={{ fontWeight: 700 }}>{c.avg_score}</td>
                          <td>
                            <span style={{ fontWeight: 600, color: c.pass_rate >= 80 ? 'var(--accent-green)' : 'var(--accent-yellow)' }}>
                              {c.pass_rate}%
                            </span>
                          </td>
                          <td>
                            {c.hallucination_count > 0 ? (
                              <span className="text-red font-semibold">{c.hallucination_count}</span>
                            ) : (
                              <span className="text-muted">0</span>
                            )}
                          </td>
                          <td>{Math.round(c.avg_latency_ms)} ms</td>
                          <td>{c.total_tokens}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="card flex items-center justify-center" style={{ minHeight: '360px' }}>
              <div className="text-muted" style={{ textAlign: 'center', padding: '32px' }}>
                <Layers size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
                <h3>No comparison run yet</h3>
                <p style={{ maxWidth: '340px', fontSize: '13px', marginTop: '6px' }}>
                  Select a test suite and at least 2 models on the left, then click 'Run Side-by-Side Benchmark'.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
