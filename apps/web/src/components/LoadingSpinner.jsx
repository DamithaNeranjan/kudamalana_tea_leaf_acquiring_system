export function LoadingSpinner({ label = "Loading" }) {
  return <span className="loading-spinner" role="status" aria-label={label}></span>;
}

export function ButtonSpinner({ label = "Loading" }) {
  return <LoadingSpinner label={label} />;
}
