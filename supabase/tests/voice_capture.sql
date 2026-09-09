-- Run against a local Supabase database after applying the migration:
-- psql "$LOCAL_SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/voice_capture.sql
-- All fixtures and consumed slots are rolled back. Never run against production.
begin;

insert into auth.users (id) values
  ('b84098f3-38b5-43e5-81b9-f4fabfc747ba'),
  ('80bf11c2-fbaf-4eaf-b1ed-87e2c2eb6c28');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b84098f3-38b5-43e5-81b9-f4fabfc747ba', true);

do $$
declare
  idea_id uuid;
  owner_id uuid;
  counter integer;
begin
  insert into public.ideas (transcript) values ('Local test idea') returning id, user_id into idea_id, owner_id;
  if owner_id <> auth.uid() then raise exception 'Idea ownership default failed'; end if;
  insert into public.scripts (title, hook, body, outro, idea_ids)
    values ('Local title', 'Hook', 'Body', 'Outro', array[idea_id]) returning user_id into owner_id;
  if owner_id <> auth.uid() then raise exception 'Script ownership default failed'; end if;

  for counter in 1..20 loop
    if not public.consume_ai_request() then raise exception 'AI allowance denied before 20'; end if;
  end loop;
  if public.consume_ai_request() then raise exception 'AI allowance exceeded 20'; end if;
  -- Exhausting AI must not consume the manual allowance.
  for counter in 1..60 loop
    if not public.consume_idea_write() then raise exception 'Manual allowance denied before 60'; end if;
  end loop;
  if public.consume_idea_write() then raise exception 'Manual allowance exceeded 60'; end if;

  begin
    perform request_count from public.ai_rate_limits;
    raise exception 'Rate table is directly readable';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.ideas (user_id, transcript) values ('80bf11c2-fbaf-4eaf-b1ed-87e2c2eb6c28', 'Invalid owner');
    raise exception 'Idea ownership policy allowed another user';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '80bf11c2-fbaf-4eaf-b1ed-87e2c2eb6c28', true);
do $$
begin
  if exists (select 1 from public.ideas) or exists (select 1 from public.scripts) then raise exception 'Another user can read owned content'; end if;
  if not public.consume_ai_request() or not public.consume_idea_write() then raise exception 'Allowances are not isolated per user'; end if;
end;
$$;

select set_config('request.jwt.claim.sub', '', true);
do $$
begin
  if public.consume_ai_request() or public.consume_idea_write() then raise exception 'Missing identity received an allowance'; end if;
end;
$$;

set local role anon;
do $$
begin
  begin
    perform public.consume_idea_write();
    raise exception 'Anonymous callers can consume manual allowance';
  exception when insufficient_privilege then null;
  end;
end;
$$;

rollback;
