# 권한 검사 — 진짜 Postgres에 돌려보기

`schema.sql` 의 RLS 정책과 트리거가 **정말로** 의도대로 도는지 확인합니다.
Supabase에 올리기 전에 한 번 돌려보면 좋습니다.

여기서 잡아낸 실제 버그 두 개:

1. `warmths` 읽기 정책이 `using (true)` 였습니다 —
   anon 키만 있으면 누가 어느 별에 온기를 줬는지 테이블째로 긁을 수 있었습니다.
2. `sync_warmth` 와 `auto_hide_on_reports` 가 `security definer` 가 아니었습니다 —
   **남의 별에 온기를 더해도 숫자가 안 올라갔습니다.** 신고도 쌓이지 않았고요.
   관리자 권한으로 테스트하면 멀쩡해 보여서, 운영에 올라가야 드러났을 버그입니다.

둘 다 지금은 고쳐져 있고, 아래 검사가 그걸 지켜줍니다.

## 돌리는 법

로컬에 Postgres 16이 있어야 합니다 (Supabase 계정은 필요 없습니다).

```bash
export PGDATA=/tmp/janbyeol-pg
initdb -D $PGDATA -A trust
pg_ctl -D $PGDATA -o "-p 5433" -l /tmp/pg.log start

psql -p 5433 -U postgres -f supabase/tests/00-supabase-stub.sql   # auth.uid() 등 흉내
psql -p 5433 -U postgres -f supabase/schema.sql
psql -p 5433 -U postgres -f supabase/tests/01-rls.test.sql
```

## 보는 법

10개 항목이 나옵니다. 아래대로 나와야 정상입니다.

| | 확인하는 것 | 기대값 |
|---|---|---|
| 1 | 남의 별에 온기를 더하면 숫자가 오르는가 | 6 |
| 2 | 남의 온기 행이 보이는가 | 1 (내 것만) |
| 3 | 온기를 거두면 돌아오는가 | 5 |
| 4 | 신고 3건이면 자동으로 가려지는가 | t |
| 5 | 주인이 자기 별을 몰래 되살릴 수 있는가 | t (그대로 가려짐) |
| 6 | 온기 숫자를 직접 써넣을 수 있는가 | 5 (조작 무시됨) |
| 7 | 본문은 고쳐지는가 | 가의 고친 하루 |
| 8 | 남의 본문을 고칠 수 있는가 | 다의 하루 (그대로) |
| 9 | 차단하면 그 사람 별이 사라지는가 | 1 → 0 |
| 10 | 신고 기록이 남에게 보이는가 | 0 |

하나라도 다르면 `schema.sql` 이 부분적으로만 올라간 것입니다.
