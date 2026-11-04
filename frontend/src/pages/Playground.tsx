import React, { useState, useEffect } from 'react';
import {
  Send, Save, Clock, Zap, DollarSign,
  AlertCircle, CheckCircle, Database, History, Cpu
} from 'lucide-react';
import { runPlayground, getPlaygroundHistory, listDatasets, savePlaygroundTestCase } from '../api';
import Header from '../components/Header';
import ModelSelector from '../components/ModelSelector';

export default function Playground() {
  const [prompt, setPrompt] = useState('How much power does the Atomberg Renesa fan consume at speed 5?');
  const [systemPrompt, setSystemPrompt] = useState('You are an official Atomberg Smart Appliances AI Support Assistant. Answer the user question strictly using ONLY the provided context.');
  const [context, setContext] = useState('The Atomberg Renesa ceiling fan uses an energy-efficient BLDC motor that consumes 28W at speed 5 and saves up to 65% electricity.');
  const [provider, setProvider] = useState('auto');
  const [model, setModel] = useState('llama3');
  const [temperature, setTemperature] = useState(0.2);

  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);

  // Save Modal State
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [datasets, setDatasets] = useState<any[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [testCaseName, setTestCaseName] = useState('');
  const [expectedOutput, setExpectedOutput] = useState('');
  const [expectedKeywords, setExpectedKeywords] = useState('28w, bldc');
  const [saveSuccess, setSaveSuccess] = useState(false);

  const loadHistory = async () => {
    try {
      const res = await getPlaygroundHistory();
      setHistory(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadDatasets = async () => {
    try {
      const res = await listDatasets();
      setDatasets(res.data);
      if (res.data.length > 0 && !selectedDatasetId) {
        setSelectedDatasetId(res.data[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadHistory();
    loadDatasets();
  }, []);

  const handleRun = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const res = await runPlayground({
        prompt,
        system_prompt: systemPrompt,
        context,
        provider,
        model,
        temperature,
      });

      if (res.data.error) {
        setError(res.data.error);
      }
      setResponse(res.data);
      loadHistory();
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Playground request failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTestCase = async () => {
    if (!selectedDatasetId) {
      alert('Please select or create a dataset first');
      return;
    }

    try {
      const keywords = expectedKeywords.split(',').map((k) => k.trim()).filter(Boolean);
      await savePlaygroundTestCase({
        dataset_id: selectedDatasetId,
        name: testCaseName || `Playground Test: ${prompt.slice(0, 30)}`,
        prompt,
        system_prompt: systemPrompt,
        context,
        expected_output: expectedOutput || response?.response || '',
        actual_output: response?.response || '',
        expected_keywords: keywords,
        category: 'playground',
        threshold: 0.70,
      });

      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setShowSaveModal(false);
      }, 1500);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to save test case');
    }
  };

  return (
    <div className="page">
      <Header
        title="AI Playground"
        description="Interact directly with configured AI models, benchmark latency & tokens, and convert successful interactions into regression test cases."
      />

      <div className="cards-grid cards-grid-3">
        {/* Left Column: Configuration & Prompt (2 spans) */}
        <div style={{ gridColumn: 'span 2' }} className="flex flex-col gap-4">
          <div className="card">
            <div className="section-header">
              <h3>Model & Prompt Configuration</h3>
              <span className="badge badge-gray flex items-center gap-1">
                <Cpu size={12} /> Provider: {provider}
              </span>
            </div>

            <ModelSelector
              provider={provider}
              model={model}
              onProviderChange={setProvider}
              onModelChange={setModel}
              disabled={loading}
            />

            <div className="form-group">
              <div className="flex items-center justify-between mb-1">
                <label className="form-label">System Instructions</label>
                <span className="text-muted" style={{ fontSize: '11px' }}>Role / Safety Guardrail</span>
              </div>
              <textarea
                className="form-textarea"
                rows={2}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Instructions governing the AI's persona, constraints, or tone..."
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <div className="flex items-center justify-between mb-1">
                <label className="form-label">Reference Context (RAG Knowledge / Documentation)</label>
                <span className="text-muted" style={{ fontSize: '11px' }}>Optional Source Documents</span>
              </div>
              <textarea
                className="form-textarea"
                rows={3}
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="Product specs, warranty details, knowledge base chunks..."
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label className="form-label">User Question / Test Prompt</label>
              <textarea
                className="form-textarea"
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Enter user prompt or query..."
                disabled={loading}
              />
            </div>

            <div className="flex items-center justify-between mt-4">
              <div className="flex items-center gap-3">
                <label className="text-muted" style={{ fontSize: '12px' }}>
                  Temperature: <strong>{temperature}</strong>
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  disabled={loading}
                  style={{ width: '120px' }}
                />
              </div>

              <button
                type="button"
                className="btn btn-primary"
                onClick={() => handleRun()}
                disabled={loading || !prompt.trim()}
              >
                {loading ? <div className="spinner" /> : <Send size={14} />}
                {loading ? 'Generating...' : 'Run Prompt'}
              </button>
            </div>
          </div>

          {/* Model Response Card */}
          <div className="card">
            <div className="section-header">
              <h3>Model Response</h3>
              {response && (
                <div className="flex items-center gap-2">
                  <span className="badge badge-gray">{response.provider}</span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setExpectedOutput(response.response);
                      setShowSaveModal(true);
                    }}
                  >
                    <Save size={13} />
                    Save as Test Case
                  </button>
                </div>
              )}
            </div>

            {error && (
              <div className="alert alert-error flex items-center gap-2">
                <AlertCircle size={18} />
                <div>
                  <strong>Provider Failure:</strong>
                  <div style={{ fontSize: '12px', marginTop: '2px' }}>{error}</div>
                </div>
              </div>
            )}

            {loading ? (
              <div className="loading-center">
                <div className="spinner" />
                <span>Querying configured AI provider...</span>
              </div>
            ) : response ? (
              <div className="flex flex-col gap-3">
                <div
                  className="code-block"
                  style={{
                    minHeight: '120px',
                    color: response.error ? 'var(--accent-red)' : 'var(--text-primary)',
                    fontSize: '13px',
                    lineHeight: '1.6',
                  }}
                >
                  {response.response}
                </div>

                {/* Telemetry Metrics */}
                <div className="cards-grid cards-grid-4 mt-2">
                  <div className="card card-sm flex items-center gap-2">
                    <Clock size={16} className="text-blue" />
                    <div>
                      <div className="text-muted" style={{ fontSize: '10px' }}>LATENCY</div>
                      <div style={{ fontWeight: 600 }}>{response.latency_ms} ms</div>
                    </div>
                  </div>
                  <div className="card card-sm flex items-center gap-2">
                    <Zap size={16} className="text-yellow" />
                    <div>
                      <div className="text-muted" style={{ fontSize: '10px' }}>TOTAL TOKENS</div>
                      <div style={{ fontWeight: 600 }}>{response.tokens}</div>
                    </div>
                  </div>
                  <div className="card card-sm flex items-center gap-2">
                    <DollarSign size={16} className="text-green" />
                    <div>
                      <div className="text-muted" style={{ fontSize: '10px' }}>EST. COST</div>
                      <div style={{ fontWeight: 600 }}>${response.estimated_cost_usd}</div>
                    </div>
                  </div>
                  <div className="card card-sm flex items-center gap-2">
                    <Database size={16} className="text-violet" />
                    <div>
                      <div className="text-muted" style={{ fontSize: '10px' }}>MODEL</div>
                      <div style={{ fontWeight: 600, fontSize: '12px' }} className="truncate">
                        {response.model}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-muted" style={{ padding: '36px', textAlign: 'center' }}>
                Run a prompt above to view real model generation, token breakdown, and latency telemetry.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Interaction History */}
        <div className="card" style={{ height: 'fit-content' }}>
          <div className="section-header">
            <h3 className="flex items-center gap-2">
              <History size={16} /> Recent Interactions
            </h3>
            <span className="text-muted" style={{ fontSize: '11px' }}>{history.length} logged</span>
          </div>

          <div className="flex flex-col gap-2" style={{ maxHeight: '600px', overflowY: 'auto' }}>
            {history.length === 0 ? (
              <div className="text-muted" style={{ fontSize: '12px', padding: '16px 0' }}>
                No history yet. Interactions will appear here.
              </div>
            ) : (
              history.map((item) => (
                <div
                  key={item.id}
                  className="card card-sm"
                  style={{
                    background: 'var(--bg-primary)',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s',
                  }}
                  onClick={() => {
                    setPrompt(item.prompt);
                    setSystemPrompt(item.system_prompt || '');
                    setContext(item.context || '');
                    setProvider(item.provider || 'auto');
                    setModel(item.model_name || 'llama3');
                  }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="badge badge-gray" style={{ fontSize: '10px' }}>
                      {item.model_name || 'model'}
                    </span>
                    <span className="text-muted" style={{ fontSize: '11px' }}>
                      {item.latency_ms} ms
                    </span>
                  </div>
                  <div style={{ fontWeight: 500, fontSize: '12px' }} className="truncate">
                    {item.prompt}
                  </div>
                  <div className="text-muted truncate mt-1" style={{ fontSize: '11px' }}>
                    {item.response}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Save As Test Case Modal */}
      {showSaveModal && (
        <div className="modal-overlay" onClick={() => setShowSaveModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Save as Regression Test Case</h3>
            </div>
            <div className="modal-body flex flex-col gap-3">
              {saveSuccess ? (
                <div className="alert alert-success flex items-center gap-2">
                  <CheckCircle size={18} />
                  <span>Test case successfully added to dataset!</span>
                </div>
              ) : (
                <>
                  <div className="form-group">
                    <label className="form-label">Target Dataset</label>
                    <select
                      className="form-select"
                      value={selectedDatasetId}
                      onChange={(e) => setSelectedDatasetId(e.target.value)}
                    >
                      {datasets.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.test_case_count} cases)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Test Case Name</label>
                    <input
                      type="text"
                      className="form-input"
                      value={testCaseName}
                      placeholder="e.g. Renesa Speed 5 Wattage Check"
                      onChange={(e) => setTestCaseName(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Expected Output (Ground Truth Reference)</label>
                    <textarea
                      className="form-textarea"
                      rows={2}
                      value={expectedOutput}
                      onChange={(e) => setExpectedOutput(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Required Keywords (comma-separated)</label>
                    <input
                      type="text"
                      className="form-input"
                      value={expectedKeywords}
                      onChange={(e) => setExpectedKeywords(e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>
            {!saveSuccess && (
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowSaveModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSaveTestCase}
                >
                  Save to Test Suite
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
