interface Props {
  message?: string;
}

export default function LoadingState({ message = 'Loading data...' }: Props) {
  return (
    <div className="loading-center">
      <div className="spinner" />
      <span>{message}</span>
    </div>
  );
}
