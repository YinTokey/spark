# Smart Necklace Prototype — Design

Date: 2026-09-06
Branch: `claude/smart-necklace-prototype-0efc8b`
Status: approved for planning

## 1. Purpose

Build an interactive prototype of a hardware smart necklace so the product
interaction can be evaluated before hardware exists. A wearer walks through a
daylight park wearing the pendant. Pressing the pendant's physical side button
buzzes and enters recording mode; speech drives a live waveform; pressing again
buzzes and completes the capture.

A validated HTML mock (built with the user during design) established the
final visual direction: a light, green daylight park rather than a dark city.
This section's architecture is unaffected by that choice — only the color
tokens and SVG scene content in sections 2 and 7 follow the mock.

The deliverable is a real Next.js page in this repository, not a static image.
The prototype is presentational: there is no backend, no persistence, no
account, and no upload.

### Success criteria

1. The scene reads as a person walking while wearing the product.
2. Pressing the side button produces feedback that reads as a physical buzz on a
   device that cannot vibrate.
3. Speaking into the microphone visibly drives the waveform.
4. Start and stop are distinguishable by feel alone (different buzz patterns).
5. The entire flow is operable by keyboard and announced to screen readers.
6. `npm run check` passes.

### Non-goals

Transcription, speech-to-text, storage, sync, companion-app screens, settings,
onboarding, marketing sections, and multi-page navigation are all out of scope.

## 2. Rendering approach

SVG scene, canvas waveform, real DOM for the button and text.

| Option | Verdict |
| --- | --- |
| SVG scene + canvas waveform | **Chosen.** SVG expresses the cord curve, jaw line, and oval bezel directly and scales crisply. Canvas absorbs the 30 Hz waveform redraw that would thrash the DOM. The button and copy stay real DOM, so focus, semantics, and text selection are preserved. |
| Full-canvas scene | Rejected. Destroys keyboard access and screen-reader semantics for a control-driven demo. |
| Pure CSS/DOM scene | Rejected. No curve primitives; the cord and bezel degrade into `border-radius` approximations. |

**Motion split:** all ambient motion (park parallax, gait bob, pendant swing,
buzz shake) is CSS keyframes. `requestAnimationFrame` is used only by the
waveform canvas. This keeps exactly one animation loop in JavaScript.

**Palette** (light, green-biased, daylight):

| Token | Value | Use |
| --- | --- | --- |
| `--ink` | `#F2F4EF` | Page background |
| `--stage` | `#D7E6EC` | Scene canvas fallback fill (behind the sky gradient) |
| `--panel` | `#FFFFFF` | Cards |
| `--rule` | `#DBE1D2` | Hairlines |
| `--steel` | `#59634F` | Body text (green-grey, not pure black) |
| `--steel-dim` | `#8B9580` | Secondary/muted text |
| `--bone` | `#1B2119` | Highest-contrast text |
| `--amber` | `#FFB020` | LED and waveform bars — used only on dark surfaces |
| `--amber-ui` | `#A96400` | Amber-family accent on the light page (buttons, status dot, hot spec values) — `--amber` fails contrast on `--ink` |

The waveform meter and the pendant's glass stay dark (`#12150F` panel,
near-black bezel) by deliberate value contrast against the bright scene: an
all-light page would let the pendant and its LED disappear. Distant park
foliage is lighter and less saturated than near foliage (atmospheric
perspective), which is what sells depth once the scene is no longer using a
dark backdrop to do that job.

## 3. Architecture

```
app/page.tsx                              Server Component. Page shell + copy.
components/necklace/NecklaceDemo.tsx      "use client". Orchestrates machine,
                                          audio, haptics, and timers.
components/necklace/recorderMachine.ts    Pure reducer. No React import.
components/necklace/ringBuffer.ts         Pure fixed-capacity sample buffer.
components/necklace/haptics.ts            Buzz patterns + vibrate/Web Audio.
components/necklace/useAudioLevels.ts     Mic acquisition, analyser, fallback.
components/necklace/Scene.tsx             SVG wearer, park parallax, cord.
components/necklace/Pendant.tsx           SVG pendant, LED, side button.
components/necklace/Waveform.tsx          Canvas bar meter.
components/necklace/CaptureList.tsx       Session capture list.
```

Pure logic is co-located under `components/necklace/` rather than introducing a
new top-level boundary for a single feature, consistent with the AGENTS.md rule
against placeholder layers. No file is expected to exceed 300 lines.

Only `NecklaceDemo` and its children are client components. `app/page.tsx`
remains a Server Component.

## 4. State machine

`recorderMachine.ts` exports a pure `reducer(state, event)` with no timers,
no side effects, and no browser APIs, so it is fully testable.

**States:** `idle`, `armingBuzz`, `recording`, `stoppingBuzz`, `saved`

**Events:** `PRESS`, `BUZZ_END`, `SAVE_END`

| From | Event | To | Effect |
| --- | --- | --- | --- |
| `idle` | `PRESS` | `armingBuzz` | fire start buzz |
| `armingBuzz` | `PRESS` | `armingBuzz` | ignored (debounce during buzz) |
| `armingBuzz` | `BUZZ_END` | `recording` | set `startedAt` |
| `recording` | `PRESS` | `stoppingBuzz` | compute duration, fire stop buzz |
| `stoppingBuzz` | `PRESS` | `stoppingBuzz` | ignored |
| `stoppingBuzz` | `BUZZ_END` | `saved` | append capture |
| `saved` | `SAVE_END` | `idle` | — |
| `saved` | `PRESS` | `armingBuzz` | re-record immediately, skip the wait |

Any event not listed returns the identical state object.

**Timings** (single source of truth, exported constants):

- `armingBuzz`: 180 ms — must equal the total of the start buzz pattern
- `stoppingBuzz`: 260 ms — must equal the total of the stop buzz pattern
- `saved`: 1600 ms before returning to `idle`

`NecklaceDemo` owns the `setTimeout` that dispatches `BUZZ_END` and `SAVE_END`.
Every timer is cleared on unmount and on any state change that supersedes it.

**Capture record:** `{ id, startedAt, durationMs, peaks: number[], simulated }`
where `peaks` is the waveform downsampled to 48 values for the thumbnail.

**Bounded collections** (AGENTS.md forbids unbounded growth): the capture list
holds at most 5 entries, dropping the oldest; the sample ring buffer holds
exactly 180 values.

## 5. The buzz

A screen cannot vibrate, so the buzz fires on four channels simultaneously:

1. **Web Audio** — a 62 Hz sine plus a 124 Hz sine at 0.35x gain, peak gain
   0.18, envelope 8 ms attack / hold / 30 ms release. This is the frequency
   range a haptic motor actually hums at, so it reads as vibration rather than
   as a beep.
2. **Motion** — a CSS shake on the pendant: +/-1.2 px at roughly 20 Hz.
3. **Ripple** — concentric rings expanding from the button.
4. **`navigator.vibrate()`** — feature-detected, fires where supported.

**Patterns differ by intent**, so start and stop are distinguishable without
looking:

- start: `[180]` — one pulse
- stop: `[90, 80, 90]` — pulse, gap, pulse

`patternDurationMs(pattern)` sums a pattern. A test asserts each pattern's total
equals its corresponding state duration; otherwise the buzz and the visual
desynchronise.

The `AudioContext` is created lazily inside the first press handler to satisfy
browser autoplay policy, and is shared by the buzz and the analyser. A visible
sound toggle mutes the audio channel; it defaults to on because the sound is
always user-initiated.

## 6. Audio input

`useAudioLevels(active)` returns `{ samples, mode }` where `samples` is a ref to
the ring buffer and `mode` is `'idle' | 'mic' | 'simulated'`.

Levels are written into the ring buffer ref at ~30 Hz and read by the canvas in
its own frame loop. **Level updates never go through React state** — only `mode`
does, and it changes rarely. This avoids a 30 Hz re-render.

**Mic path:** `getUserMedia({ audio: true })` -> `AudioContext` ->
`MediaStreamSource` -> `AnalyserNode` (`fftSize: 1024`,
`smoothingTimeConstant: 0.6`) -> `getFloatTimeDomainData` -> RMS -> normalised.

**Cancellation:** the effect sets a `cancelled` flag on teardown. If
`getUserMedia` resolves after teardown, the tracks are stopped immediately and
nothing is wired up. This is the stale-result rule from AGENTS.md.

**Cleanup:** stop all tracks, disconnect nodes, cancel the frame loop. The
shared `AudioContext` is closed on unmount.

**Fallback:** any of `NotAllowedError`, `NotFoundError`, absent
`navigator.mediaDevices`, or absent `AudioContext` switches `mode` to
`'simulated'` and runs a speech-shaped generator — a ~4 Hz syllable envelope
with amplitude jittered between 0.25 and 0.95 and occasional pauses. The UI
states plainly that the waveform is simulated. The demo never dead-ends, and it
never silently pretends simulated input is real.

## 7. Waveform

A dark rounded panel (`#12150F`, 10 px radius, 1 px `#2B3124` border — see the
palette in section 2) with a small uppercase mono label showing state and
elapsed time. It stays dark against the light page by design: it is a device
display, like the reference photo's black waveform strip, not a page card.

Canvas, scaled by `devicePixelRatio`. Bars are 3 px wide on a 5 px stride,
mirrored around the vertical centre, minimum height 2 px, amber, with per-bar
alpha of `0.55 + 0.45 * level` so louder bars read brighter. New samples enter
at the right and scroll left. Idle renders a flat low-alpha centre line.

On stop the frame loop halts and the last frame persists, then the strip
collapses into the capture card thumbnail.

## 8. Accessibility

Required by AGENTS.md and treated as first-class:

- The side button is a real `<button>` whose accessible name switches between
  "Start recording" and "Stop recording", with a visible focus ring. The whole
  flow is keyboard-operable.
- State changes are announced through an `aria-live="polite"` region.
- State is **never** signalled by the amber glow alone; a text label and elapsed
  timer always accompany it.
- `prefers-reduced-motion` disables the park parallax, gait bob, pendant swing,
  and buzz shake. The LED, labels, timer, and waveform remain — the waveform is
  information, not decoration. The audio buzz still fires, since the preference
  concerns motion rather than sound.
- The decorative SVG scene is `aria-hidden`; the button is not inside it.

## 9. Failure modes

| Condition | Behaviour |
| --- | --- |
| Mic permission denied | Switch to simulated mode, label it visibly |
| No mic hardware | Same as denied |
| No `AudioContext` | Visual buzz and waveform still work; no buzz sound |
| No `navigator.vibrate` | Other three buzz channels still fire |
| Rapid double-press | Ignored during buzz states by the reducer |
| Unmount mid-recording | Timers cleared, tracks stopped, context closed |
| Reduced motion | Ambient and shake animation suppressed |

## 10. Testing

Node 24 strips TypeScript natively, so `node --test` runs `.test.ts` directly
with **no new dependencies**. `npm test` is extended to include
`components/**/*.test.ts` alongside the existing hook tests. Because `tsconfig`
includes `**/*.ts`, the tests are type-checked by `npm run typecheck` too.

`recorderMachine.test.ts`

- each transition in the table above
- press is ignored during `armingBuzz` and `stoppingBuzz` (debounce)
- full happy path appends exactly one capture
- `durationMs` derives from `startedAt`
- capture list caps at 5 and drops the oldest
- `saved` + `PRESS` re-arms directly
- unknown events return the identical state object

`ringBuffer.test.ts`

- push beyond capacity overwrites oldest
- read order is oldest to newest
- boundaries: empty, exactly full, one past full

`haptics.test.ts`

- start and stop patterns are distinguishable
- each pattern's total duration equals its state duration constant

Component-level click tests are explicitly out of scope for this pass; they
would require adding `vitest`, `@testing-library/react`, and `jsdom`. This is
recorded as known coverage debt in section 12.

## 11. Verification

`npm run check` — hook tests plus the new logic tests, ESLint at zero warnings,
route typegen and strict TypeScript, and the production build.

Manual verification in a browser, since no browser-test tooling exists:
start-to-finish flow with the mic granted, the same flow with the mic denied,
keyboard-only operation, and reduced-motion enabled.

## 12. Known debt

- No component-level or browser-level tests; the button press and waveform
  rendering are verified manually. Closing this requires the three devDeps named
  in section 10.
- Captures are session-only React state and vanish on reload. Correct for a
  presentational prototype; any real product needs a durable store.
