// Spinner — compositor-friendly (transform-only) rotating ring. Used for running
// run indicators and in-flight submit buttons.
import "./spinner.css";

interface SpinnerProps {
  readonly size?: number;
  readonly label?: string;
}

export function Spinner({ size = 16, label }: SpinnerProps) {
  return (
    <span
      className="spinner"
      style={{ width: size, height: size }}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
