-- security-hardening.sql 이 막아야 할 것들을 진짜 Postgres 에서 확인합니다.
-- 순서: 00-supabase-stub → schema.sql → 00b-supabase-roles → security-hardening.sql → 이 파일
\set ON_ERROR_STOP off
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001','a@x'),
  ('aaaaaaaa-0000-0000-0000-000000000002','b@x'),
  ('aaaaaaaa-0000-0000-0000-000000000003','c@x'),
  ('aaaaaaaa-0000-0000-0000-000000000004','d@x');
update profiles set name = '가람' where id = 'aaaaaaaa-0000-0000-0000-000000000001';

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '--- H1) 화면이 보내는 모양 그대로 띄우기 — 되어야 정상 ---'
insert into stars (id, author_id, text, tags, emotion, photo_url, photo_seed, pos, pos_v, allow_feature)
values ('h-1','aaaaaaaa-0000-0000-0000-000000000001','오늘 하루','{일상}','일상',null,null,'{"x":1}',3,false);
select id, author_name as "이름(프로필에서 → 가람)", warmth from stars where id='h-1';

\echo '--- H2) 온기·추천·예시 표시를 몰래 넣어 띄우기 — 권한 오류가 나야 정상 ---'
insert into stars (id, author_id, text, warmth, seed_warmth, featured_at, seeded)
values ('h-2','aaaaaaaa-0000-0000-0000-000000000001','조작', 99999, 99999, now(), true);

\echo '--- H3) 남의 이름으로 띄우기(author_name) — 권한 오류가 나야 정상 ---'
insert into stars (id, author_id, author_name, text) values ('h-3','aaaaaaaa-0000-0000-0000-000000000001','운영자','사칭');

\echo '--- H4) 띄운 뒤 온기/숨김/본문 고치기 — 권한 오류가 나야 정상 ---'
update stars set warmth = 99999 where id='h-1';
update stars set is_hidden = false where id='h-1';
update stars set text = '고친 글' where id='h-1';

\echo '--- H5) 소개 동의만 고치기 — 되어야 정상 (t) ---'
update stars set allow_feature = true where id='h-1';
select allow_feature as "소개 동의" from stars where id='h-1';

\echo '--- H6) 외부 이미지 주소 끼워 넣기 — 제약 위반이 나야 정상 ---'
insert into stars (id, author_id, text, photo_url) values ('h-6','aaaaaaaa-0000-0000-0000-000000000001','픽셀','https://evil.example/p.gif');

\echo '--- H7) 내 폴더 사진 주소 — 되어야 정상 ---'
insert into stars (id, author_id, text, photo_url) values ('h-7','aaaaaaaa-0000-0000-0000-000000000001','사진',
  'https://x.supabase.co/storage/v1/object/public/star-photos/aaaaaaaa-0000-0000-0000-000000000001/h-7.jpg');
select count(*) as "h-7 있음(1)" from stars where id='h-7';

\echo '--- H8) 이름 바꾸면 내 별 작성자 이름도 따라오는가 (노을) ---'
update profiles set name = '노을' where id='aaaaaaaa-0000-0000-0000-000000000001';
select distinct author_name as "따라온 이름" from stars where author_id='aaaaaaaa-0000-0000-0000-000000000001';

\echo '--- H9) 프로필의 다른 칸 고치기 — 권한 오류가 나야 정상 ---'
update profiles set deleted_at = now() where id='aaaaaaaa-0000-0000-0000-000000000001';

\echo '--- H10) 남의 이름으로 답글 — RLS 오류가 나야 정상 ---'
insert into replies (star_id, author_id, text) values ('h-1','aaaaaaaa-0000-0000-0000-000000000002','사칭 답글');

\echo '--- H11) A가 B를 차단 → B가 A의 별에 답글 — RLS 오류가 나야 정상 ---'
insert into blocks (blocker_id, blocked_id) values ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000002');
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
insert into replies (star_id, author_id, text) values ('h-1','aaaaaaaa-0000-0000-0000-000000000002','차단당한 답글');

\echo '--- H12) 차단 안 당한 C의 답글 — 되어야 정상 ---'
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
insert into replies (star_id, author_id, text) values ('h-1','aaaaaaaa-0000-0000-0000-000000000003','다정한 한 줄');
reset role; select count(*) as "h-1 답글 수(1)" from replies where star_id='h-1'; set role authenticated;

\echo '--- H13) C 혼자 세 번 신고 — 두 번째부터 중복 오류, 별은 그대로(f) ---'
insert into reports (star_id, reporter_id, reason) values ('h-1','aaaaaaaa-0000-0000-0000-000000000003','광고');
insert into reports (star_id, reporter_id, reason) values ('h-1','aaaaaaaa-0000-0000-0000-000000000003','광고');
insert into reports (star_id, reporter_id, reason) values ('h-1','aaaaaaaa-0000-0000-0000-000000000003','광고');
reset role; select is_hidden as "h-1 가려짐(f)" from stars where id='h-1'; set role authenticated;

\echo '--- H14) 서로 다른 세 사람이 신고하면 가려지는가 (t) ---'
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
insert into reports (star_id, reporter_id, reason) values ('h-1','aaaaaaaa-0000-0000-0000-000000000002','광고');
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000004';
insert into reports (star_id, reporter_id, reason) values ('h-1','aaaaaaaa-0000-0000-0000-000000000004','광고');
reset role; select is_hidden as "h-1 가려짐(t)" from stars where id='h-1'; set role authenticated;

\echo '--- H15) 한 시간에 21개째 별 — 21번째에서 막혀야 정상 (20) ---'
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000004';
do $$ begin
  for i in 1..21 loop
    begin
      insert into stars (id, author_id, text) values ('flood-'||i, 'aaaaaaaa-0000-0000-0000-000000000004', '도배 '||i);
    exception when others then raise notice '막힘 (%번째): %', i, sqlerrm; end;
  end loop;
end $$;
reset role; select count(*) as "D가 띄운 별 (20)" from stars where author_id='aaaaaaaa-0000-0000-0000-000000000004'; set role authenticated;

\echo '--- H16) 온기는 여전히 잘 오르는가 (1) ---'
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
insert into warmths (star_id, user_id) values ('h-7','aaaaaaaa-0000-0000-0000-000000000003');
reset role; select warmth as "h-7 온기(1)" from stars where id='h-7';

\echo '--- H17) 관리자 키(service_role)는 예시 별을 그대로 심을 수 있는가 (seeded t, 온기 7) ---'
set role service_role;
insert into stars (id, author_id, author_name, text, seeded, warmth, seed_warmth)
values ('seed-x','aaaaaaaa-0000-0000-0000-000000000003','예시','예시 별', true, 7, 7);
reset role; select seeded, warmth, author_name from stars where id='seed-x';

\echo '--- H18) 내 별 지우기는 여전히 되는가 (0) ---'
set role authenticated; set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
delete from stars where id='h-7';
reset role; select count(*) as "h-7 남음(0)" from stars where id='h-7';
reset request.jwt.claim.sub;
