type PendantProps = {
  /** Recording is live: LED glows steady. */
  ledOn: boolean;
  /** Mid-buzz: LED at half brightness, pendant jitters, button ripples. */
  buzzing: boolean;
  /** Waiting for a press: LED off, a faint ring pulses to invite the tap. */
  idle: boolean;
};

/**
 * The pendant head: bezel, glass, LED ring, and side-button nub. Purely
 * decorative SVG — the actual clickable control is a real `<button>`
 * positioned on top of it by the parent, so focus and semantics stay in the
 * DOM rather than inside `aria-hidden` markup.
 */
export function Pendant({ ledOn, buzzing, idle }: PendantProps) {
  const ledOpacity = ledOn ? 0.95 : buzzing ? 0.6 : 0;

  return (
    <g className={buzzing ? "necklace-shake" : undefined}>
      <circle className="necklace-ripple" cx={408} cy={414} r={9} fill="none" stroke="#FFB020" strokeWidth={2} />
      <circle
        className={`necklace-invite${idle ? " is-active" : ""}`}
        cx={408}
        cy={414}
        r={15}
        fill="none"
        stroke="#FFB020"
        strokeWidth={1.4}
      />
      <ellipse cx={360} cy={418} rx={52} ry={64} fill="#000" opacity={0.5} style={{ filter: "blur(1.1px)" }} />
      <ellipse cx={360} cy={414} rx={49} ry={61} fill="url(#necklace-bezel)" />
      <ellipse cx={360} cy={414} rx={43.5} ry={55.5} fill="#1A1C21" />
      <ellipse
        cx={360}
        cy={414}
        rx={41.5}
        ry={53.5}
        fill="none"
        stroke="#FFB020"
        strokeWidth={2.6}
        opacity={ledOpacity}
      />
      <ellipse cx={360} cy={414} rx={39} ry={51} fill="url(#necklace-glass)" />
      <ellipse cx={345} cy={392} rx={17} ry={12} fill="#fff" opacity={0.1} transform="rotate(-26 345 392)" />
      <ellipse cx={374} cy={446} rx={9} ry={5} fill="#fff" opacity={0.045} transform="rotate(-26 374 446)" />
      <rect x={buzzing ? 402 : 404} y={399} width={9} height={30} rx={4} fill="url(#necklace-bezel)" />
      <rect x={406} y={404} width={2} height={20} rx={1} fill="#2B2F36" opacity={0.8} />
    </g>
  );
}
