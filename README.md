# Spark

Spark turns voice notes and recent ideas into saved YouTube scripts. It is built with Next.js, Supabase, and OpenAI.

## Run locally

Install dependencies:

```bash
npm install
```

Create `.env`:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-key
OPENAI_API_KEY=your-openai-key
```

Apply the migration in `supabase/migrations/` to your Supabase project, then start the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).
