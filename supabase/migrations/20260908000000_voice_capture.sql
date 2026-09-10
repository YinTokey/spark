create extension if not exists pgcrypto;

create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  text text not null check (char_length(btrim(text)) between 1 and 8000),
  created_at timestamptz not null default now()
);

create index ideas_user_id_created_at_idx on public.ideas (user_id, created_at desc);

alter table public.ideas enable row level security;

create policy "Users can read their own ideas"
  on public.ideas for select to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own ideas"
  on public.ideas for insert to authenticated
  with check (auth.uid() = user_id);

grant select, insert on public.ideas to authenticated;

create table public.scripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  text text not null check (char_length(btrim(text)) between 1 and 8000),
  idea_ids uuid[] not null check (cardinality(idea_ids) between 1 and 12),
  created_at timestamptz not null default now()
);

create index scripts_user_id_created_at_idx on public.scripts (user_id, created_at desc);

alter table public.scripts enable row level security;

create policy "Users can read their own scripts"
  on public.scripts for select to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own scripts"
  on public.scripts for insert to authenticated
  with check (
    auth.uid() = user_id
    and cardinality(idea_ids) = (
      select count(*)
      from public.ideas
      where ideas.user_id = auth.uid() and ideas.id = any(scripts.idea_ids)
    )
  );

grant select, insert on public.scripts to authenticated;
