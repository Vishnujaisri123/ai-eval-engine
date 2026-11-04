import { AlertCircle, RotateCcw } from 'lucide-react';

interface Props {
  message: string;
  onRetry?: () => void;
}

export default function ErrorState({ message, onRetry }: Props) {
  return (
    <div className="alert alert-error flex items-center justify-between">
      <div className="flex items-center gap-2">
        <AlertCircle size={18} />
        <span>{message}</span>
      </div>
      {onRetry && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
          <RotateCcw size={13} />
          Retry
        </button>
      )}
    </div>
  );
}
