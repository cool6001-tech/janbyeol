-- metrics.sql 검사 — 02-hardening 다음에 같은 데이터베이스(h2)에서 실행합니다
\set ON_ERROR_STOP off
alter table auth.users add column if not exists created_at timestamptz default now();
alter table auth.users add column if not exists raw_user_meta_data jsonb default '{}'::jsonb;
create table if not exists auth.identities (user_id uuid, provider text);
grant select on auth.identities, auth.users to authenticated;
\i supabase/metrics.sql

insert into auth.identities values ('aaaaaaaa-0000-0000-0000-000000000001','kakao');

\echo '--- M1) 관리자가 아니면 리포트를 못 본다 (not_admin 오류) ---'
set role authenticated; set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
select public.admin_report(30);

\echo '--- M2) 표를 직접 읽거나 쓸 수 없다 (권한 오류 3개) ---'
select * from visit_sessions;
insert into admins (user_id) values ('aaaaaaaa-0000-0000-0000-000000000002');
select * from share_visits_daily;

\echo '--- M3) 머문 시간 기록 + 공유 방문 세기 ---'
select public.touch_session('bbbbbbbb-0000-0000-0000-000000000001');
select public.count_share_visit();
reset role;
update visit_sessions set started_at = now() - interval '12 minutes' where id='bbbbbbbb-0000-0000-0000-000000000001';
set role authenticated; set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
select public.touch_session('bbbbbbbb-0000-0000-0000-000000000001');

\echo '--- M4) 남의 세션 id 로 시간을 늘릴 수 없다 (그대로 12분) ---'
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
select public.touch_session('bbbbbbbb-0000-0000-0000-000000000001');
reset role;
select round(extract(epoch from last_seen_at-started_at)/60) as "분(12)", user_id from visit_sessions;

\echo '--- M5) 관리자로 등록하면 합계만 담긴 리포트가 나온다 ---'
insert into admins values ('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated; set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select jsonb_pretty(r - 'daily') from public.admin_report(30) r;
select jsonb_array_length(r->'daily') as "daily 길이(30)", r->'daily'->-1 as "오늘" from public.admin_report(30) r;
reset role;
