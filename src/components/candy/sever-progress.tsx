import "@/styles/sever-progress.css";

export function SeverProgress({ value }: { value: number }) {
  return (
    <div className="sever-progress">
      <progress className="sever-progress__bar" value={value} max={100}
        aria-label="Tiến trình chuyển Sever" />
      <span className="sever-progress__value" aria-hidden="true">{value}%</span>
    </div>
  );
}