-- 잔별: 언어를 넘어서 (2026-11)
-- ---------------------------------------------------------------
-- 지금까지 별의 감정은 한국어 정규식 사전이 정했습니다. 그래서 영어나 일본어로 쓴 글은
-- 아무것도 안 걸려서 전부 '일상' 흰 별이 되고, 은하에서도 한자리에 뭉쳤습니다.
--
-- 여기서는 감정을 **글의 의미**로 정합니다. 감정마다 여러 언어로 된 기준 문장을 두고,
-- 글의 임베딩이 어느 기준 문장에 가장 가까운지 봅니다. 언어가 몇 개로 늘어나든
-- 사전을 늘릴 일이 없습니다.
--
-- Supabase SQL Editor 에서 한 번 실행하세요. 여러 번 실행해도 안전합니다.
-- (semantic-match.sql 을 먼저 실행해 두셨어야 합니다 — pgvector 와 star_embeddings)

-- ---------------------------------------------------------------
-- ① 별이 어느 언어로 쓰였는지
--    번역 버튼을 보여줄지 말지를 이 값으로 정합니다.
--    'ko' / 'ja' / 'zh' / 'en' 같은 두 글자 코드.
-- ---------------------------------------------------------------
alter table public.stars add column if not exists lang text;

-- ---------------------------------------------------------------
-- ② 감정의 기준 문장들
--    한 감정에 여러 문장을 둡니다. 가장 가까운 문장 하나가 그 별의 감정이 됩니다.
--    평균을 내지 않는 이유: 기준 문장 하나가 어긋나도 나머지가 버텨주니까요.
--    내용은 embed-star 함수가 처음 한 번 채웁니다.
-- ---------------------------------------------------------------
create table if not exists public.emotion_anchors (
  emotion    text not null,
  phrase     text not null,
  embedding  extensions.vector(768) not null,
  created_at timestamptz not null default now(),
  primary key (emotion, phrase)
);

-- 브라우저는 읽을 일이 없습니다. 쓰기도 관리자(embed-star)만.
alter table public.emotion_anchors enable row level security;
revoke all on public.emotion_anchors from anon, authenticated;

create index if not exists emotion_anchors_hnsw
  on public.emotion_anchors using hnsw (embedding extensions.vector_cosine_ops);

-- ---------------------------------------------------------------
-- ③ 이 의미에 가장 가까운 감정
--    매개변수를 text 로 받는 이유: 함수 호출이 PostgREST 를 거쳐 오기 때문에
--    vector 타입을 그대로 주고받는 것보다 글자로 주고 안에서 바꾸는 쪽이 튼튼합니다.
-- ---------------------------------------------------------------
create or replace function public.emotion_for(p_embedding text)
returns text
language sql
stable
security definer
set search_path = public, extensions
as $$
  select a.emotion
  from emotion_anchors a
  order by a.embedding <=> p_embedding::extensions.vector
  limit 1
$$;

revoke all on function public.emotion_for(text) from public;
-- 브라우저에는 주지 않습니다. 관리자 키로 부르는 embed-star 만 씁니다.

-- ---------------------------------------------------------------
-- ④ 번역해 둔 글
--    한 번 번역한 것은 다시 번역하지 않습니다. 같은 별을 열 사람이 백 명이어도
--    Gemini 를 부르는 건 첫 한 번뿐입니다.
--
--    브라우저에서 직접 읽지 못하게 둡니다. translate-star 함수가 대신 꺼내줍니다 —
--    가려진 별(신고 누적)의 번역이 새어 나가지 않도록.
-- ---------------------------------------------------------------
create table if not exists public.star_translations (
  star_id    text not null references public.stars (id) on delete cascade,
  lang       text not null,
  text       text not null,
  created_at timestamptz not null default now(),
  primary key (star_id, lang)
);

alter table public.star_translations enable row level security;
revoke all on public.star_translations from anon, authenticated;

-- ---------------------------------------------------------------
-- ⑤ 이미 떠 있는 별들의 감정을 비웁니다
--    embed-star 를 한 번 돌리면 의미로 다시 채워집니다.
--    (화면은 값이 없으면 예전 한국어 사전으로 폴백하므로, 이 사이에도 별은 보입니다)
-- ---------------------------------------------------------------
update public.stars set emotion = null where emotion is not null;
