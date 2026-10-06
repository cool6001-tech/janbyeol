-- ================================================================
-- 잔별 — 보안 보강 (2026-10)
-- ----------------------------------------------------------------
-- Supabase → SQL Editor 에 이 파일 전체를 붙여넣고 한 번 실행하세요.
-- 여러 번 실행해도 안전하게 짰습니다 (이미 있는 건 덮어씁니다).
--
-- ⚠️ 순서: 사이트(GitHub → Vercel)를 **먼저** 배포한 뒤 이 SQL을 실행하세요.
--    새 화면 코드는 별을 띄울 때 author_name · seeded 를 보내지 않습니다.
--    옛 화면 코드가 떠 있는 채로 이걸 먼저 실행하면, 그 사이 별 띄우기가 실패합니다.
--
-- 막는 것
--   1. 별을 띄우거나 고칠 때 온기·추천·숨김 같은 칸을 몰래 써넣기
--   2. 작성자 이름(author_name) 사칭
--   3. 내가 차단한 사람이 내 별에 별빛(답글)을 다는 것
--   4. 한 사람이 같은 별을 여러 번 신고해서 혼자 가려버리는 것
--   5. 짧은 시간에 별·별빛·신고를 쏟아내는 도배
--   6. 사진 저장소 — 용량·형식 제한, 남의 사진 목록 훑어보기
-- ================================================================


-- ── 0. "이건 서버가 하는 일" 판별 ─────────────────────────────────
-- 화면(브라우저)에서 오는 요청은 role 이 authenticated / anon 입니다.
-- service_role(관리자 키 — 인스타 게시, 예시 별 심기, 계정 옮기기)과
-- SQL Editor 에서 직접 실행하는 경우(role = none), 그리고 우리 트리거가
-- 'janbyeol.internal' 표시를 켠 경우만 제한을 지나갑니다.
create or replace function public.janbyeol_is_server() returns boolean
language sql stable as $$
  select coalesce(current_setting('janbyeol.internal', true), '') = 'on'
      or coalesce(current_setting('role', true), 'none') in ('service_role', 'none')
      or coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
      or coalesce((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), '') = 'service_role'
$$;


-- ── 1. 잔별: 새로 띄울 때 ─────────────────────────────────────────
-- 화면이 보내는 값 중 "내가 정해도 되는 칸"만 받고, 나머지는 서버가 정합니다.
create or replace function public.stars_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.janbyeol_is_server() then
    return new;
  end if;
  -- 작성자 이름은 화면이 보낸 값을 믿지 않고 내 프로필에서 가져옵니다 (사칭 방지)
  new.author_name       := coalesce((select name from profiles where id = new.author_id), '나');
  new.warmth            := 0;
  new.seed_warmth       := 0;
  new.seeded            := false;
  new.is_hidden         := false;
  new.hidden_reason     := null;
  new.featured_at       := null;
  new.featured_media_id := null;
  new.created_at        := now();
  return new;
end $$;

drop trigger if exists stars_insert_guard on stars;
create trigger stars_insert_guard before insert on stars
for each row execute function public.stars_before_insert();


-- ── 2. 잔별: 고칠 때 ──────────────────────────────────────────────
-- 화면이 고칠 수 있는 건 '공식 계정 소개 동의(allow_feature)' 하나뿐입니다.
-- 본문·사진·이름 등은 띄운 뒤에 바꿀 수 없고, 바꾸고 싶으면 거두고 다시 띄웁니다.
create or replace function public.guard_star_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.janbyeol_is_server() then
    return new;
  end if;
  new.id                := old.id;
  new.author_id         := old.author_id;
  new.author_name       := old.author_name;
  new.text              := old.text;
  new.tags              := old.tags;
  new.emotion           := old.emotion;
  new.photo_url         := old.photo_url;
  new.photo_seed        := old.photo_seed;
  new.pos               := old.pos;
  new.pos_v             := old.pos_v;
  new.created_at        := old.created_at;
  new.seeded            := old.seeded;
  new.warmth            := old.warmth;
  new.seed_warmth       := old.seed_warmth;
  new.featured_at       := old.featured_at;
  new.featured_media_id := old.featured_media_id;
  new.is_hidden         := old.is_hidden;
  new.hidden_reason     := old.hidden_reason;
  return new;
end $$;

drop trigger if exists stars_guard on stars;
create trigger stars_guard before update on stars
for each row execute function public.guard_star_columns();

-- 트리거와 별개로, 데이터베이스 권한 자체도 칸 단위로 좁힙니다 (이중 잠금)
revoke insert, update on public.stars from anon, authenticated;
grant insert (id, author_id, text, tags, emotion, photo_url, photo_seed, pos, pos_v, allow_feature)
  on public.stars to authenticated;
grant update (allow_feature) on public.stars to authenticated;

-- 이상한 값 막기 — 기존 행은 검사하지 않고(not valid) 새로 들어오는 것만
alter table public.stars drop constraint if exists stars_tags_limit;
alter table public.stars add constraint stars_tags_limit
  check (cardinality(tags) <= 12) not valid;
-- 사진 주소는 우리 저장소의 '내 폴더'만 — 외부 이미지(추적 픽셀 등)를 끼워 넣지 못하게
alter table public.stars drop constraint if exists stars_photo_url_own_bucket;
alter table public.stars add constraint stars_photo_url_own_bucket
  check (photo_url is null or photo_url like '%/storage/v1/object/public/star-photos/' || author_id::text || '/%') not valid;


-- ── 3. 프로필: 이름만 고칠 수 있게 ────────────────────────────────
revoke insert, update on public.profiles from anon, authenticated;
grant update (name) on public.profiles to authenticated;

alter table public.profiles drop constraint if exists profiles_name_length;
alter table public.profiles add constraint profiles_name_length
  check (char_length(btrim(name)) between 1 and 20) not valid;

-- 이름을 바꾸면 이미 띄운 별의 작성자 이름도 서버가 맞춰 둡니다
-- (화면은 이제 stars.author_name 을 직접 고치지 못합니다)
create or replace function public.sync_author_name() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.name is distinct from old.name then
    perform set_config('janbyeol.internal', 'on', true);
    update stars set author_name = new.name where author_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists profiles_name_sync on profiles;
create trigger profiles_name_sync after update of name on profiles
for each row execute function public.sync_author_name();


-- ── 4. 별빛(답글) ────────────────────────────────────────────────
revoke insert, update on public.replies from anon, authenticated;
grant insert (star_id, author_id, text) on public.replies to authenticated;

-- 별 주인이 나를 차단했는가 — blocks 는 RLS 로 '내가 한 차단'만 보이므로
-- 관리자 권한으로 대신 확인합니다 (결과는 참/거짓 하나만 돌려줍니다)
create or replace function public.blocked_by_star_owner(p_star_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from stars s
    join blocks b on b.blocker_id = s.author_id and b.blocked_id = auth.uid()
    where s.id = p_star_id
  )
$$;

drop policy if exists replies_write on replies;
create policy replies_write on replies for insert with check (
  auth.uid() = author_id
  and not public.blocked_by_star_owner(star_id)
);


-- ── 5. 온기 · 차단 · 신고: 넣을 수 있는 칸 좁히기 ─────────────────
revoke insert, update on public.warmths from anon, authenticated;
grant insert (star_id, user_id) on public.warmths to authenticated;

revoke insert, update on public.blocks from anon, authenticated;
grant insert (blocker_id, blocked_id) on public.blocks to authenticated;
alter table public.blocks drop constraint if exists blocks_not_self;
alter table public.blocks add constraint blocks_not_self check (blocker_id <> blocked_id) not valid;

revoke insert, update on public.reports from anon, authenticated;
grant insert (star_id, reply_id, reporter_id, reason) on public.reports to authenticated;
alter table public.reports drop constraint if exists reports_reason_length;
alter table public.reports add constraint reports_reason_length
  check (char_length(reason) between 1 and 500) not valid;

-- 한 사람이 같은 별을 여러 번 신고해서 혼자 가리는 것 막기
--   ① 이미 있는 중복 신고는 가장 먼저 한 것만 남기고
--   ② 앞으로는 한 사람당 한 번만
--   ③ 자동 숨김은 '서로 다른 사람' 3명 기준
delete from reports r
using reports r2
where r.star_id is not null
  and r.star_id = r2.star_id and r.reporter_id = r2.reporter_id
  and (r.created_at, r.id::text) > (r2.created_at, r2.id::text);
delete from reports r
using reports r2
where r.reply_id is not null
  and r.reply_id = r2.reply_id and r.reporter_id = r2.reporter_id
  and (r.created_at, r.id::text) > (r2.created_at, r2.id::text);

create unique index if not exists reports_one_per_star
  on reports (star_id, reporter_id) where star_id is not null;
create unique index if not exists reports_one_per_reply
  on reports (reply_id, reporter_id) where reply_id is not null;

create or replace function public.auto_hide_on_reports() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform set_config('janbyeol.internal', 'on', true);
  if new.star_id is not null then
    select count(distinct reporter_id) into n
    from reports where star_id = new.star_id and resolved_at is null;
    if n >= 3 then
      update stars set is_hidden = true, hidden_reason = '신고 누적 — 검토 대기'
      where id = new.star_id;
    end if;
  end if;
  if new.reply_id is not null then
    select count(distinct reporter_id) into n
    from reports where reply_id = new.reply_id and resolved_at is null;
    if n >= 3 then
      update replies set is_hidden = true where id = new.reply_id;
    end if;
  end if;
  return null;
end $$;


-- ── 6. 도배 막기 — 한 사람이 짧은 시간에 쏟아내는 양 ────────────────
-- 숫자는 '사람이 진심으로 쓰면 닿지 않을' 만큼 넉넉히 잡았습니다.
create or replace function public.rate_limit_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  n  int;
begin
  if public.janbyeol_is_server() or me is null then
    return new;
  end if;

  if tg_table_name = 'stars' then
    select count(*) into n from stars where author_id = me and created_at > now() - interval '1 hour';
    if n >= 20 then
      raise exception '잠시 쉬었다가 다시 띄워 주세요 (한 시간에 20개까지)' using errcode = 'P0001';
    end if;
    select count(*) into n from stars where author_id = me and created_at > now() - interval '1 day';
    if n >= 60 then
      raise exception '오늘은 충분히 띄웠어요 (하루 60개까지)' using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'replies' then
    select count(*) into n from replies where author_id = me and created_at > now() - interval '1 hour';
    if n >= 60 then
      raise exception '잠시 쉬었다가 다시 이어 주세요 (한 시간에 60개까지)' using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'reports' then
    select count(*) into n from reports where reporter_id = me and created_at > now() - interval '1 hour';
    if n >= 20 then
      raise exception '신고가 너무 많아요. 잠시 뒤에 다시 해 주세요' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists stars_rate_limit on stars;
create trigger stars_rate_limit before insert on stars
for each row execute function public.rate_limit_guard();
drop trigger if exists replies_rate_limit on replies;
create trigger replies_rate_limit before insert on replies
for each row execute function public.rate_limit_guard();
drop trigger if exists reports_rate_limit on reports;
create trigger reports_rate_limit before insert on reports
for each row execute function public.rate_limit_guard();

create index if not exists stars_author_recent_idx on stars (author_id, created_at desc);
create index if not exists replies_author_recent_idx on replies (author_id, created_at desc);
create index if not exists reports_reporter_recent_idx on reports (reporter_id, created_at desc);


-- ── 7. 사진 저장소 ───────────────────────────────────────────────
-- 5MB 이하의 이미지만. (화면이 올리기 전에 1600px JPEG 로 줄이므로 보통 0.5MB 안팎입니다)
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
where id = 'star-photos';
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png']
where id = 'public-cards';

-- 공개 버킷의 사진은 주소(public URL)로 누구나 볼 수 있습니다 — 그건 그대로.
-- 다만 '목록 조회'까지 열어두면 남의 폴더 이름(= 사용자 id)과 파일을 통째로 훑을 수 있어서,
-- API 로 목록을 보는 건 내 폴더만 허용합니다.
drop policy if exists "photos are readable" on storage.objects;
drop policy if exists "own folder read" on storage.objects;
create policy "own folder read" on storage.objects
  for select using (
    bucket_id = 'star-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );


-- ── 확인용 — 실행 후 아래 결과가 나오면 정상입니다 ────────────────
-- stars 에서 화면(authenticated)이 고칠 수 있는 칸: allow_feature 하나
select 'stars update 가능 칸' as 확인, string_agg(column_name, ', ' order by column_name) as 결과
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'stars'
  and grantee = 'authenticated' and privilege_type = 'UPDATE'
union all
select 'profiles update 가능 칸', string_agg(column_name, ', ' order by column_name)
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'profiles'
  and grantee = 'authenticated' and privilege_type = 'UPDATE'
union all
select 'star-photos 용량 제한(바이트)', file_size_limit::text from storage.buckets where id = 'star-photos';
