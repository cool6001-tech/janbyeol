-- Supabase 의 기본 역할과 권한을 흉내 냅니다 (02-hardening 검사용)
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
alter table storage.buckets add column if not exists file_size_limit bigint;
alter table storage.buckets add column if not exists allowed_mime_types text[];
grant usage on schema public, auth, storage to anon, authenticated, service_role;
-- Supabase 는 public 의 표를 기본으로 anon/authenticated 에게 모두 열어 둡니다 (RLS 가 실제 방어선)
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;
