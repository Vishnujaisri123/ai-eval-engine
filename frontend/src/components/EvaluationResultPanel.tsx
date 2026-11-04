import { X, CheckCircle, AlertTriangle, Cpu, Clock, Zap } from 'lucide-react';
import StatusBadge from './StatusBadge';

interface EvaluationResultData {
  id: string;
  test_case_id: string;
  category: string;
  prompt: string;
  actual_output: string;
  expected_output?: string;
  accuracy: number;
  relevance: number;
  groundedness: number;
  semantic_similarity: number;
  instruction_following?: number;
  overall_score: number;
  hallucination_detected: boolean;
  hallucination_reasons?: string[];
  judge_verdict?: string;
  judge_reasoning?: string;
  is_llm_judge?: boolean;
  passed: boolean;
  latency_ms?: number;
  tokens?: number;
  error?: string;
}

interface Props {
  result: EvaluationResultData | null;
  onClose: () => void;
}

export default function EvaluationResultPanel({ result, onClose }: Props) {
  if (!result) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '780px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex items-center gap-3">
            <StatusBadge passed={result.passed} />
            <span style={{ fontWeight: 600, fontSize: '15px' }}>
              Case: {result.test_case_id}
            </span>
            <span className="badge badge-gray">{result.category}</span>
          </div>
          <button type="button" className="btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body flex flex-col gap-4">
          {/* Quality Scores Metric Bar */}
          <div className="cards-grid cards-grid-4">
            <div className="card card-sm">
              <div className="text-muted" style={{ fontSize: '11px', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>Accuracy</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent-gold)', fontFamily: 'var(--font-mono)' }}>
                {Math.round(result.accuracy * 100)}%
              </div>
            </div>
            <div className="card card-sm">
              <div className="text-muted" style={{ fontSize: '11px', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>Relevance</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent-gold)', fontFamily: 'var(--font-mono)' }}>
                {Math.round(result.relevance * 100)}%
              </div>
            </div>
            <div className="card card-sm">
              <div className="text-muted" style={{ fontSize: '11px', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>Groundedness</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent-coral)', fontFamily: 'var(--font-mono)' }}>
                {Math.round(result.groundedness * 100)}%
              </div>
            </div>
            <div className="card card-sm">
              <div className="text-muted" style={{ fontSize: '11px', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>Overall Score</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: result.passed ? 'var(--accent-green)' : 'var(--accent-red)', fontFamily: 'var(--font-mono)' }}>
                {result.overall_score}
              </div>
            </div>
          </div>

          {/* Hallucination Alert */}
          {result.hallucination_detected ? (
            <div className="alert alert-error flex items-center gap-2">
              <AlertTriangle size={18} />
              <div>
                <strong>Hallucination Detected!</strong>
                <div style={{ fontSize: '12px', marginTop: '2px' }}>
                  {result.hallucination_reasons?.join(', ') || 'Low groundedness / ungrounded claims detected'}
                </div>
              </div>
            </div>
          ) : (
            <div className="alert alert-success flex items-center gap-2">
              <CheckCircle size={18} />
              <span>Response is strictly grounded with zero detected hallucinations.</span>
            </div>
          )}

          {/* Prompt */}
          <div>
            <label className="form-label">User Prompt / Question</label>
            <div className="code-block" style={{ color: 'var(--text-primary)' }}>
              {result.prompt}
            </div>
          </div>

          {/* Model Output */}
          <div>
            <label className="form-label">Actual Model Output</label>
            <div
              className="code-block"
              style={{
                color: result.passed ? 'var(--text-primary)' : 'var(--accent-red)',
                borderLeft: result.passed ? '3px solid var(--accent-green)' : '3px solid var(--accent-red)',
              }}
            >
              {result.actual_output}
            </div>
          </div>

          {/* Expected Reference Output */}
          {result.expected_output && (
            <div>
              <label className="form-label">Expected Output (Ground Truth Reference)</label>
              <div className="code-block" style={{ color: 'var(--text-secondary)' }}>
                {result.expected_output}
              </div>
            </div>
          )}

          {/* LLM Judge Diagnostics */}
          <div className="card card-sm" style={{ background: 'var(--bg-primary)' }}>
            <div className="flex items-center justify-between mb-2">
              <span style={{ fontWeight: 600, fontSize: '12px', textTransform: 'uppercase' }}>
                Evaluation Diagnostics & Judge Verdict
              </span>
              <span className="badge badge-violet">
                {result.is_llm_judge ? 'LLM Judge' : 'Heuristic Engine'}
              </span>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              {result.judge_reasoning || 'Evaluated deterministically across lexical overlap and technical claim validity.'}
            </p>
            <div className="flex items-center gap-4 mt-3 text-muted" style={{ fontSize: '12px' }}>
              <span className="flex items-center gap-1">
                <Clock size={13} /> Latency: {result.latency_ms || 0}ms
              </span>
              <span className="flex items-center gap-1">
                <Zap size={13} /> Tokens: {result.tokens || 0}
              </span>
              {result.judge_verdict && (
                <span className="flex items-center gap-1">
                  <Cpu size={13} /> Verdict: {result.judge_verdict}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
