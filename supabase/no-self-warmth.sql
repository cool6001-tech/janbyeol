-- 잔별: 내 별에 내가 온기를 더하지 못하게 (2026-10-07)
-- 화면에서 버튼을 뺐지만, API로 직접 넣는 것도 서버에서 막습니다.
-- Supabase SQL Editor에서 한 번 실행하세요. 여러 번 실행해도 안전합니다.

-- ① 이미 들어간 '내 별에 내가 준 온기'는 지웁니다 (warmths_sync 트리거가 온기 수를 다시 셉니다)
delete from public.warmths w
using public.stars s
where s.id = w.star_id and s.author_id = w.user_id;

-- ② 앞으로는 내 별에는 넣을 수 없게
drop policy if exists warmths_write on public.warmths;
create policy warmths_write on public.warmths for insert with check (
  auth.uid() = user_id
  and not exists (
    select 1 from public.stars s
    where s.id = star_id and s.author_id = auth.uid()
  )
);
