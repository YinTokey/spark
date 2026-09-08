# Voice Capture and Agent-Generated Scripts Design

## Goal

Turn the existing authenticated recording demo into a durable workflow:

1. A user presses the existing Spark control, records up to 60 seconds, and sends the audio for OpenAI Whisper transcription.
2. Ordinary speech is stored as a user-owned idea.
3. Natural requests to create a script act as commands rather than ideas. They run an OpenAI Agents SDK workflow that retrieves the user's relevant ideas from the preceding hour through a function tool, creates a structured YouTube script, and persists it.
4. The iPhone prototype reads the user's ideas and scripts from the database instead of fixture data.

Audio is transient request data and is never persisted.

## Existing Context

- The /home Server Component is protected by a server-verified Supabase access-token cookie.
- components/use-recorder.ts already implements bounded browser recording, microphone states, cancellation, and local playback.
- components/capture.tsx currently displays a simulated processing result.
- components/spark/spark-prototype.tsx currently reads fixture ideas and scripts and keeps new ideas in React state.
- Existing server integrations use Supabase HTTP APIs, so this feature extends that boundary rather than introducing a second database client.

## Architecture

Use one authenticated capture route for the recording pipeline and one small authenticated library route for non-audio reads and manual idea creation. Keep all OpenAI and database operations on the server.

The capture route will:

1. enforce same-origin mutation behavior;
2. authenticate the access-token cookie against Supabase;
3. validate the multipart body, declared size, actual audio size, and allowed MIME type;
4. enforce a durable per-user AI request limit;
5. transcribe the audio with OpenAI whisper-1;
6. classify the normalized transcript with a conservative local command parser;
7. either insert the transcript as an idea or invoke the script agent;
8. return a bounded, runtime-validated result for the current client library state.

The implementation adds @openai/agents and Zod as production dependencies, as required by the current official Agents SDK setup. Whisper uses a bounded server-side HTTPS request, avoiding another OpenAI SDK dependency. OPENAI_API_KEY remains server-only.

## Command Detection

A command transcript is never saved as an idea.

The parser recognizes natural but explicit script intent. It accepts action words such as create, make, write, draft, and generate combined with script, YouTube script, or video script. It also recognizes clear formulations such as “turn my recent ideas about focus into a video script.” An optional subject or constraint becomes the agent's topic hint.

Mentioning scripts or script-writing inside an ordinary idea does not trigger generation. Ambiguous transcripts remain ordinary ideas so Spark does not unexpectedly spend a generation request or hide a captured thought.

## Agent and Tool Workflow

Use one server-side OpenAI Agents SDK agent with structured output. It receives the command and has one function tool named retrieve_recent_ideas.

The tool accepts a bounded optional topic/search hint and applies every authoritative constraint itself:

- current authenticated user only;
- created_at within the preceding hour, calculated by the server or database;
- newest first;
- fixed maximum row count;
- bounded text per idea and bounded aggregate output.

The model chooses the tool arguments so it can request ideas relevant to the command rather than receiving every idea automatically. Agent instructions require at least one retrieval call and prohibit inventing source ideas. If nothing matches, the run returns a safe “not enough recent ideas” outcome and inserts no script.

Structured output contains a concise title, hook, body, and outro. The stored script also records the selected idea IDs. Tool arguments, tool results, and agent output are runtime-validated with Zod.

## Data Model and Migration

Add a Supabase SQL migration with row-level security and ownership policies based on auth.uid().

### ideas

- id: generated UUID primary key
- user_id: UUID referencing Supabase Auth users
- transcript: non-empty text with a database length constraint
- created_at: timestamp with time zone, default now()

The display title, date/time, and Raw status are derived from transcript and timestamp, avoiding duplicate presentation state.

### scripts

- id: generated UUID primary key
- user_id: UUID referencing Supabase Auth users
- title: bounded non-empty text
- hook: bounded non-empty text
- body: bounded non-empty text
- outro: bounded non-empty text
- idea_ids: bounded non-empty UUID array
- created_at: timestamp with time zone, default now()

Script status is initially derived as Ready to record. The idea IDs preserve provenance without adding a join table in this version.

### ai_rate_limits

Add a minimal operational table and transaction-safe database function for per-user AI request accounting. It is not exposed in the UI. The function uses auth.uid(), a fixed time window, and an explicit maximum.

All tables enable RLS. Policies permit authenticated users to select and insert only their own product rows. Updates and deletes are out of scope. Indexes support user/time queries and recent-idea retrieval.

## Server Boundaries

Create focused server utilities for:

- authenticated Supabase request verification and bounded responses;
- idea and script persistence and mapping;
- bounded OpenAI transcription;
- command parsing;
- the agent and retrieval-tool workflow.

Route handlers remain thin orchestration layers. External requests use explicit timeouts, no-store caching, safe error mapping, bounded response reads, and no automatic mutation retries. Logs use stable event names, duration, and a safe correlation identifier; they exclude audio, transcripts, prompts, cookies, tokens, and script contents.

The /home Server Component loads the authenticated library for fast initial display. A JSON endpoint supports manual idea creation from the existing phone form. The capture response supplies the newly created idea or script so shared client state updates without a reload.

## Client Behavior

Capture owns the current idea and script collections and passes them to both experiences.

After recording stops:

- the client uploads the captured blob;
- processing remains visible until the server returns;
- an idea response displays the real transcript and adds it to the phone library;
- a script response confirms creation and adds it to the phone library;
- a no-match response explains that Spark needs a recent idea;
- retryable failures offer a clear retry without implying content was saved.

Cancellation invalidates stale responses. The local audio URL remains available only for the current result and is revoked on reset or unmount.

The phone prototype receives database-backed initial data. Existing list, detail, and teleprompter behavior remains. The manual idea form also persists through the authenticated route, avoiding a mix of durable and session-only data. Empty and error states use the current visual language and retain keyboard focus behavior.

## Validation, Security, and Privacy

- Authenticate every read and mutation.
- Enforce ownership in server queries and RLS.
- Keep session tokens in HttpOnly cookies and the OpenAI key server-only.
- Enforce same-origin behavior for cookie-authenticated mutations.
- Bound audio to 8 MB and client recording duration to 60 seconds.
- Allow only supported MediaRecorder audio types.
- Bound transcripts, tool input/output, script fields, row counts, and upstream responses.
- Rate-limit transcription and generation durably per user.
- Never store audio or command transcripts.
- Never expose raw Supabase or OpenAI errors.
- Never automatically retry non-idempotent inserts or agent runs.

## Failure Semantics

- Authentication failure redirects the page or returns a stable 401 API error.
- Invalid audio returns a validation error before OpenAI is called.
- Rate limiting returns 429 with an actionable retry message.
- Transcription failure stores nothing.
- Idea insert failure reports that the transcription was not saved.
- Agent, tool, validation, or script insert failure stores neither the command nor a partial script.
- No recent relevant ideas is a non-error empty outcome and stores nothing.
- Initial library failure shows a database-unavailable state instead of fixture fallbacks.

## Testing

Follow test-driven development. Add behavior-focused tests for:

- authentication, origin checks, upload size/type validation, and rate limits;
- Whisper transcription and ordinary idea persistence;
- natural command variants and non-command script references;
- command transcripts never being inserted as ideas;
- required tool use, user ownership, one-hour filtering, bounds, and no-match behavior;
- structured script validation, provenance, persistence, upstream failures, and timeouts;
- database-backed library mapping and manual idea creation;
- stale capture responses, cancellation, and retry states;
- browser recording submission with mocked external boundaries;
- database-backed Ideas and Scripts lists plus existing detail and teleprompter flows.

Run focused tests during implementation and then npm run check. Freeze the diff for the required independent review, resolve verified findings, perform a separate simplification pass, rerun the full gate, and request at most one follow-up review if code changes after the first review.

## Out of Scope

- Persisting or replaying uploaded recordings after the current browser result
- Realtime or streaming transcription
- Editing or deleting database records
- Background jobs or queue infrastructure
- Sharing scripts between users
- Embeddings or vector search
- Deployment or applying the production migration
