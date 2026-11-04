interface Props {
  provider: string;
  model: string;
  onProviderChange: (provider: string) => void;
  onModelChange: (model: string) => void;
  disabled?: boolean;
}

export default function ModelSelector({
  provider,
  model,
  onProviderChange,
  onModelChange,
  disabled = false,
}: Props) {
  return (
    <div className="form-row">
      <div className="form-group">
        <label className="form-label">AI Provider</label>
        <select
          className="form-select"
          value={provider}
          onChange={(e) => onProviderChange(e.target.value)}
          disabled={disabled}
        >
          <option value="auto">Auto (OpenAI API / Local Ollama / Offline)</option>
          <option value="openai">OpenAI / OpenRouter API</option>
          <option value="ollama">Ollama (Localhost)</option>
          <option value="offline">Offline / Deterministic Benchmark</option>
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">Model Identifier</label>
        <input
          type="text"
          className="form-input"
          placeholder="e.g. gpt-4o, llama3, mistral"
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
