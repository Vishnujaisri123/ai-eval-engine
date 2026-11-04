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
  const handleProviderChange = (newProvider: string) => {
    onProviderChange(newProvider);
    if (newProvider === 'gemini' && (!model || model === 'llama3' || model === 'gpt-4o')) {
      onModelChange('gemini-3.8-flash');
    } else if (newProvider === 'groq' && (!model || model === 'llama3' || model === 'gpt-4o')) {
      onModelChange('openai/gpt-oss-20b');
    } else if (newProvider === 'openai' && (!model || model === 'llama3')) {
      onModelChange('gpt-4o-mini');
    } else if (newProvider === 'ollama' && (!model || model.includes('gemini') || model.includes('gpt'))) {
      onModelChange('llama3');
    } else if (newProvider === 'offline') {
      onModelChange('deterministic-rag-v1');
    }
  };

  return (
    <div className="form-row">
      <div className="form-group">
        <label className="form-label">AI Provider</label>
        <select
          className="form-select"
          value={provider}
          onChange={(e) => handleProviderChange(e.target.value)}
          disabled={disabled}
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
        <label className="form-label">Model Identifier</label>
        <input
          type="text"
          className="form-input"
          placeholder="e.g. gemini-3.8-flash, openai/gpt-oss-20b, gpt-4o-mini, llama3"
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
