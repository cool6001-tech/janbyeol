create role app nologin;
grant usage on schema public, auth, storage to app;
grant select, insert, update, delete on all tables in schema public to app;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','a@x'),
  ('22222222-2222-2222-2222-222222222222','b@x'),
  ('33333333-3333-3333-3333-333333333333','c@x');

insert into stars (id, author_id, author_name, text, tags, seed_warmth)
values ('s-a','11111111-1111-1111-1111-111111111111','가','가의 하루','{일상}',5),
       ('s-c','33333333-3333-3333-3333-333333333333','다','다의 하루','{밤}',0);

\echo '=== 이제부터 전부 일반 사용자(RLS 적용) 로 실행합니다 ==='
set role app;

\echo '--- 1) B가 남의 별(s-a)에 온기를 더하면 숫자가 오르는가 ---'
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
insert into warmths (star_id, user_id) values ('s-a','22222222-2222-2222-2222-222222222222');
select warmth as "s-a 온기 (5 + 1 = 6 이어야)" from stars where id='s-a';

\echo '--- 2) B는 남의 온기 행을 볼 수 없는가 (내 것 1개만) ---'
select count(*) as "B가 보는 warmths 행" from warmths;

\echo '--- 3) B가 온기를 거두면 다시 5 ---'
delete from warmths where star_id='s-a' and user_id='22222222-2222-2222-2222-222222222222';
select warmth as "s-a 온기" from stars where id='s-a';

\echo '--- 4) 셋이 s-c 를 신고하면 자동으로 가려지는가 ---'
insert into reports (star_id, reporter_id, reason) values ('s-c','22222222-2222-2222-2222-222222222222','광고');
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into reports (star_id, reporter_id, reason) values ('s-c','11111111-1111-1111-1111-111111111111','광고');
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
insert into reports (star_id, reporter_id, reason) values ('s-c','33333333-3333-3333-3333-333333333333','광고');
reset role;
select is_hidden as "s-c 가려졌는가" from stars where id='s-c';
set role app;

\echo '--- 5) C(주인)가 자기 별을 몰래 되살릴 수 있는가 (없어야 정상) ---'
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
update stars set is_hidden = false where id='s-c';
reset role;
select is_hidden as "되살리기 시도 후" from stars where id='s-c';
set role app;

\echo '--- 6) A가 자기 별 온기를 9999로 써넣을 수 있는가 (없어야 정상) ---'
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update stars set warmth = 9999, seed_warmth = 9999 where id='s-a';
select warmth as "조작 시도 후 s-a 온기" from stars where id='s-a';

\echo '--- 7) 본문은 정상적으로 고쳐지는가 (이건 되어야 정상) ---'
update stars set text = '가의 고친 하루' where id='s-a';
select text as "s-a 본문" from stars where id='s-a';

\echo '--- 8) 남의 별 본문은 못 고치는가 ---'
update stars set text = '몰래 고침' where id='s-c';
reset role;
select text as "s-c 본문" from stars where id='s-c';
set role app;

\echo '--- 9) 차단하면 그 사람 별이 사라지는가 ---'
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select count(*) as "B에게 보이는 별 (s-c는 가려져 1개)" from stars;
insert into blocks (blocker_id, blocked_id) values
  ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111');
select count(*) as "가를 차단한 뒤" from stars;

\echo '--- 10) 신고 기록은 아무도 못 읽는가 ---'
select count(*) as "B가 보는 reports 행" from reports;

reset role; reset request.jwt.claim.sub;
