interface Props {
  passed?: boolean;
  label?: string;
  variant?: 'green' | 'red' | 'yellow' | 'blue' | 'violet' | 'gray';
}

export default function StatusBadge({ passed, label, variant }: Props) {
  if (variant) {
    return <span className={`badge badge-${variant}`}>{label}</span>;
  }
  return passed
    ? <span className="badge badge-green">PASS</span>
    : <span className="badge badge-red">FAIL</span>;
}
