import Image from "next/image";

type Props = { recording: boolean; busy: boolean; onPress: () => void };

export function Necklace({ recording, busy, onPress }: Props) {
  return (
    <div className={`necklace ${recording ? "is-recording" : ""}`}>
      <Image src="/necklace.svg" alt="Spark, a polished black oval pendant with a brushed silver edge and black cord" width={520} height={850} preload />
      <button className="pendant-button" disabled={busy} aria-label={recording ? "Stop recording with Spark" : "Start recording with Spark"} onClick={onPress}>
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
