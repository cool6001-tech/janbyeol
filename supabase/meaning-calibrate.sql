-- 잔별 — 마음과 상황의 기준선을 데이터로 정하기
-- ---------------------------------------------------------------
-- meaning_for 는 두 가지를 봅니다.
--
--   중앙값대비 = 1등까지의 거리 ÷ 모든 갈래까지 거리의 중앙값
--                작을수록 "뚜렷하게 이쪽이다". 1에 가까우면 "다 고만고만하다"
--   격차       = 2등 거리 - 1등 거리
--                작으면 1·2등이 붙어 있다 = 고른 게 아니라 찍은 것
--
-- 지금 기준은 중앙값대비 0.93, 격차 0.015 인데 너무 헐거워서 거의 모든 글에
-- 이름이 붙었습니다. 두 글자짜리 글에까지요.
--
-- ①②를 돌려 **어디서 끊어야 하는지 눈으로** 보고 숫자를 정합니다.
-- ③은 분포 요약입니다.

-- ① 마음 — 가장 뚜렷한 글부터, 가장 애매한 글까지
--
-- 보는 법: 위에서부터 읽어 내려가다가 "이건 아닌데" 싶은 줄이 나오면,
-- 그 줄의 '중앙값대비' 가 기준선입니다. 그 위만 채택하는 거예요.
with s as (
  select e.star_id, st.text, st.lang,
         (e.embedding - lang_shadow(st.lang))::extensions.vector(768) as v
  from star_embeddings e
  join stars st on st.id = e.star_id
  where not st.seeded
),
d as (
  select s.star_id, a.family,
         min((a.embedding - lang_shadow(a.lang))::extensions.vector(768) <=> s.v) as dist
  from s
  join meaning_anchors a on a.kind = 'feeling'
  group by s.star_id, a.family
),
r as (
  select star_id,
    (array_agg(family order by dist))[1] as f1,
    (array_agg(family order by dist))[2] as f2,
    (array_agg(dist   order by dist))[1] as d1,
    (array_agg(dist   order by dist))[2] as d2,
    percentile_cont(0.5) within group (order by dist) as dmed
  from d group by star_id
)
select
  round((r.d1 / nullif(r.dmed, 0))::numeric, 4) as 중앙값대비,
  round((r.d2 - r.d1)::numeric, 4)              as 격차,
  r.f1                                          as 뽑힌마음,
  r.f2                                          as 다음후보,
  left(s.text, 40)                              as 글
from r join s on s.star_id = r.star_id
order by 중앙값대비;


-- ② 상황 — 같은 방식으로
--
-- 상황은 마음보다 **엄격해야** 합니다. 틀린 상황은 도움이 안 되고 소음만
-- 더하니까요. 여기서는 더 위쪽에서 끊을 생각으로 읽으세요.
with s as (
  select e.star_id, st.text, st.lang,
         (e.embedding - lang_shadow(st.lang))::extensions.vector(768) as v
  from star_embeddings e
  join stars st on st.id = e.star_id
  where not st.seeded
),
d as (
  select s.star_id, a.label,
         min((a.embedding - lang_shadow(a.lang))::extensions.vector(768) <=> s.v) as dist
  from s
  join meaning_anchors a on a.kind = 'topic'
  group by s.star_id, a.label
),
r as (
  select star_id,
    (array_agg(label order by dist))[1] as t1,
    (array_agg(label order by dist))[2] as t2,
    (array_agg(dist  order by dist))[1] as d1,
    (array_agg(dist  order by dist))[2] as d2,
    percentile_cont(0.5) within group (order by dist) as dmed
  from d group by star_id
)
select
  round((r.d1 / nullif(r.dmed, 0))::numeric, 4) as 중앙값대비,
  round((r.d2 - r.d1)::numeric, 4)              as 격차,
  r.t1                                          as 뽑힌상황,
  r.t2                                          as 다음후보,
  left(s.text, 40)                              as 글
from r join s on s.star_id = r.star_id
order by 중앙값대비;


-- ③ 기준선 후보별로 몇 개나 남나 (마음 기준)
--
-- 별이 63개입니다. 그중 몇 개에 마음이 붙는 게 맞을까요?
-- 전부 붙으면 지금처럼 되고, 너무 적으면 하늘이 전부 흰 별이 됩니다.
-- 절반 안팎이 감(感)에 맞는 자리일 겁니다.
with s as (
  select e.star_id, st.lang,
         (e.embedding - lang_shadow(st.lang))::extensions.vector(768) as v
  from star_embeddings e join stars st on st.id = e.star_id where not st.seeded
),
d as (
  select s.star_id, a.family,
         min((a.embedding - lang_shadow(a.lang))::extensions.vector(768) <=> s.v) as dist
  from s join meaning_anchors a on a.kind = 'feeling'
  group by s.star_id, a.family
),
r as (
  select star_id,
    (array_agg(dist order by dist))[1] as d1,
    (array_agg(dist order by dist))[2] as d2,
    percentile_cont(0.5) within group (order by dist) as dmed
  from d group by star_id
),
lines as (
  select unnest(array[0.80, 0.84, 0.88, 0.90, 0.92, 0.93, 0.95]) as rel
)
select
  l.rel                                                             as 중앙값대비_기준,
  count(*) filter (where r.d1 <= r.dmed * l.rel)                    as 마음이_붙는_별,
  count(*)                                                          as 전체,
  round(100.0 * count(*) filter (where r.d1 <= r.dmed * l.rel) / nullif(count(*), 0), 1) as 비율
from lines l cross join r
group by l.rel
order by l.rel;
