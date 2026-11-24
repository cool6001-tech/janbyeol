-- 잔별 — 곁에 둘 만큼 닮았다는 게 몇 점부터인가
-- ---------------------------------------------------------------
-- 지금 기준선은 0.45 입니다(src/App.jsx 의 SEMANTIC_MIN). 그런데 그 숫자는
-- 재어 보고 정한 게 아니라 짐작으로 정한 값이에요.
--
-- 임베딩으로 재는 닮음은 **아무 상관 없는 문장끼리도 0.4~0.6** 이 나옵니다.
-- "둘 다 한국어 문장이다"만으로도 그만큼은 나와요. 그래서 0.45 는 거르는
-- 체가 아니라 그냥 뚫린 구멍일 수 있습니다.
--
-- 아래 세 쿼리를 **따로따로** 실행하고 결과를 보세요.
-- 짐작하지 말고, 0.7 짜리 짝이 실제로 어떤 글들인지 눈으로 보고 정합니다.

-- ① 전체 분포 — 짝 하나하나가 얼마나 닮았나
--
-- 보는 법: '중앙값'이 아무 관계 없는 짝들의 점수입니다. 그 언저리를 기준선으로
-- 잡으면 전부 통과해요. '상위 5%'쯤이 "이건 정말 닮았다" 가 시작되는 자리입니다.
with pairs as (
  select 1 - (a.embedding <=> b.embedding) as sim
  from star_embeddings a
  join star_embeddings b on b.star_id > a.star_id   -- 같은 짝을 두 번 세지 않습니다
)
select
  count(*)                                                                  as 짝의_수,
  round(min(sim)::numeric, 3)                                               as 가장_먼_짝,
  round((percentile_cont(0.50) within group (order by sim))::numeric, 3)    as 중앙값,
  round((percentile_cont(0.90) within group (order by sim))::numeric, 3)    as 상위_10퍼센트,
  round((percentile_cont(0.95) within group (order by sim))::numeric, 3)    as 상위_5퍼센트,
  round((percentile_cont(0.99) within group (order by sim))::numeric, 3)    as 상위_1퍼센트,
  round(max(sim)::numeric, 3)                                               as 가장_닮은_짝
from pairs;


-- ② 가장 닮은 짝 20개 — 이 점수가 실제로 어떤 글들인지
--
-- 이게 핵심입니다. "0.72 면 닮은 건가?" 는 숫자를 봐서는 알 수 없고,
-- 0.72 짜리 짝의 두 글을 읽어봐야 압니다. 위에서부터 읽어 내려가다가
-- "어? 이 둘은 상관없는데" 싶은 줄이 나오면, 그 바로 위가 기준선입니다.
select
  round((1 - (a.embedding <=> b.embedding))::numeric, 3) as 닮음,
  left(sa.text, 34) as 글1,
  left(sb.text, 34) as 글2,
  sa.emotion as 마음1,
  sb.emotion as 마음2
from star_embeddings a
join star_embeddings b on b.star_id > a.star_id
join stars sa on sa.id = a.star_id
join stars sb on sb.id = b.star_id
where sa.author_id <> sb.author_id          -- 곁에 두는 건 남의 별뿐입니다
order by a.embedding <=> b.embedding
limit 20;


-- ③ 0.45 가 지금 무엇을 거르고 있나 — 기준선 후보별로 남는 짝의 수
--
-- '남는 비율'이 50% 가까우면 그 기준선은 아무것도 안 거르는 겁니다.
-- 별 하나당 곁에 5개를 두니, 남는 짝이 전체의 몇 %여야 할지를 거꾸로 생각해 보세요.
with pairs as (
  select 1 - (a.embedding <=> b.embedding) as sim
  from star_embeddings a
  join star_embeddings b on b.star_id > a.star_id
  join stars sa on sa.id = a.star_id
  join stars sb on sb.id = b.star_id
  where sa.author_id <> sb.author_id
), lines as (
  select unnest(array[0.45, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85]) as cut
)
select
  l.cut                                                          as 기준선,
  count(*) filter (where p.sim >= l.cut)                         as 남는_짝,
  round(100.0 * count(*) filter (where p.sim >= l.cut) / nullif(count(*), 0), 1) as 남는_비율_퍼센트
from lines l cross join pairs p
group by l.cut
order by l.cut;
