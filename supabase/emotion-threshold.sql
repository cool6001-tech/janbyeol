-- 잔별 — "어느 마음도 아니다"라고 말할 수 있게
-- ---------------------------------------------------------------
-- 지금까지 emotion_for 는 감정 여덟 개 중 **무조건 가장 가까운 하나**를
-- 골랐습니다. 가장 가깝다는 건 가깝다는 뜻이 아닙니다. 어디에도 안 맞는 글이
-- 들어와도 억지로 하나를 집어야 했어요.
--
-- 실제로 이런 일이 있었습니다.
--   "수능날 AI로 부정행위하다 걸린 사람이 나왔다. 왜 그런 무모한 짓을 했을까?"
--   → 슬픔
-- 호기심에 가까운 글이 슬픔이 되어, 한숨 쉬는 별들 곁에 가서 앉았습니다.
--
-- 그래서 두 개의 문을 답니다.
--   ① 너무 멀면 (p_max_dist 넘으면) 고르지 않습니다
--   ② 1등과 2등이 거의 안 벌어지면 (p_margin 미만) 고르지 않습니다
--      — 기쁨 0.51, 평온 0.515 라면 그건 고른 게 아니라 찍은 겁니다
--
-- 못 고르면 '일상' 입니다. '모르겠다'가 아니라 **'특별한 마음이 읽히지 않는
-- 보통의 하루'** 라는 뜻이고, 잔별에서 그건 흰 별입니다. 틀린 색보다 낫습니다.
--
-- 숫자는 아래 '재어보기'로 직접 보고 맞추세요. 지금 값은 출발점입니다.
--
-- 실행 순서
--   ① 이 파일을 SQL Editor 에서 실행
--   ② embed-star 에 {"redo": true} (Authorization 은 secret 키)
--   ③ 맨 아래 '재어보기' 를 돌려 눈으로 확인

-- 옛 함수를 먼저 치웁니다.
-- 인자를 더하면 Postgres 는 '바꾼 것'이 아니라 '새로 만든 것'으로 봅니다.
-- 둘이 같이 남으면 embed-star 가 부를 때 옛 것이 계속 잡힙니다.
drop function if exists public.emotion_for(text);

create or replace function public.emotion_for(
  p_embedding text,
  p_max_dist  float8 default 0.62,  -- 이보다 멀면 어느 마음도 아니다
  p_margin    float8 default 0.02   -- 1·2등이 이만큼도 안 벌어지면 고르지 않는다
)
returns text
language sql
stable
security definer
set search_path = public, extensions
as $$
  with best as (
    -- 감정마다 '가장 잘 맞는 문장 하나'까지의 거리
    select a.emotion, min(a.embedding <=> p_embedding::extensions.vector) as dist
    from emotion_anchors a
    group by a.emotion
    order by dist
    limit 2
  ),
  r as (
    select
      (array_agg(emotion order by dist))[1] as top,
      (array_agg(dist    order by dist))[1] as d1,
      (array_agg(dist    order by dist))[2] as d2
    from best
  )
  select case
    when r.d1 is null            then '일상'  -- 기준 문장이 아직 없음
    when r.d1 > p_max_dist       then '일상'  -- 너무 멀다
    when r.d2 - r.d1 < p_margin  then '일상'  -- 고른 게 아니라 찍은 것
    else r.top
  end
  from r
$$;

revoke all on function public.emotion_for(text, float8, float8) from public;

-- ---------------------------------------------------------------
-- 재어보기 — 숫자를 짐작하지 말고 눈으로 보세요
--
-- 아래를 따로 실행하면 '가장 먼 별'부터 나옵니다. 위에서부터 읽으며
-- "여기까지는 맞고 여기부터는 아니다" 싶은 자리의 거리가 p_max_dist 입니다.
-- margin 이 작은 줄은 1·2등이 붙어서 찍다시피 한 별이고요.
-- ---------------------------------------------------------------
--
-- select left(st.text, 48) as 글,
--        d.emotion         as 고른마음,
--        round(d.d1::numeric, 3) as 거리,
--        round((d.d2 - d.d1)::numeric, 3) as 격차
-- from star_embeddings e
-- join stars st on st.id = e.star_id
-- cross join lateral (
--   select (array_agg(emotion order by dist))[1] as emotion,
--          (array_agg(dist    order by dist))[1] as d1,
--          (array_agg(dist    order by dist))[2] as d2
--   from (
--     select a.emotion, min(a.embedding <=> e.embedding) as dist
--     from emotion_anchors a group by a.emotion order by dist limit 2
--   ) t
-- ) d
-- order by d.d1 desc;
