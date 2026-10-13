-- ================================================================
-- 잔별 — 트랙션 리포트 (관리자 전용)
-- ----------------------------------------------------------------
-- Supabase → SQL Editor 에 이 파일 전체를 붙여넣고 실행하세요. 여러 번 실행해도 안전합니다.
-- security-hardening.sql 을 먼저 실행한 상태를 전제로 합니다.
--
-- 지키는 선
--   · 화면에 내보내는 건 **합계 숫자뿐**입니다. 누가 무엇을 했는지 목록은 어디에도 내보내지 않습니다.
--   · 어느 잔별을 읽었는지는 여전히 서버에 남기지 않습니다. 새로 남기는 건
--     "언제 들어와서 언제까지 머물렀나" 하나뿐이고, 90일이 지나면 지웁니다.
--   · 새로 만든 표는 모두 잠가 둡니다(RLS on, 정책 없음). 브라우저에서는 읽지도 쓰지도 못하고,
--     아래 함수들을 통해서만 정해진 일을 합니다.
-- ================================================================


-- ── 1. 관리자 명단 ───────────────────────────────────────────────
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;


-- ── 2. 머문 시간 ─────────────────────────────────────────────────
-- 화면이 열려 있는 동안 30초마다 "아직 보고 있어요" 한 번. 그게 전부입니다.
create table if not exists public.visit_sessions (
  id           uuid primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  started_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists visit_sessions_started_idx on public.visit_sessions (started_at);
create index if not exists visit_sessions_user_idx on public.visit_sessions (user_id, started_at);
alter table public.visit_sessions enable row level security;
revoke all on public.visit_sessions from anon, authenticated;

create or replace function public.touch_session(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null or p_id is null then
    return;
  end if;
  insert into visit_sessions (id, user_id) values (p_id, me)
  on conflict (id) do update
    -- 한 번 머문 시간은 최대 4시간으로 셉니다 (탭을 켜 둔 채 잠든 경우)
    set last_seen_at = least(now(), visit_sessions.started_at + interval '4 hours')
    where visit_sessions.user_id = me;

  -- 90일이 지난 기록은 조금씩 지웁니다 (방침에 적은 보관 기간)
  if random() < 0.02 then
    delete from visit_sessions where started_at < now() - interval '90 days';
  end if;
end $$;
revoke all on function public.touch_session(uuid) from public, anon;
grant execute on function public.touch_session(uuid) to authenticated;


-- ── 3. 공유 링크로 들어온 수 (날짜별 합계만 — 누가 왔는지는 남기지 않습니다) ──
create table if not exists public.share_visits_daily (
  day    date primary key,
  visits int not null default 0
);
alter table public.share_visits_daily enable row level security;
revoke all on public.share_visits_daily from anon, authenticated;

create or replace function public.count_share_visit() returns void
language sql security definer set search_path = public as $$
  insert into share_visits_daily (day, visits)
  values ((now() at time zone 'Asia/Seoul')::date, 1)
  on conflict (day) do update set visits = share_visits_daily.visits + 1;
$$;
revoke all on function public.count_share_visit() from public;
grant execute on function public.count_share_visit() to anon, authenticated;


-- ── 4. 리포트 — 관리자만, 합계만 ──────────────────────────────────
create or replace function public.admin_report(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  d0      date;
  d1      date := (now() at time zone 'Asia/Seoul')::date;
  since   timestamptz;
  result  jsonb;
begin
  if not exists (select 1 from admins where user_id = auth.uid()) then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  p_days := greatest(7, least(coalesce(p_days, 30), 180));
  d0     := d1 - (p_days - 1);
  since  := (d0::timestamp at time zone 'Asia/Seoul');

  with
  people as (            -- 예시 별을 심으려고 만든 계정은 빼고 셉니다
    select u.id, u.created_at
    from auth.users u
    where coalesce(u.raw_user_meta_data ->> 'seeded', 'false') <> 'true'
  ),
  real_stars as (
    select s.* from stars s where not s.seeded
  ),
  linked as (
    select distinct i.user_id, i.provider
    from auth.identities i
    where i.provider in ('kakao', 'google')
  ),
  sess as (
    select v.user_id,
           (v.started_at at time zone 'Asia/Seoul')::date as day,
           extract(epoch from (v.last_seen_at - v.started_at)) / 60.0 as minutes
    from visit_sessions v
    where v.started_at >= since
  ),
  user_day as (          -- 한 사람이 하루에 머문 시간의 합
    select user_id, day, sum(minutes) as minutes from sess group by user_id, day
  ),
  days as (
    select generate_series(d0, d1, interval '1 day')::date as day
  ),
  daily as (
    select
      d.day,
      (select count(distinct s.user_id) from sess s where s.day = d.day)                                   as visitors,
      (select count(*) from people p where (p.created_at at time zone 'Asia/Seoul')::date = d.day)          as new_users,
      (select count(distinct st.author_id) from real_stars st
         where (st.created_at at time zone 'Asia/Seoul')::date = d.day)                                     as authors,
      (select count(*) from real_stars st where (st.created_at at time zone 'Asia/Seoul')::date = d.day)    as stars,
      (select count(*) from warmths w where (w.created_at at time zone 'Asia/Seoul')::date = d.day)          as warmths,
      (select count(*) from replies r where (r.created_at at time zone 'Asia/Seoul')::date = d.day)          as replies,
      (select round(avg(s.minutes)::numeric, 1) from sess s where s.day = d.day)                             as avg_session_min,
      (select round(avg(ud.minutes)::numeric, 1) from user_day ud where ud.day = d.day)                      as daily_min_per_user,
      coalesce((select sv.visits from share_visits_daily sv where sv.day = d.day), 0)                       as share_visits
    from days d
  ),
  new_in_window as (
    select p.id from people p where p.created_at >= since
  ),
  window_authors as (
    select st.author_id, count(distinct (st.created_at at time zone 'Asia/Seoul')::date) as active_days
    from real_stars st where st.created_at >= since group by st.author_id
  ),
  window_visitors as (
    select user_id, count(distinct day) as active_days from sess group by user_id
  )
  select jsonb_build_object(
    'days', p_days,
    'from', d0,
    'to', d1,
    'sessions_since', (select min(started_at) from visit_sessions),
    'totals', jsonb_build_object(
      'users',        (select count(*) from people),
      'authors',      (select count(distinct author_id) from real_stars),
      'stars',        (select count(*) from real_stars),
      'warmths',      (select count(*) from warmths),
      'replies',      (select count(*) from replies),
      'linked',       (select count(distinct user_id) from linked),
      'linked_kakao', (select count(distinct user_id) from linked where provider = 'kakao'),
      'linked_google',(select count(distinct user_id) from linked where provider = 'google'),
      'featured',     (select count(*) from real_stars where featured_at is not null)
    ),
    'window', jsonb_build_object(
      'visitors',            (select count(*) from window_visitors),
      'new_users',           (select count(*) from new_in_window),
      'new_users_activated', (select count(*) from new_in_window n
                                where exists (select 1 from real_stars st where st.author_id = n.id)),
      'returning_visitors',  (select count(*) from window_visitors where active_days >= 2),
      'authors',             (select count(*) from window_authors),
      'repeat_authors',      (select count(*) from window_authors where active_days >= 2),
      'stars',               (select count(*) from real_stars where created_at >= since),
      'warmth_per_star',     (select round(avg(greatest(0, warmth - seed_warmth))::numeric, 2)
                                from real_stars where created_at >= since),
      'replies_per_star',    (select round(avg(c)::numeric, 2) from (
                                select (select count(*) from replies r where r.star_id = st.id) as c
                                from real_stars st where st.created_at >= since) x),
      'sessions',            (select count(*) from sess),
      'avg_session_min',     (select round(avg(minutes)::numeric, 1) from sess),
      'median_session_min',  (select round((percentile_cont(0.5) within group (order by minutes))::numeric, 1) from sess),
      'daily_min_per_user',  (select round(avg(minutes)::numeric, 1) from user_day),
      'share_visits',        (select coalesce(sum(visits), 0) from share_visits_daily where day >= d0),
      'featured',            (select count(*) from real_stars where featured_at >= since)
    ),
    'daily', (select jsonb_agg(to_jsonb(daily) order by daily.day) from daily)
  ) into result;

  return result;
end $$;
revoke all on function public.admin_report(int) from public, anon;
grant execute on function public.admin_report(int) to authenticated;


-- ── 5. 나를 관리자로 등록하기 ─────────────────────────────────────
-- janbyeol.com/admin 을 열면 "내 계정 ID"가 보입니다. 그 값을 아래 따옴표 안에 넣고
-- 이 한 줄만 따로 실행하세요. (평소 쓰는 기기·브라우저에서, 카카오로 성단을 지킨 상태로 여세요)
--
--   insert into public.admins (user_id) values ('여기에-내-계정-ID') on conflict do nothing;
