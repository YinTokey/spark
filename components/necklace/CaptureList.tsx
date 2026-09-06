import type { Capture } from "./recorderMachine.ts";
import { formatMinutesSeconds } from "./format.ts";

function CaptureThumbnail({ peaks }: { peaks: number[] }) {
  const width = peaks.length * 3;
  return (
    <svg
      className="necklace-log-thumb"
      viewBox={`0 0 ${width || 1} 20`}
      preserveAspectRatio="none"
      aria-hidden="true"
      fill="#C77D08"
    >
      {peaks.map((level, i) => {
        const barHeight = Math.max(1, level * 16);
        return <rect key={i} x={i * 3} y={10 - barHeight / 2} width={2} height={barHeight} />;
      })}
    </svg>
  );
}

export function CaptureList({ captures }: { captures: Capture[] }) {
  if (captures.length === 0) {
    return <p className="necklace-log-empty">Nothing captured yet.</p>;
  }

  return (
    <ul className="necklace-log-list">
      {captures.map((capture, i) => (
        <li key={capture.id} className="necklace-log-item">
          <span className="necklace-log-idx">{String(captures.length - i).padStart(2, "0")}</span>
          <span className="necklace-log-dur">{formatMinutesSeconds(capture.durationMs)}</span>
          <CaptureThumbnail peaks={capture.peaks} />
          <span className="necklace-log-tag">{capture.simulated ? "sim" : "mic"}</span>
        </li>
      ))}
    </ul>
  );
}
