import { useEffect, useState } from 'react';
import { ShieldCheck, Cpu, Database } from 'lucide-react';
import { listModels } from '../api';

interface Props {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export default function Header({ title, description, actions }: Props) {
  const [providerInfo, setProviderInfo] = useState<{
    active_provider?: string;
    active_model?: string;
    has_api_key?: boolean;
  }>({});

  useEffect(() => {
    listModels()
      .then((res) => {
        setProviderInfo({
          active_provider: res.data.active_provider,
          active_model: res.data.active_model,
          has_api_key: res.data.provider_status?.openai_compatible,
        });
      })
      .catch(() => {});
  }, []);

  return (
    <header className="page-header flex items-center justify-between" style={{ marginBottom: '24px' }}>
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="flex items-center gap-3">
        <div className="badge badge-gray flex items-center gap-2" style={{ padding: '6px 12px' }}>
          <Cpu size={13} className="text-blue" />
          <span>
            Provider: <strong>{providerInfo.active_provider || 'auto'}</strong> ({providerInfo.active_model || 'llama3'})
          </span>
        </div>
        {providerInfo.has_api_key ? (
          <div className="badge badge-green flex items-center gap-1" style={{ padding: '6px 10px' }}>
            <ShieldCheck size={13} />
            <span>Live API Connected</span>
          </div>
        ) : (
          <div className="badge badge-yellow flex items-center gap-1" style={{ padding: '6px 10px' }} title="Running with local / offline fallback. Set OPENAI_API_KEY for live cloud evaluation.">
            <Database size={13} />
            <span>Local / Offline Mode</span>
          </div>
        )}
        {actions}
      </div>
    </header>
  );
}
