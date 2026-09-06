import { Pendant } from "./Pendant.tsx";

type SceneProps = {
  ledOn: boolean;
  buzzing: boolean;
  idle: boolean;
};

/**
 * Decorative SVG stage: a daylight park drifting past (parallax = walking),
 * the wearer's torso and neck, and the pendant swinging from its cord. All
 * ambient motion is CSS (see globals.css `.necklace-*` keyframes) so the
 * only JS animation loop in the feature is the waveform canvas.
 */
export function Scene({ ledOn, buzzing, idle }: SceneProps) {
  return (
    <svg viewBox="0 0 720 560" aria-hidden="true" className="necklace-scene-svg">
      <defs>
        <clipPath id="necklace-frame">
          <rect width={720} height={560} />
        </clipPath>
        <filter id="necklace-haze">
          <feGaussianBlur stdDeviation={5.5} />
        </filter>
        <filter id="necklace-haze2">
          <feGaussianBlur stdDeviation={2.4} />
        </filter>
        <radialGradient id="necklace-glass" cx="36%" cy="27%" r="78%">
          <stop offset="0" stopColor="#25282E" />
          <stop offset="42%" stopColor="#0C0D10" />
          <stop offset="100%" stopColor="#030304" />
        </radialGradient>
        <linearGradient id="necklace-bezel" x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#B9BEC6" />
          <stop offset="30%" stopColor="#666B74" />
          <stop offset="58%" stopColor="#9AA0A9" />
          <stop offset="100%" stopColor="#3E434B" />
        </linearGradient>
        <linearGradient id="necklace-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#B9D6EC" />
          <stop offset="54%" stopColor="#DAEAE0" />
          <stop offset="100%" stopColor="#EEF3DA" />
        </linearGradient>
        <linearGradient id="necklace-coat" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#2E343C" />
          <stop offset="100%" stopColor="#171A1F" />
        </linearGradient>
      </defs>

      <g clipPath="url(#necklace-frame)">
        <rect width={720} height={560} fill="url(#necklace-sky)" />

        <g filter="url(#necklace-haze)">
          <g className="necklace-drift-far">
            <g id="necklace-farset">
              <path
                d="M0 560 L0 268 Q50 224 104 250 Q152 210 206 242 Q258 206 312 240 Q366 204 420 242 Q470 212 524 246 Q576 214 630 248 Q676 224 720 250 L720 560 Z"
                fill="#C6D8B7"
              />
              <path
                d="M0 560 L0 302 Q46 264 96 288 Q142 248 198 280 Q246 246 302 278 Q354 244 410 280 Q460 252 514 284 Q564 256 620 286 Q670 262 720 290 L720 560 Z"
                fill="#A5C08F"
              />
            </g>
            <use href="#necklace-farset" x={720} />
          </g>
        </g>

        <g filter="url(#necklace-haze2)">
          <g className="necklace-drift-mid">
            <g id="necklace-midset">
              <rect x={-40} y={428} width={800} height={132} fill="#88AA65" />
              <g fill="#5B4937">
                <rect x={87} y={296} width={15} height={150} rx={4} />
                <rect x={294} y={316} width={13} height={132} rx={4} />
                <rect x={517} y={304} width={16} height={144} rx={4} />
                <rect x={686} y={322} width={12} height={124} rx={4} />
              </g>
              <g fill="#6E9256">
                <ellipse cx={94} cy={282} rx={64} ry={50} />
                <ellipse cx={52} cy={304} rx={42} ry={32} />
                <ellipse cx={134} cy={306} rx={44} ry={34} />
                <ellipse cx={300} cy={300} rx={56} ry={44} />
                <ellipse cx={264} cy={320} rx={38} ry={29} />
                <ellipse cx={336} cy={322} rx={40} ry={30} />
                <ellipse cx={524} cy={288} rx={68} ry={52} />
                <ellipse cx={478} cy={310} rx={46} ry={35} />
                <ellipse cx={568} cy={312} rx={44} ry={34} />
                <ellipse cx={692} cy={306} rx={50} ry={40} />
                <ellipse cx={660} cy={324} rx={34} ry={26} />
              </g>
              <g fill="#87AC6A" opacity={0.55}>
                <ellipse cx={72} cy={262} rx={34} ry={24} />
                <ellipse cx={286} cy={282} rx={28} ry={20} />
                <ellipse cx={502} cy={268} rx={36} ry={25} />
              </g>
              <g fill="#5C8445">
                <ellipse cx={26} cy={452} rx={48} ry={26} />
                <ellipse cx={172} cy={460} rx={56} ry={28} />
                <ellipse cx={392} cy={456} rx={52} ry={26} />
                <ellipse cx={604} cy={458} rx={60} ry={30} />
              </g>
            </g>
            <use href="#necklace-midset" x={720} />
          </g>
        </g>

        <rect width={720} height={560} fill="#FFF8E2" opacity={0.17} />

        <g className="necklace-gait">
          <path
            d="M120 560 C140 392 232 322 300 306 L420 306 C488 322 580 392 600 560 Z"
            fill="url(#necklace-coat)"
          />
          <path
            d="M300 306 C316 356 344 392 360 402 C376 392 404 356 420 306 L392 298 L328 298 Z"
            fill="#F1EFE8"
          />
          <path d="M328 298 C336 330 348 352 360 362 C372 352 384 330 392 298 Z" fill="#DAD7CE" />
          <path d="M318 210 C318 268 330 292 360 300 C390 292 402 268 402 210 Z" fill="#B48A6B" />
          <path d="M318 210 C318 250 332 276 360 284 C346 262 340 236 340 210 Z" fill="#98704F" />
          <path
            d="M296 0 L424 0 L424 128 C424 186 398 218 360 218 C322 218 296 186 296 128 Z"
            fill="#CB9C78"
          />
          <path d="M296 0 L424 0 L424 44 C424 20 400 6 360 6 C320 6 296 20 296 44 Z" fill="#3B2E24" />
          <path
            d="M300 300 C330 318 390 318 420 300 L420 316 C388 336 332 336 300 316 Z"
            fill="#000"
            opacity={0.38}
            style={{ filter: "blur(1.1px)" }}
          />
          <path
            d="M310 292 C316 336 336 384 358 414"
            stroke="#2B2F36"
            strokeWidth={3.4}
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M410 292 C404 336 384 384 362 414"
            stroke="#33383F"
            strokeWidth={3.4}
            fill="none"
            strokeLinecap="round"
          />

          <g className="necklace-swing">
            <Pendant ledOn={ledOn} buzzing={buzzing} idle={idle} />
          </g>
        </g>
      </g>
    </svg>
  );
}
