import { useState, useEffect } from 'react';
import {
  CheckCircle, AlertCircle, Shield, Play, Key, Server
} from 'lucide-react';
import { listModels, testConnection } from '../api';
import Header from '../components/Header';
import LoadingState from '../components/LoadingState';

export default function Settings() {
  const [modelConfig, setModelConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Test Connection State
  const [testProvider, setTestProvider] = useState('auto');
  const [testModel, setTestModel] = useState('llama3');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await listModels();
      setModelConfig(res.data);
      if (res.data.active_provider) {
        setTestProvider(res.data.active_provider);
      }
      if (res.data.active_model) {
        setTestModel(res.data.active_model);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleTestConnection = async () => {
    try {
      setTesting(true);
      setTestResult(null);
      const res = await testConnection({
        provider: testProvider,
        model: testModel,
      });
      setTestResult(res.data);
    } catch (err: any) {
      setTestResult({
        success: false,
        error: err.response?.data?.detail || err.message,
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <Header title="Settings & Providers" />
        <LoadingState message="Loading provider credentials and configuration..." />
      </div>
    );
  }

  const pStatus = modelConfig?.provider_status || {};

  return (
    <div className="page">
      <Header
        title="Settings & System Configuration"
        description="Inspect backend environment configuration, verify provider connectivity, and review evaluation thresholds."
      />

      <div className="cards-grid cards-grid-2">
        {/* Provider Status Card */}
        <div className="card">
          <div className="section-header">
            <h3>Active Provider Status</h3>
            <span className="badge badge-gray">Backend Envs</span>
          </div>

          <div className="flex flex-col gap-3">
            <div className="card card-sm flex items-center justify-between" style={{ background: 'var(--bg-primary)' }}>
              <div className="flex items-center gap-2">
                <Key size={16} className="text-blue" />
                <div>
                  <div style={{ fontWeight: 600 }}>Google Gemini API (OpenAI Compatible)</div>
                  <div className="text-muted" style={{ fontSize: '11px' }}>
                    GEMINI_API_KEY (gemini-3.8-flash)
                  </div>
                </div>
              </div>
              {pStatus.gemini ? (
                <span className="badge badge-green flex items-center gap-1">
                  <CheckCircle size={12} /> Configured
                </span>
              ) : (
                <span className="badge badge-yellow flex items-center gap-1">
                  <AlertCircle size={12} /> Not Set
                </span>
              )}
            </div>

            <div className="card card-sm flex items-center justify-between" style={{ background: 'var(--bg-primary)' }}>
              <div className="flex items-center gap-2">
                <Key size={16} className="text-yellow" />
                <div>
                  <div style={{ fontWeight: 600 }}>Groq Cloud API (High Speed)</div>
                  <div className="text-muted" style={{ fontSize: '11px' }}>
                    GROQ_API_KEY (openai/gpt-oss-20b)
                  </div>
                </div>
              </div>
              {pStatus.groq ? (
                <span className="badge badge-green flex items-center gap-1">
                  <CheckCircle size={12} /> Configured
                </span>
              ) : (
                <span className="badge badge-yellow flex items-center gap-1">
                  <AlertCircle size={12} /> Not Set
                </span>
              )}
            </div>

            <div className="card card-sm flex items-center justify-between" style={{ background: 'var(--bg-primary)' }}>
              <div className="flex items-center gap-2">
                <Key size={16} className="text-blue" />
                <div>
                  <div style={{ fontWeight: 600 }}>OpenAI / OpenRouter Compatible API</div>
                  <div className="text-muted" style={{ fontSize: '11px' }}>
                    OPENAI_API_KEY / OPENROUTER_API_KEY
                  </div>
                </div>
              </div>
              {pStatus.openai_compatible ? (
                <span className="badge badge-green flex items-center gap-1">
                  <CheckCircle size={12} /> Configured
                </span>
              ) : (
                <span className="badge badge-yellow flex items-center gap-1">
                  <AlertCircle size={12} /> Not Set
                </span>
              )}
            </div>

            <div className="card card-sm flex items-center justify-between" style={{ background: 'var(--bg-primary)' }}>
              <div className="flex items-center gap-2">
                <Server size={16} className="text-violet" />
                <div>
                  <div style={{ fontWeight: 600 }}>Local Ollama Server</div>
                  <div className="text-muted" style={{ fontSize: '11px' }}>
                    {modelConfig?.ollama_url || 'http://localhost:11434'}
                  </div>
                </div>
              </div>
              <span className="badge badge-blue">Ready</span>
            </div>

            <div className="card card-sm flex items-center justify-between" style={{ background: 'var(--bg-primary)' }}>
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-green" />
                <div>
                  <div style={{ fontWeight: 600 }}>Deterministic & Offline Evaluator</div>
                  <div className="text-muted" style={{ fontSize: '11px' }}>
                    Ground truth keyword coverage, negation checking, numeric integrity
                  </div>
                </div>
              </div>
              <span className="badge badge-green">Always Active</span>
            </div>
          </div>
        </div>

        {/* Live Provider Connection Tester */}
        <div className="card">
          <div className="section-header">
            <h3>Test Model Connectivity</h3>
          </div>

          <div className="form-group">
            <label className="form-label">Provider</label>
            <select
              className="form-select"
              value={testProvider}
              onChange={(e) => {
                const newP = e.target.value;
                setTestProvider(newP);
                if (newP === 'gemini') setTestModel('gemini-3.8-flash');
                else if (newP === 'groq') setTestModel('openai/gpt-oss-20b');
                else if (newP === 'openai') setTestModel('gpt-4o-mini');
                else if (newP === 'ollama') setTestModel('llama3');
                else if (newP === 'offline') setTestModel('deterministic-rag-v1');
              }}
              disabled={testing}
            >
              <option value="auto">Auto (Gemini / Groq / OpenRouter / OpenAI / Ollama)</option>
              <option value="gemini">Google Gemini API (gemini-3.8-flash)</option>
              <option value="groq">Groq Cloud (openai/gpt-oss-20b)</option>
              <option value="openai">OpenAI / OpenRouter API</option>
              <option value="ollama">Ollama Localhost</option>
              <option value="offline">Offline Deterministic</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Model Name</label>
            <input
              type="text"
              className="form-input"
              value={testModel}
              onChange={(e) => setTestModel(e.target.value)}
              disabled={testing}
            />
          </div>

          <button
            type="button"
            className="btn btn-primary w-full mt-2"
            onClick={handleTestConnection}
            disabled={testing}
          >
            {testing ? <div className="spinner" /> : <Play size={14} />}
            {testing ? 'Testing Connection...' : 'Ping & Test Connection'}
          </button>

          {testResult && (
            <div className="mt-3">
              {testResult.success ? (
                <div className="alert alert-success flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <CheckCircle size={16} />
                    <strong>Connection Succeeded!</strong>
                  </div>
                  <div style={{ fontSize: '12px' }}>
                    Provider: {testResult.provider} ({testResult.latency_ms}ms)
                  </div>
                  <div className="text-muted truncate" style={{ fontSize: '11px' }}>
                    Response: "{testResult.response_preview}"
                  </div>
                </div>
              ) : (
                <div className="alert alert-error flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <AlertCircle size={16} />
                    <strong>Connection Failed:</strong>
                  </div>
                  <div style={{ fontSize: '12px' }}>
                    {testResult.error || 'Failed to communicate with provider'}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Setup Guide Documentation Card */}
      <div className="card mt-4">
        <div className="section-header">
          <h3>AI Provider Setup Guide</h3>
          <span className="text-muted" style={{ fontSize: '12px' }}>Environment Variables (.env)</span>
        </div>

        <div className="flex flex-col gap-3" style={{ fontSize: '13px', lineHeight: '1.6', color: 'var(--text-secondary)' }}>
          <p>
            The platform supports zero-credential <strong>Offline Deterministic Evaluation</strong> out of the box using built-in ground-truth datasets and lexical metrics. To connect a live LLM for generation or structured evaluation judging, configure your <code>.env</code> file in the repository root:
          </p>

          <div className="code-block">
{`# 1. OpenAI-Compatible Cloud LLM (OpenAI, OpenRouter, Groq, vLLM)
OPENAI_API_KEY=your_actual_key_here
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o

# 2. Local Ollama (No API Key Required)
OLLAMA_BASE_URL=http://localhost:11434
LLM_PROVIDER=ollama
LLM_MODEL=llama3

# 3. Dedicated LLM Judge (Optional)
JUDGE_PROVIDER=openai
JUDGE_MODEL=gpt-4o`}
          </div>

          <div className="alert alert-info">
            <strong>Security Guarantee:</strong> API keys are held strictly in backend memory and environment variables. They are never transmitted to or rendered by the frontend application.
          </div>
        </div>
      </div>
    </div>
  );
}
