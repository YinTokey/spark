# Live transcription design

## Goal

Show spoken words in the Capture panel with low latency while preserving the existing completed-capture workflow for ideas and scripts.

## Chosen approach

The browser opens a WebRTC Realtime transcription session using `gpt-realtime-whisper`. A same-origin, authenticated route creates a short-lived Realtime client secret from the server-only `OPENAI_API_KEY`; it returns only the ephemeral credential. The browser sends its microphone track directly to OpenAI and listens for transcript delta and completed events on the WebRTC data channel.

The browser continues to create the existing local recording blob for playback. When recording ends, it waits briefly for the final Realtime transcript and submits validated text to a new authenticated capture-text route. That route performs the existing command parsing and persistence work without another audio transcription request. The existing audio-upload route remains as a recovery path if Realtime setup or finalization fails.

## Boundaries

- `app/api/realtime-token/route.ts` authenticates the same cookie session and same-origin request, enforces a small per-user session-creation limit, creates a short-lived client secret, and returns a narrowly validated response. It never logs or returns the permanent API key.
- `components/use-live-transcript.ts` owns WebRTC setup, data-channel event parsing, ordered transcript state, connection failure state, and teardown. It consumes a supplied microphone stream; it does not request microphone permission itself or persist text.
- `components/use-recorder.ts` owns the recording lifecycle. It starts and tears down live transcription alongside `MediaRecorder`, exposes the current transcript and status, and selects text submission or the existing audio upload fallback after recording stops.
- `app/api/capture/transcript/route.ts` validates a bounded transcript, authenticates and rate-limits the mutation, and calls a shared capture workflow entry point that handles command parsing and persistence.
- `lib/server/capture-workflow.ts` exposes a transcript-processing entry point while retaining the existing audio entry point as a thin transcription wrapper.

## UI behavior

While recording, the panel shows a labelled, live region containing the accumulating transcript below the waveform. Before the first words arrive it shows “Listening for your words…”. A connection problem changes that message to “Live captions are unavailable; your recording will still be captured.” The existing stop and cancel controls remain keyboard-accessible.

After stop, the UI shows the normal processing state. A completed Realtime transcript is used when available and non-empty. If the final transcript is unavailable, the existing upload route transcribes the recorded blob once. If both paths fail, the existing safe error/retry state appears. Cancelling or unmounting closes the peer connection and data channel, stops tracks, aborts in-flight requests, and prevents stale text or results from changing the UI.

## Security, privacy, and limits

- The permanent OpenAI key remains server-only. The client receives only a short-lived ephemeral secret.
- Both new cookie-authenticated routes require same-origin requests, authenticate the caller, validate all request bodies, and return safe errors.
- The credential route applies a separate per-user Realtime-session rate limit so it cannot be used to mint unlimited sessions without consuming the finished-capture allowance.
- Transcript input is trimmed, must be non-empty, and is capped at 8,000 characters; data-channel messages have a bounded size and only the documented transcript event shapes are accepted.
- No audio, transcript text, credentials, headers, cookies, or prompts are written to logs. Logs include only event name, safe status, duration, and correlation identifier.
- Browser audio goes directly to OpenAI during the live session; the application server does not persist the live stream. The existing local audio blob is released on reset/unmount.

## Failure diagnosis

The observed `transcription.completed { status: 0, durationMs: ~10500 }` means the batch request failed before an HTTP response existed. It is not an audio-format or microphone error. The new server integration must distinguish connection setup failure from microphone failure in safe UI copy and structured logs. The local development host must also be able to resolve and connect to `api.openai.com`; changing the app alone cannot repair DNS, firewall, proxy, or account-level connectivity.

## Verification

Automated coverage must exercise credential authentication/origin/rate-limit/invalid-upstream handling, transcript validation and persistence, ordered delta rendering, finalization, cancellation, stale-event prevention, Realtime failure fallback, and the existing batch capture fallback. Run focused Node and browser tests during development, then the full `npm run check` gate. Perform the required independent review and a simplification pass before completion.
