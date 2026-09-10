-- Run against a local Supabase database after applying all migrations:
-- psql "$LOCAL_SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/voice_capture.sql
-- All fixtures are rolled back. Never run against production.
begin;

-- Fake, hardcoded test identities (not real users, not secrets).
-- These UUIDs are deliberately all-zero-prefixed so they are obviously synthetic.
insert into auth.users (id) values
  ('00000000-0000-4000-8000-000000000001'),  -- fake user A (idea/script owner)
  ('00000000-0000-4000-8000-000000000002');  -- fake user B (no access)

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);

do $$
declare
  idea_id uuid;
  owner_id uuid;
begin
  insert into public.ideas (id, text)
    values ('11111111-1111-4111-8111-111111111111', 'Local test idea') returning id, user_id into idea_id, owner_id;
  if owner_id <> auth.uid() then raise exception 'Idea ownership default failed'; end if;
  insert into public.scripts (text, idea_ids)
    values (E'Local title\n\nComplete script.', array[idea_id]) returning user_id into owner_id;
  if owner_id <> auth.uid() then raise exception 'Script ownership default failed'; end if;
  begin
    insert into public.ideas (user_id, text) values ('00000000-0000-4000-8000-000000000002', 'Invalid owner');
    raise exception 'Idea ownership policy allowed another user';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
do $$
begin
  if exists (select 1 from public.ideas) or exists (select 1 from public.scripts) then raise exception 'Another user can read owned content'; end if;
  begin
    insert into public.scripts (text, idea_ids)
      values (E'Invalid provenance\n\nComplete script.', array['11111111-1111-4111-8111-111111111111'::uuid]);
    raise exception 'Script accepted provenance not owned by the user';
  exception when insufficient_privilege then null;
  end;
end;
$$;

rollback;
