This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

Create `.env.local` with the Supabase project values from the project’s Connect dialog:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-key
OPENAI_API_KEY=your-openai-key
```

Email/password registration uses Supabase Auth’s built-in `auth.users` table. No separate profile table is required. `OPENAI_API_KEY` stays server-only and is never exposed to the browser.

## Voice capture and agent scripts

Spark authenticates a Supabase access-token cookie, transcribes bounded voice recordings with OpenAI Whisper, stores ideas, and runs an OpenAI Agents SDK workflow to turn a natural “make me a script” command into a persisted YouTube script using the user’s recent ideas.

Apply the schema migration `supabase/migrations/20260908000000_voice_capture.sql` through your normal Supabase workflow before using the database-backed library. It creates `ideas`, `scripts`, and `ai_rate_limits` tables with row-level security and a transaction-safe per-user AI request limit.

Product limits: recordings are capped at 60 seconds and 8 MB, ideas reference only the preceding hour, and audio is transcribed transiently and never stored. Scripts record provenance as a bounded list of idea IDs.

## Verification

The canonical repository gate is:

```bash
npm run check
```

`npm run check` runs the Node.js unit and browser regression suites, zero-warning ESLint, Next.js route type generation and strict TypeScript, the production build, and the Playwright landing tests. The browser regression suite in `scripts/spark.test.mjs` starts a temporary Next.js dev server on port 3187 against a local Supabase stub; stop any existing dev server for this checkout before running it. Run `npx playwright install chromium` once locally (CI installs Chromium and system dependencies).

Tests mock the Supabase and OpenAI boundaries and never spend real OpenAI credits or touch a real database.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
