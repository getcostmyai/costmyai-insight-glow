create table public.feedback_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 120),
  body text not null check (char_length(body) between 10 and 2000),
  category text not null default 'feature' check (category in ('feature','improvement','bug','integration')),
  status text not null default 'open' check (status in ('open','planned','building','shipped','declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.feedback_posts to authenticated;
grant all on public.feedback_posts to service_role;
alter table public.feedback_posts enable row level security;
create policy "feedback_posts_select" on public.feedback_posts for select to authenticated using (true);
create policy "feedback_posts_insert" on public.feedback_posts for insert to authenticated with check (auth.uid() = author_id);
create policy "feedback_posts_update" on public.feedback_posts for update to authenticated using (auth.uid() = author_id and status = 'open') with check (auth.uid() = author_id and status = 'open');
create policy "feedback_posts_delete" on public.feedback_posts for delete to authenticated using (auth.uid() = author_id and status = 'open');

create trigger feedback_posts_touch_updated_at before update on public.feedback_posts for each row execute function public.touch_updated_at();

-- Status may only change through set_feedback_status (platform admins).
create or replace function public.feedback_posts_guard_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from old.status and not public.is_platform_admin(auth.uid()) then
    raise exception 'Only the CostMyAI team can change a suggestion status';
  end if;
  return new;
end $$;
create trigger feedback_posts_guard_status before update on public.feedback_posts for each row execute function public.feedback_posts_guard_status();

create table public.feedback_votes (
  post_id uuid not null references public.feedback_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
grant select, insert, delete on public.feedback_votes to authenticated;
grant all on public.feedback_votes to service_role;
alter table public.feedback_votes enable row level security;
create policy "feedback_votes_select" on public.feedback_votes for select to authenticated using (true);
create policy "feedback_votes_insert" on public.feedback_votes for insert to authenticated with check (auth.uid() = user_id);
create policy "feedback_votes_delete" on public.feedback_votes for delete to authenticated using (auth.uid() = user_id);

create table public.feedback_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feedback_posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  is_admin_reply boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, insert, delete on public.feedback_comments to authenticated;
grant all on public.feedback_comments to service_role;
alter table public.feedback_comments enable row level security;
create policy "feedback_comments_select" on public.feedback_comments for select to authenticated using (true);
create policy "feedback_comments_insert" on public.feedback_comments for insert to authenticated with check (auth.uid() = author_id);
create policy "feedback_comments_delete" on public.feedback_comments for delete to authenticated using (auth.uid() = author_id);

-- The admin-reply flag is derived server-side, never trusted from the client.
create or replace function public.feedback_comments_set_admin_flag()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.is_admin_reply := public.is_platform_admin(auth.uid());
  return new;
end $$;
create trigger feedback_comments_set_admin_flag before insert on public.feedback_comments for each row execute function public.feedback_comments_set_admin_flag();

create or replace function public.set_feedback_status(_post_id uuid, _status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'Forbidden: platform admins only';
  end if;
  if _status not in ('open','planned','building','shipped','declined') then
    raise exception 'Unknown status: %', _status;
  end if;
  update public.feedback_posts set status = _status, updated_at = now() where id = _post_id;
  if not found then
    raise exception 'Suggestion not found';
  end if;
end $$;
revoke all on function public.set_feedback_status(uuid, text) from public, anon;
grant execute on function public.set_feedback_status(uuid, text) to authenticated;