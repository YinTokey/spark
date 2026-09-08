import { useEffect, useState } from "react";
import Image from "next/image";
import { activatePendant } from "./necklace/haptics";

type Props = { recording: boolean; busy: boolean; onPress: () => void };

export function Necklace({ recording, busy, onPress }: Props) {
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    if (!pressed) return;
    const timeout = window.setTimeout(() => setPressed(false), 600);
    return () => window.clearTimeout(timeout);
  }, [pressed]);

  function pressPendant() {
    setPressed(true);
    activatePendant(recording, onPress);
  }

  return (
    <div className={`necklace ${recording ? "is-recording" : ""} ${pressed ? "is-pressed" : ""}`}>
      <Image src="/necklace.svg" alt="Spark, a polished black oval pendant with a brushed silver edge and black cord" width={520} height={850} preload />
      <button className="pendant-button" disabled={busy} aria-label={recording ? "Stop recording with Spark" : "Start recording with Spark"} onClick={pressPendant}>
        <span className="button-ring" />
      </button>
      <div className="press-note" aria-hidden="true">
        <span>{recording ? "Press to stop" : "Press here"}</span>
        <svg viewBox="0 0 82 58"><path d="M75 5Q70 42 10 42m0 0 12-9m-12 9 14 6" /></svg>
      </div>
      <span className="pendant-led" aria-hidden="true" />
    </div>
  );
}
