-- ================================================================
-- 잔별 — 서버 저장소 스키마
-- ----------------------------------------------------------------
-- 이 파일 하나가 세 가지 숙제를 동시에 풉니다.
--   ① 인스타 자동 게시   : "가장 온기 많은 글"이 서버에 있어야 고를 수 있음
--   ② 공유 썸네일(개별 별): 스크래퍼가 읽을 데이터가 서버에 있어야 함
--   ③ 앱스토어 심사      : 애플 1.2 가 신고·차단·숨김을 요구함
--
-- Supabase → SQL Editor 에 붙여넣고 실행하세요.
-- ================================================================

create extension if not exists "pgcrypto";

-- ── 사람 ────────────────────────────────────────────────────────
-- Supabase Auth 의 auth.users 를 그대로 쓰고, 표시용 정보만 따로 둡니다.
create table if not exists profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null default '나',
  created_at  timestamptz not null default now(),
  -- 애플 5.1.1(v): 앱 안에서 계정 삭제가 가능해야 합니다.
  deleted_at  timestamptz
);

-- 익명이든 카카오 로그인이든, 사람이 생기면 profiles 행도 같이 생깁니다.
-- (이게 없으면 첫 별을 띄울 때 외래키에서 막힙니다)
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, name) values (new.id, '나')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function handle_new_user();

-- ── 잔별 ────────────────────────────────────────────────────────
create table if not exists stars (
  id                text primary key,
  author_id         uuid not null references profiles (id) on delete cascade,
  author_name       text not null default '나',
  text              text not null check (char_length(text) between 1 and 500),
  tags              text[] not null default '{}',
  emotion           text,                       -- 기쁨/평온/그리움/슬픔/고독/피로/불안/일상
  photo_url         text,
  photo_seed        int,                        -- 예시 별의 생성 이미지 씨앗
  seeded            boolean not null default false, -- 처음 하늘을 채운 예시인가
  pos               jsonb,                      -- 은하 좌표 (galaxyPositionFor 결과)
  pos_v             int not null default 3,
  created_at        timestamptz not null default now(),

  -- 온기: 집계값을 컬럼으로 두고 트리거로 맞춥니다 (매번 count 하지 않게)
  warmth            int not null default 0,
  -- 처음 하늘을 채운 예시 별이 들고 시작하는 온기.
  -- 이게 없으면 예시 별에 누가 온기를 더하는 순간 숫자가 1로 떨어집니다.
  seed_warmth       int not null default 0,

  -- ① 인스타 자동 게시용
  -- 기본은 **꺼짐**입니다. 글을 쓸 때 '소개해도 좋아요'를 직접 체크한 잔별만
  -- 공식 계정에 올라갑니다. 약관 동의로 갈음하지 않는 이유는,
  -- "동의한 줄 몰랐는데 내 글이 올라갔다"는 사고가 한 번이면 끝이기 때문입니다.
  allow_feature     boolean not null default false,
  featured_at       timestamptz,                     -- 이미 올라간 별은 다시 안 올림
  featured_media_id text,

  -- ③ 애플 1.2 대응
  is_hidden         boolean not null default false,  -- 신고 누적/운영자 판단으로 가려짐
  hidden_reason     text
);

create index if not exists stars_feed_idx on stars (created_at desc) where not is_hidden;
create index if not exists stars_daily_pick_idx
  on stars (warmth desc, created_at desc)
  where allow_feature and not is_hidden and featured_at is null;

-- ── 온기 ────────────────────────────────────────────────────────
-- 한 사람이 한 별에 한 번만. 유니크 제약으로 강제합니다.
create table if not exists warmths (
  star_id    text not null references stars (id) on delete cascade,
  user_id    uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (star_id, user_id)
);

-- security definer 인 이유: 온기를 더하는 사람과 별의 주인은 다른 사람입니다.
-- 그냥 두면 RLS(내 별만 고칠 수 있음)에 막혀 **남의 별 온기가 안 올라갑니다.**
-- 아래 set_config 는 칸 지킴이 트리거에게 "이건 내가 세는 중"이라고 알리는 표시입니다.
create or replace function sync_warmth() returns trigger
language plpgsql security definer set search_path = public as $$
declare target text := coalesce(new.star_id, old.star_id);
begin
  perform set_config('janbyeol.internal', 'on', true); -- 이 트랜잭션 안에서만
  update stars
  set warmth = seed_warmth + (select count(*) from warmths w where w.star_id = target)
  where id = target;
  return null;
end $$;

drop trigger if exists warmths_sync on warmths;
create trigger warmths_sync after insert or delete on warmths
for each row execute function sync_warmth();

-- ── 별빛 이어가기 (답글) ────────────────────────────────────────
create table if not exists replies (
  id         uuid primary key default gen_random_uuid(),
  star_id    text not null references stars (id) on delete cascade,
  author_id  uuid not null references profiles (id) on delete cascade,
  text       text not null check (char_length(text) between 1 and 300),
  is_hidden  boolean not null default false,
  created_at timestamptz not null default now()
);

-- ================================================================
-- 애플 1.2 (Safety – User-Generated Content) 대응
--   · 신고 기능              → reports
--   · 차단 기능              → blocks
--   · 부적절한 내용 걸러내기 → stars.is_hidden + 아래 자동 숨김 트리거
-- 이 셋이 없으면 UGC 앱은 앱스토어에서 거의 확실히 리젝됩니다.
-- ================================================================
create table if not exists reports (
  id          uuid primary key default gen_random_uuid(),
  star_id     text references stars (id) on delete cascade,
  reply_id    uuid references replies (id) on delete cascade,
  reporter_id uuid not null references profiles (id) on delete cascade,
  reason      text not null,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  constraint report_target check (num_nonnulls(star_id, reply_id) = 1)
);

create table if not exists blocks (
  blocker_id uuid not null references profiles (id) on delete cascade,
  blocked_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

-- 신고가 3건 쌓이면 사람이 볼 때까지 자동으로 가립니다.
-- (애플이 요구하는 "timely response"의 최소선 — 24시간 안에 조치)
-- 여기도 security definer — 신고하는 사람은 그 별의 주인이 아니니까요.
create or replace function auto_hide_on_reports() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform set_config('janbyeol.internal', 'on', true);
  if new.star_id is not null then
    select count(*) into n from reports where star_id = new.star_id and resolved_at is null;
    if n >= 3 then
      update stars set is_hidden = true, hidden_reason = '신고 누적 — 검토 대기'
      where id = new.star_id;
    end if;
  end if;
  return null;
end $$;

drop trigger if exists reports_auto_hide on reports;
create trigger reports_auto_hide after insert on reports
for each row execute function auto_hide_on_reports();

-- ================================================================
-- 접근 권한 (RLS)
-- ================================================================
alter table profiles enable row level security;
alter table stars    enable row level security;
alter table warmths  enable row level security;
alter table replies  enable row level security;
alter table reports  enable row level security;
alter table blocks   enable row level security;

-- 잔별은 모두의 하늘 — 가려지지 않았고, 내가 차단하지 않은 사람의 별만 보입니다.
create policy stars_read on stars for select using (
  not is_hidden
  and author_id not in (select blocked_id from blocks where blocker_id = auth.uid())
);
create policy stars_write  on stars for insert with check (auth.uid() = author_id);
create policy stars_update on stars for update
  using (auth.uid() = author_id) with check (auth.uid() = author_id);
create policy stars_delete on stars for delete using (auth.uid() = author_id);

-- 내 별이라고 해서 아무 칸이나 고칠 수 있으면 안 됩니다.
--   is_hidden  — 신고로 가려진 별을 본인이 되살릴 수 있게 됩니다
--   warmth     — 온기 숫자를 직접 써넣을 수 있게 됩니다
--   seed_warmth·featured_* — 마찬가지
-- RLS는 행 단위라 칸을 막지 못해서, 트리거로 옛 값을 되돌려 놓습니다.
-- 서버(service_role)는 이 검사를 지나갑니다 — 인스타 게시 표시를 남겨야 하니까요.
create or replace function guard_star_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- 서버(service_role)와 위 두 트리거는 지나갑니다
  if current_setting('janbyeol.internal', true) = 'on'
     or current_setting('role', true) = 'service_role'
     or current_setting('request.jwt.claim.role', true) = 'service_role' then
    return new;
  end if;
  new.is_hidden         := old.is_hidden;
  new.hidden_reason     := old.hidden_reason;
  new.warmth            := old.warmth;
  new.seed_warmth       := old.seed_warmth;
  new.featured_at       := old.featured_at;
  new.featured_media_id := old.featured_media_id;
  new.author_id         := old.author_id;
  new.created_at        := old.created_at;
  new.seeded            := old.seeded;
  return new;
end $$;

drop trigger if exists stars_guard on stars;
create trigger stars_guard before update on stars
for each row execute function guard_star_columns();

-- 온기 행은 **보여주려고** 있는 게 아니라 숫자를 지키려고 있습니다.
-- 한 사람이 한 별에 한 번만 — 그 제약이 전부예요.
--
-- 그러니 읽기는 자기 행만 열어둡니다. 이 한 줄이 "저 사람은 내 글에
-- 온기를 안 줬네"를 셀 수 없게 만드는 자리입니다. using (true) 로
-- 두면 anon 키를 가진 누구나 테이블을 통째로 긁을 수 있습니다.
--
-- 화면에 뜨는 온기 숫자는 이 테이블을 세어서 나오지 않습니다.
-- stars.warmth 집계값을 트리거가 맞춰두므로, 여기를 닫아도 숫자는 그대로예요.
create policy warmths_read  on warmths for select using (auth.uid() = user_id);
create policy warmths_write on warmths for insert with check (auth.uid() = user_id);
create policy warmths_undo  on warmths for delete using (auth.uid() = user_id);

create policy replies_read  on replies for select using (not is_hidden);
create policy replies_write on replies for insert with check (auth.uid() = author_id);

create policy reports_write on reports for insert with check (auth.uid() = reporter_id);
create policy blocks_all    on blocks  for all    using (auth.uid() = blocker_id);

create policy profiles_read on profiles for select using (true);
create policy profiles_edit on profiles for update using (auth.uid() = id);

-- ================================================================
-- 파일 보관함
--   star-photos  : 사람들이 잔별에 붙인 사진
--   public-cards : 인스타에 올릴 카드 (인스타는 공개 URL만 받습니다)
-- ================================================================
insert into storage.buckets (id, name, public)
values ('star-photos', 'star-photos', true), ('public-cards', 'public-cards', true)
on conflict (id) do nothing;

-- 사진은 누구나 볼 수 있고, 올리고 지우는 건 자기 폴더 안에서만.
-- 경로를 `<내 uuid>/파일이름` 으로 두었기 때문에 첫 칸만 확인하면 됩니다.
create policy "photos are readable" on storage.objects
  for select using (bucket_id in ('star-photos', 'public-cards'));

create policy "own folder upload" on storage.objects
  for insert with check (
    bucket_id = 'star-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "own folder update" on storage.objects
  for update using (
    bucket_id = 'star-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "own folder delete" on storage.objects
  for delete using (
    bucket_id = 'star-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
