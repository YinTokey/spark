create extension if not exists pgcrypto;

create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  transcript text not null check (char_length(btrim(transcript)) between 1 and 8000),
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
  title text not null check (char_length(btrim(title)) between 1 and 100),
  hook text not null check (char_length(btrim(hook)) between 1 and 500),
  body text not null check (char_length(btrim(body)) between 1 and 6000),
  outro text not null check (char_length(btrim(outro)) between 1 and 500),
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
  with check (auth.uid() = user_id);

grant select, insert on public.scripts to authenticated;

create table public.ai_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null check (operation in ('ai_capture', 'idea_write')),
  hour_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (user_id, operation, hour_start)
);

alter table public.ai_rate_limits enable row level security;

revoke all on public.ai_rate_limits from public, anon, authenticated;

create function public.consume_ai_request()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  current_hour timestamptz := date_trunc('hour', timezone('UTC', now())) at time zone 'UTC';
  current_count integer;
begin
  if current_user_id is null then
    return false;
  end if;

  insert into public.ai_rate_limits (user_id, operation, hour_start, request_count)
  values (current_user_id, 'ai_capture', current_hour, 1)
  on conflict (user_id, operation, hour_start) do update
    set request_count = public.ai_rate_limits.request_count + 1
  returning request_count into current_count;

  return current_count <= 20;
end;
$$;

revoke execute on function public.consume_ai_request() from public, anon;
grant execute on function public.consume_ai_request() to authenticated;

-- Manual saves have a separate allowance and never consume the paid AI quota.
create function public.consume_idea_write()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  current_hour timestamptz := date_trunc('hour', timezone('UTC', now())) at time zone 'UTC';
  current_count integer;
begin
  if current_user_id is null then
    return false;
  end if;

  insert into public.ai_rate_limits (user_id, operation, hour_start, request_count)
  values (current_user_id, 'idea_write', current_hour, 1)
  on conflict (user_id, operation, hour_start) do update
    set request_count = public.ai_rate_limits.request_count + 1
  returning request_count into current_count;

  return current_count <= 60;
end;
$$;

revoke execute on function public.consume_idea_write() from public, anon;
grant execute on function public.consume_idea_write() to authenticated;
