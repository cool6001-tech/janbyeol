-- ================================================================
-- 잔별 — 마음을 더 잘게, 언어의 그림자는 걷어내고
-- ----------------------------------------------------------------
-- Supabase → SQL Editor 에 통째로 붙여넣고 실행하세요. 여러 번 실행해도 안전합니다.
-- semantic-match.sql, multilingual.sql 을 먼저 실행한 상태를 전제로 합니다.
--
-- 왜 고치는가
-- ----------------------------------------------------------------
-- ① **'슬픔' 하나에 너무 많은 것이 들어 있었습니다.**
--    이별의 슬픔과 일이 안 풀리는 슬픔이 같은 칸에 있으니, 곁에 모여도
--    "왜 이 별이 내 옆에 있지?" 가 됩니다. 여덟 갈래를 스물여섯으로 나눕니다.
--    색과 자리는 **여덟 갈래(family)를 그대로** 씁니다 — 하늘이 알록달록해지면
--    안 되니까요. 잘게 나눈 건 곁에 둘지 말지를 정하는 데만 씁니다.
--
-- ② **같은 언어라는 이유로 점수를 받고 있었습니다.**
--    임베딩은 "이 문장은 한국어다"라는 정보도 함께 담습니다. 그래서 아무 상관
--    없는 한국어 두 문장이 0.5를 받고, 같은 마음을 쓴 한국어-일본어 짝을
--    이겨버립니다. 언어마다 **그 언어의 평균 방향**을 구해서 빼면, 남는 건
--    내용뿐입니다. 이게 lang_centroids 가 하는 일입니다.
--
-- ③ **점수의 비중을 정합니다.** 마음이 가장 무겁고, 상황이 그다음,
--    나머지 의미가 가장 가볍습니다 (0.55 / 0.20 / 0.25).
--
-- 실행 뒤에 할 일
--   · embed-star 를 새로 배포하고
--   · {"anchors": true} 로 기준 문장을 채운 뒤 (몇 번 눌러야 합니다)
--   · {"redo": true} 로 기존 별을 다시 읽힙니다
-- ================================================================


-- ── 1. 기준 문장 — 마음과 상황을 한 표에 ──────────────────────────
create table if not exists public.meaning_anchors (
  kind      text not null,                   -- 'feeling' | 'topic'
  label     text not null,                   -- '슬픔-이별' · '일'
  family    text,                            -- feeling 일 때의 큰 갈래: '슬픔'
  lang      text not null,                   -- 'ko' | 'en' | 'ja'
  phrase    text not null,
  embedding extensions.vector(768) not null,
  primary key (kind, label, lang)
);
alter table public.meaning_anchors enable row level security;
revoke all on public.meaning_anchors from anon, authenticated;
create index if not exists meaning_anchors_kind_idx on public.meaning_anchors (kind);


-- ── 2. 언어의 그림자 ─────────────────────────────────────────────
-- 한 언어로 쓴 문장들의 평균 방향. 이걸 빼면 "무슨 말로 썼는가"가 지워지고
-- "무엇을 말했는가"만 남습니다.
--
-- ⚠️ 기준 문장은 **언어마다 같은 수, 같은 목록**이어야 합니다. 한국어에만
-- 슬픔 문장을 더 넣으면 '한국어의 평균'에 슬픔이 섞여 들어가서, 그걸 뺐을 때
-- 한국어 글만 슬픔에서 멀어집니다. embed-star 의 목록이 label 마다 ko/en/ja
-- 한 줄씩인 건 그래서입니다.
--
-- 별들로 평균을 내지 않고 **기준 문장들로** 냅니다. 별은 아직 쉰 개뿐이고
-- 그중 영어·일본어는 한두 개라, 그걸로 평균을 내면 그 한 사람의 말버릇이
-- 곧 '영어의 평균'이 돼버려요. 기준 문장은 언어마다 수십 개씩 있고
-- 우리가 직접 고른 것이라 치우치지 않습니다.
create table if not exists public.lang_centroids (
  lang       text primary key,
  embedding  extensions.vector(768) not null,
  n          int not null,
  updated_at timestamptz not null default now()
);
alter table public.lang_centroids enable row level security;
revoke all on public.lang_centroids from anon, authenticated;

create or replace function public.rebuild_lang_centroids() returns int
language plpgsql security definer set search_path = public, extensions as $$
declare
  touched int;
begin
  insert into lang_centroids (lang, embedding, n, updated_at)
  select a.lang, avg(a.embedding), count(*), now()
  from meaning_anchors a
  group by a.lang
  having count(*) >= 8           -- 너무 적은 표본으로 '그 언어의 평균'을 정하지 않습니다
  on conflict (lang) do update
    set embedding = excluded.embedding, n = excluded.n, updated_at = now();
  get diagnostics touched = row_count;
  return touched;
end $$;
revoke all on function public.rebuild_lang_centroids() from public, anon;

/** 이 언어의 그림자. 모르는 언어면 0 벡터 — 아무것도 빼지 않는다는 뜻입니다. */
create or replace function public.lang_shadow(p_lang text)
returns extensions.vector(768)
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(
    (select c.embedding from lang_centroids c where c.lang = coalesce(p_lang, '')),
    array_fill(0::real, array[768])::extensions.vector(768)
  )
$$;


-- ── 3. 별에 붙는 두 칸 ───────────────────────────────────────────
-- emotion 은 그대로 둡니다(여덟 갈래 = 색과 자리). feeling 이 잘게 나눈 마음,
-- topic 이 무엇에 대한 이야기인가입니다.
alter table public.stars add column if not exists lang    text;  -- multilingual.sql 에도 있습니다 (순서가 바뀌어도 되게)
alter table public.stars add column if not exists feeling text;
alter table public.stars add column if not exists topic   text;


-- ── 4. 이 글의 마음과 상황 ───────────────────────────────────────
/*
  고르는 규칙.

  절대 거리로 자르지 않습니다. 언어의 그림자를 빼고 나면 거리의 눈금 자체가
  달라지는데, 그때마다 사람이 숫자를 다시 재서 넣어야 한다면 그건 고장난
  설계예요. 그래서 **상대적으로** 봅니다.

    · 1등이 '모든 기준까지의 중앙값'보다 뚜렷하게 가까운가 (p_rel)
    · 1등과 2등이 충분히 벌어졌는가 (p_margin)

  **가리는 일은 큰 갈래에서만 합니다.** '슬픔-이별'과 '슬픔-상실'은 원래
  서로 가까워요. 그 둘이 붙어 있다고 "찍은 것"으로 버리면 거의 모든 글이
  버려집니다. 그러니 묻는 건 하나뿐입니다 — **이게 슬픔이냐 피로냐.**
  슬픔으로 정해지고 나면, 그 안에서 가장 가까운 결을 그냥 고릅니다.
  형제끼리 비슷한 건 흠이 아니라 당연한 일이니까요.

  고르지 못한 마음은 '일상', 고르지 못한 상황은 빈칸입니다.
  틀린 이름보다 빈칸이 낫습니다.
*/
create or replace function public.meaning_for(
  p_embedding    text,
  p_lang         text default null,
  p_rel          float8 default 0.93,
  p_margin       float8 default 0.015,
  -- 상황은 마음보다 **엄격하게** 봅니다. 틀린 마음은 색 하나가 어긋나는 일이지만,
  -- 틀린 상황은 "같은 일 이야기"라며 엉뚱한 별을 끌어다 붙입니다. 소음이 돼요.
  -- 확신이 없으면 상황은 비워두는 편이 낫습니다.
  p_topic_rel    float8 default 0.88,
  p_topic_margin float8 default 0.03
)
returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  -- 변수 이름에 v_ 를 붙입니다. family · topic 은 표의 칼럼 이름이기도 해서,
  -- 그냥 두면 Postgres 가 "이게 변수냐 칼럼이냐" 하고 멈춰 섭니다.
  v         extensions.vector(768);
  v_feeling text;
  v_family  text;
  v_topic   text;
begin
  -- 이 글에서 언어의 그림자를 뺍니다
  v := (p_embedding::extensions.vector(768) - lang_shadow(p_lang))::extensions.vector(768);

  -- 마음 ① 큰 갈래부터 (기준 문장도 저마다 제 언어의 그림자를 뺍니다 — 나라끼리 공평하게)
  with d as (
    select a.family as fam,
           min((a.embedding - lang_shadow(a.lang))::extensions.vector(768) <=> v) as dist
    from meaning_anchors a
    where a.kind = 'feeling'
    group by a.family
  ),
  r as (
    select
      (array_agg(fam  order by dist))[1] as top,
      (array_agg(dist order by dist))[1] as d1,
      (array_agg(dist order by dist))[2] as d2,
      percentile_cont(0.5) within group (order by dist) as dmed
    from d
  )
  select case
    when r.d1 is null           then null
    when r.d1 > r.dmed * p_rel  then null   -- 어느 마음에도 뚜렷하지 않다
    when r.d2 - r.d1 < p_margin then null   -- 고른 게 아니라 찍은 것
    else r.top
  end
  into v_family
  from r;

  -- 마음 ② 정해진 갈래 안에서 가장 가까운 결 (여기선 가리지 않습니다)
  if v_family is not null then
    select a.label
    into v_feeling
    from meaning_anchors a
    where a.kind = 'feeling' and a.family = v_family
    order by (a.embedding - lang_shadow(a.lang))::extensions.vector(768) <=> v
    limit 1;
  end if;

  -- 상황
  with d as (
    select a.label,
           min((a.embedding - lang_shadow(a.lang))::extensions.vector(768) <=> v) as dist
    from meaning_anchors a
    where a.kind = 'topic'
    group by a.label
  ),
  r as (
    select
      (array_agg(label order by dist))[1] as top,
      (array_agg(dist  order by dist))[1] as d1,
      (array_agg(dist  order by dist))[2] as d2,
      percentile_cont(0.5) within group (order by dist) as dmed
    from d
  )
  select case
    when r.d1 is null                 then null
    when r.d1 > r.dmed * p_topic_rel  then null
    when r.d2 - r.d1 < p_topic_margin then null
    else r.top
  end
  into v_topic
  from r;

  return jsonb_build_object(
    'feeling', v_feeling,
    'family',  coalesce(v_family, '일상'),   -- 색은 비워둘 수 없습니다. 모르면 흰 별
    'topic',   v_topic
  );
end $$;
revoke all on function public.meaning_for(text, text, float8, float8, float8, float8) from public, anon;
-- 인자가 늘었으니 옛 모양은 치웁니다 (남겨두면 embed-star 가 어느 쪽을 부를지 헷갈립니다)
drop function if exists public.meaning_for(text, text, float8, float8);

-- 옛 이름도 살려둡니다 — 새 embed-star 를 배포하기 전까지 색이 빠지지 않게
create or replace function public.emotion_for(
  p_embedding text,
  p_max_dist  float8 default 0.62,
  p_margin    float8 default 0.02
)
returns text
language sql stable security definer set search_path = public, extensions as $$
  select public.meaning_for(p_embedding, null) ->> 'family'
$$;


-- ── 5. 곁에 둘 별 고르기 ─────────────────────────────────────────
/*
  무엇으로 고르는가가 이 서비스의 전부입니다.

    마음  0.55   같은 마음인 사람에게서 위로가 옵니다
    상황  0.20   같은 일을 겪었으면 더 가깝지만, 마음만큼은 아닙니다
    의미  0.25   위 둘로 다 담기지 않는 결

  '의미'는 **언어의 그림자를 뺀 뒤** 잰 값입니다. 그래서 같은 한국어라는
  이유로 받던 점수가 사라집니다. 한국어로 쓴 슬픔과 일본어로 쓴 같은 슬픔이
  이제 제대로 가까워져요.

  두 단계로 고릅니다. 먼저 날것의 거리로 후보 200개를 긁어오고(색인이 받쳐줍니다),
  그 안에서만 위 점수로 다시 줄을 세웁니다. 별이 십만 개가 되어도 느려지지 않게.
*/
create or replace function public.kin_of(p_star text, p_limit int default 5, p_exclude text[] default '{}')
returns table (id text, similarity double precision)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with me as (
    select e.embedding, s.author_id, s.feeling, s.emotion, s.topic, s.lang
    from star_embeddings e
    join stars s on s.id = e.star_id
    where e.star_id = p_star
  ),
  cand as (                       -- ① 후보 긁기 — 색인이 쓰이는 단계
    select s.id, s.feeling, s.emotion, s.topic, s.lang, e.embedding
    from me
    cross join star_embeddings e
    join stars s on s.id = e.star_id
    where s.id <> p_star
      and s.author_id <> me.author_id
      and not s.is_hidden
      and s.author_id not in (select blocked_id from blocks where blocker_id = auth.uid())
      and not (s.id = any (coalesce(p_exclude, '{}')))
    order by e.embedding <=> me.embedding
    limit 200
  ),
  scored as (                     -- ② 다시 줄 세우기
    select
      c.id,
      0.55 * case
               when me.feeling is not null and c.feeling = me.feeling then 1.0
               when c.emotion is not null and c.emotion = me.emotion  then 0.55
               else 0.0
             end
      + 0.20 * case when me.topic is not null and c.topic = me.topic then 1.0 else 0.0 end
      + 0.25 * greatest(0.0, 1 - (
          (c.embedding - lang_shadow(c.lang))::extensions.vector(768)
          <=>
          (me.embedding - lang_shadow(me.lang))::extensions.vector(768)
        ))
      as score
    from cand c cross join me
  )
  select id, score as similarity
  from scored
  order by score desc
  limit least(greatest(coalesce(p_limit, 5), 1), 40);
$$;

revoke all on function public.kin_of(text, int, text[]) from public;
grant execute on function public.kin_of(text, int, text[]) to anon, authenticated;
