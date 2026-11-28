-- ================================================================
-- 잔별 — 손님별(콜라보 혜성) 집계 (관리자 전용)
-- ----------------------------------------------------------------
-- Supabase → SQL Editor 에 이 파일 전체를 붙여넣고 실행하세요. 여러 번 실행해도 안전합니다.
-- metrics.sql 을 먼저 실행한 상태를 전제로 합니다 (admins 표를 씁니다).
--
-- 세는 것 — 손님(혜성)마다, 날짜마다 **숫자만**
--   shown  새 혜성 알림을 본 기기 수 (기기마다 한 번만 뜨는 알림이라 곧 '알게 된 사람' 수)
--   open   혜성을 눌러 소개 창을 연 횟수
--   go     소개 창에서 상대 서비스로 건너간 횟수 — 잔별이 보내준 유입
--
-- 지키는 선 (metrics.sql 과 같습니다)
--   · 누가 눌렀는지는 남기지 않습니다. "12월 3일, 혜성 산타, go 41" 이 전부예요.
--   · 표는 잠가 둡니다(RLS on, 정책 없음). 아래 함수로만 더하고, 관리자만 읽습니다.
-- ================================================================


-- ── 1. 날짜 × 손님 × 동작별 합계 ─────────────────────────────────
create table if not exists public.visitor_events_daily (
  day        date not null,
  visitor_id text not null,
  event      text not null,
  n          int  not null default 0,
  primary key (day, visitor_id, event)
);
alter table public.visitor_events_daily enable row level security;
revoke all on public.visitor_events_daily from anon, authenticated;


-- ── 2. 하나 더하기 ───────────────────────────────────────────────
/*
  로그인 전에도 불러야 해서 주소만 알면 누구나 부를 수 있습니다.
  아무 글자나 받으면 표가 쓰레기로 차니까, 동작은 정해진 셋만,
  손님 이름은 src/data/visitors.js 의 id 모양(영소문자·숫자·하이픈, 2~40자)만 받습니다.
*/
create or replace function public.count_visitor_event(p_visitor text, p_event text) returns void
language plpgsql security definer set search_path = public as $$
declare
  vid text := lower(coalesce(p_visitor, ''));
  ev  text := lower(coalesce(p_event, ''));
begin
  if ev not in ('shown', 'open', 'go') then
    return;
  end if;
  if vid !~ '^[a-z0-9][a-z0-9-]{1,39}$' then
    return;
  end if;
  insert into visitor_events_daily (day, visitor_id, event, n)
  values ((now() at time zone 'Asia/Seoul')::date, vid, ev, 1)
  on conflict (day, visitor_id, event) do update set n = visitor_events_daily.n + 1;
end $$;
revoke all on function public.count_visitor_event(text, text) from public;
grant execute on function public.count_visitor_event(text, text) to anon, authenticated;


-- ── 3. 리포트 — 관리자만, 합계만 ──────────────────────────────────
-- {"from": "...", "to": "...", "visitors": [{"id": "santa-2026", "shown": 120, "open": 48, "go": 31,
--   "all_go": 77, "daily": [{"day": "2026-12-01", "shown": 3, "open": 1, "go": 1}, ...]}]}
create or replace function public.admin_visitor_report(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  d1 date := (now() at time zone 'Asia/Seoul')::date;
  d0 date;
begin
  if not exists (select 1 from admins where user_id = auth.uid()) then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  p_days := greatest(7, least(coalesce(p_days, 30), 180));
  d0 := d1 - (p_days - 1);

  return jsonb_build_object(
    'from', d0,
    'to', d1,
    'visitors', coalesce((
      select jsonb_agg(v order by v ->> 'id')
      from (
        select jsonb_build_object(
          'id', ids.visitor_id,
          'shown', coalesce(sum(e.n) filter (where e.event = 'shown' and e.day >= d0), 0),
          'open',  coalesce(sum(e.n) filter (where e.event = 'open'  and e.day >= d0), 0),
          'go',    coalesce(sum(e.n) filter (where e.event = 'go'    and e.day >= d0), 0),
          'all_go', coalesce(sum(e.n) filter (where e.event = 'go'), 0),  -- 기간과 상관없이 누적
          'daily', (
            select jsonb_agg(jsonb_build_object(
              'day', g.day,
              'shown', coalesce((select x.n from visitor_events_daily x
                                 where x.day = g.day and x.visitor_id = ids.visitor_id and x.event = 'shown'), 0),
              'open',  coalesce((select x.n from visitor_events_daily x
                                 where x.day = g.day and x.visitor_id = ids.visitor_id and x.event = 'open'), 0),
              'go',    coalesce((select x.n from visitor_events_daily x
                                 where x.day = g.day and x.visitor_id = ids.visitor_id and x.event = 'go'), 0)
            ) order by g.day)
            from (select generate_series(d0, d1, interval '1 day')::date as day) g
          )
        ) as v
        from (select distinct visitor_id from visitor_events_daily) ids
        join visitor_events_daily e on e.visitor_id = ids.visitor_id
        group by ids.visitor_id
      ) rows
    ), '[]'::jsonb)
  );
end $$;
revoke all on function public.admin_visitor_report(int) from public, anon;
grant execute on function public.admin_visitor_report(int) to authenticated;
