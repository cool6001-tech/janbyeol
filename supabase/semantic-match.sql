-- 잔별: 문장의 의미로 닮은 별 찾기 (2026-10)
-- ---------------------------------------------------------------
-- 글마다 Gemini 임베딩(문장의 의미를 768개 숫자로 나타낸 것)을 저장하고,
-- 의미가 가장 가까운 별을 찾아주는 함수를 만듭니다.
-- Supabase SQL Editor에서 한 번 실행하세요. 여러 번 실행해도 안전합니다.

-- ① pgvector 켜기
create extension if not exists vector with schema extensions;

-- ② 글의 의미를 담는 칸 — 별 테이블과 따로 둡니다
--    (화면이 별을 불러올 때 무거운 숫자 768개씩을 함께 받지 않도록)
create table if not exists public.star_embeddings (
  star_id    text primary key references public.stars (id) on delete cascade,
  embedding  extensions.vector(768) not null,
  model      text not null default 'gemini-embedding-001',
  created_at timestamptz not null default now()
);

-- 브라우저에서는 읽지도 쓰지도 못합니다. 쓰기는 embed-star 함수(관리자 권한)만,
-- 읽기는 아래 kin_of 함수를 통해서만 — 그래서 정책(policy)을 하나도 만들지 않습니다.
alter table public.star_embeddings enable row level security;
revoke all on public.star_embeddings from anon, authenticated;

-- 가까운 것 찾기를 빠르게
create index if not exists star_embeddings_hnsw
  on public.star_embeddings using hnsw (embedding extensions.vector_cosine_ops);

-- ③ 이 별과 의미가 가장 가까운 별들
--    · 같은 사람의 별, 가려진 별, 내가 차단한 사람의 별은 빼고
--    · p_exclude 로 받은 별(이미 읽고 지나온 별, 내 별)도 빼고
--    별의 id와 닮은 정도(0~1)만 돌려줍니다. 글 내용이나 숫자는 내보내지 않아요.
create or replace function public.kin_of(p_star text, p_limit int default 5, p_exclude text[] default '{}')
returns table (id text, similarity double precision)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with t as (
    select e.embedding, s.author_id
    from star_embeddings e
    join stars s on s.id = e.star_id
    where e.star_id = p_star
  )
  select s.id, 1 - (e.embedding <=> t.embedding) as similarity
  from t
  cross join star_embeddings e
  join stars s on s.id = e.star_id
  where s.id <> p_star
    and s.author_id <> t.author_id
    and not s.is_hidden
    and s.author_id not in (select blocked_id from blocks where blocker_id = auth.uid())
    and not (s.id = any (coalesce(p_exclude, '{}')))
  order by e.embedding <=> t.embedding
  limit least(greatest(coalesce(p_limit, 5), 1), 40);
$$;

revoke all on function public.kin_of(text, int, text[]) from public;
grant execute on function public.kin_of(text, int, text[]) to anon, authenticated;
