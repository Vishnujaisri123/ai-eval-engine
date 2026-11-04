interface Props {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}

export default function MetricCard({ label, value, sub, color }: Props) {
  return (
    <div className="metric-card">
      <div className="label">{label}</div>
      <div className="value" style={color ? { color } : undefined}>{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}
