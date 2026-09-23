# 잔별 — 서버 붙이고 janbyeol.com 으로 띄우기

순서대로 따라오시면 됩니다. 1~4번까지가 런칭, 5번부터는 그 뒤의 일입니다.
중간에 막히면 맨 아래 **막혔을 때** 를 보세요.

```
새로 생긴 것
  src/lib/supabase.js              Supabase 연결
  src/lib/account.js               익명 → 카카오/구글 잇기, 계정 삭제
  src/components/Account.jsx       '이 성단을 지키는 일' — 나의 성단 맨 아래
  src/components/StarGuard.jsx     신고 · 그만 보기
  api/s/[id].js                    /s/<별id> — 그 글이 담긴 공유 미리보기
  api/card/[id].js                 미리보기 그림 (인스타 카드와 같은 그림)
  supabase/schema.sql              테이블 · RLS · 트리거 · 보관함
  supabase/tests/                  권한 정책 검사 10종 (로컬 Postgres)
  public/terms.html                이용약관 초안  → /terms
  public/privacy.html              개인정보처리방침 초안 → /privacy
  supabase/functions/delete-account/  계정 삭제 (애플 5.1.1v)
  scripts/seed-server.mjs          처음 한 번 하늘 채우기
  scripts/subset-fonts.py          카드용 한글 폰트 줄이기
  assets/fonts/                    그 폰트 (5MB, 꼭 함께 올라가야 합니다)
  vercel.json                      /s/:id 연결 + 함수 설정
  .env.example

바뀐 것
  src/lib/storage.js               localStorage → Supabase
  src/hooks/useJanbyeol.js         익명 로그인 · 낙관적 갱신 · 신고/차단
  src/App.jsx                      ?star= 로 들어온 사람, 신고/차단 연결
  src/components/StarCard.jsx      보내기 버튼 · 신고 메뉴
  src/components/ConstellationPanel.jsx  계정 구역 추가
  src/components/Composer.jsx      소개 동의 체크박스 + 약관 고지
  index.html                       janbyeol.com 기준 공유 태그
```

---

## 1. Supabase 만들기 (20분)

1. [supabase.com](https://supabase.com) 에서 프로젝트 생성 — 지역은 **Seoul (ap-northeast-2)**
2. **SQL Editor** 에 `supabase/schema.sql` 전체를 붙여넣고 실행
   (권한 정책이 제대로 도는지 먼저 확인하고 싶다면 `supabase/tests/README.md` —
   로컬 Postgres에 10개 항목을 돌려봅니다. Supabase 계정 없이도 됩니다.)
3. **Authentication → Sign In / Up** 에서 두 가지를 켭니다
   - `Allow anonymous sign-ins` — 로그인 없이 바로 쓰는 지금 UX가 여기 달려 있습니다
   - `Manual Linking` — '내 성단 지키기'(익명 계정에 카카오 잇기)에 필요합니다
4. **Authentication → Providers** 에서 Kakao와 Google을 설정
   - 리디렉션 주소에 `https://janbyeol.com/` 를 넣어주세요
   - 카카오는 [developers.kakao.com](https://developers.kakao.com) 에서 앱을 먼저 만들어야 합니다
5. **Project Settings → API** 에서 두 값을 복사해 둡니다
   - `Project URL`, `anon public` — 브라우저용
   - `service_role` — 서버용. **절대 프런트엔드에 두지 마세요**

## 2. 로컬에서 확인 (10분)

```bash
cp .env.example .env.local     # URL과 anon 키를 채웁니다
npm install
npm run dev
```

별이 하나도 없으면 정상입니다. 하늘을 한 번 채워주세요.

```bash
SUPABASE_URL=https://xxxx.supabase.co \
SUPABASE_SERVICE_KEY=eyJ... \
node scripts/seed-server.mjs
```

새로고침하면 예시 잔별 스물여덟 개가 떠 있습니다. 두 번 돌려도 안전해요.
지우고 싶으면 SQL Editor에서 `delete from stars where seeded;`

이때 확인할 것:

- [ ] 잔별을 띄우면 **다른 브라우저(시크릿 창)에서도** 보이는가 ← 이게 되면 서버 이관 성공입니다
- [ ] 온기를 더했다 거두면 숫자가 맞는가
- [ ] 나의 성단 맨 아래에 '이 성단을 지키는 일'이 보이는가
- [ ] 남의 별 카드 오른쪽 위 점 세 개 → 신고 / 그만 보기가 되는가
- [ ] **시크릿 창에서 내 별에 온기를 더했을 때 숫자가 오르는가** ← 트리거 권한이 걸리는 자리

## 3. Vercel에 올리기 (15분)

1. 깃허브에 올리고 Vercel에서 Import
2. **Settings → Environment Variables** 에 네 개를 넣습니다

   | 이름 | 값 | 어디에 |
   |---|---|---|
   | `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` | 전부 |
   | `VITE_SUPABASE_ANON_KEY` | `eyJ...` (anon) | 전부 |
   | `SUPABASE_SERVICE_KEY` | `eyJ...` (service_role) | 전부 |
   | `PUBLIC_BASE_URL` | `https://janbyeol.com` | 전부 |

3. **Settings → Domains** 에서 `janbyeol.com` 추가 → 도메인 산 곳에서 네임서버나
   A/CNAME 레코드를 Vercel이 알려주는 값으로 바꿉니다 (보통 10분~2시간)
4. `www.janbyeol.com` 도 추가하고 `janbyeol.com` 으로 리디렉션시켜 두세요

## 4. 공유 미리보기 켜기 (10분)

배포가 끝나면:

1. `https://janbyeol.com` 을 [카카오 디버거](https://developers.kakao.com/tool/debugger/sharing)에
   넣고 **초기화** → 다시 조회. 밤하늘 썸네일이 보이면 됩니다
2. 별 하나를 열고 **보내기** → 나온 `/s/...` 주소를 디버거에 넣어보세요.
   그 글이 담긴 세로 카드가 떠야 합니다
3. 실제로 카톡 나에게 보내기로 한 번 보내보세요

> ⚠️ 썸네일을 나중에 바꿀 때는 파일만 덮어쓰지 마세요. 카카오톡은 한 번 만든
> 썸네일을 **약 100일** 캐시합니다. `index.html` 의 `og-image.png?v=1` 을
> `?v=2` 로 올려야 바뀝니다.

## 4-2. 약관 채우기 — 공개 전에 꼭

`public/terms.html` 과 `public/privacy.html` 에 초안이 들어 있습니다.
**변호사가 쓴 것이 아니므로 공개 전에 검토를 받으세요.** 두 파일 맨 위의
주황색 상자에 고쳐야 할 곳이 적혀 있고, 다 고친 뒤 그 상자를 지우면 됩니다.

- [ ] 시행일 두 곳 (`2026년 00월 00일`)
- [ ] 운영자 실명 두 곳 — 개인정보 보호책임자는 **법상 필수 기재사항**입니다
- [ ] 개인정보처리방침 제6조 **국외 이전** — Supabase 리전에 따라 내용이 달라집니다
- [ ] 개인정보 보호법이 **2026년 9월 11일자로 개정 시행**되었습니다. 추가된 기재사항이 있는지 확인
- [ ] 배포 후 `janbyeol.com/terms` 와 `/privacy` 가 열리는지 확인

소개 동의는 **글을 쓸 때 체크박스**로 받습니다. 기본은 꺼져 있고,
체크한 잔별만 인스타에 올라갑니다. 내 잔별 카드에서 언제든 거둘 수 있습니다.

**여기까지가 런칭입니다.**

---

## 5. 계정 삭제 함수 (앱 준비할 때)

웹만 운영하는 동안은 없어도 돌아갑니다. 다만 '계정과 모든 잔별 지우기' 버튼이
눌리면 실패하니, 앱스토어를 생각한다면 미리 올려두세요.

```bash
npm i -g supabase
supabase login
supabase link --project-ref <프로젝트 ref>
supabase functions deploy delete-account
```

## 6. 인스타 자동 게시

이제 서버에 '가장 온기 많은 글'이 실제로 있으므로 돌아갑니다.

1. 인스타 계정을 **프로페셔널(크리에이터)** 로 전환
   — 개인 계정은 API 게시가 아예 안 됩니다. 페이스북 페이지는 이제 필요 없습니다
2. [developers.facebook.com](https://developers.facebook.com) 에서 앱 생성 →
   Instagram API with Instagram Login → `instagram_business_content_publish` 권한 신청
   — **검수에 며칠~몇 주 걸립니다.** 지금 신청해두세요
3. 깃허브 Secrets에 `SUPABASE_URL` `SUPABASE_SERVICE_KEY` `IG_USER_ID` `IG_ACCESS_TOKEN`,
   Variables에 `PUBLIC_BASE_URL`
4. 처음 한두 달은 자동 크론을 끄고 손으로 확인하며 올리는 걸 권합니다

```bash
npm run ig:dry        # out/card.jpg 에 오늘의 카드만 만들어 봅니다
```

`.github/workflows/daily-instagram.yml` 의 `schedule:` 줄을 지우면 자동 실행이 멈추고,
Actions 탭에서 손으로만 돌릴 수 있습니다.

> 소개 동의는 글을 쓸 때 체크박스로 받고 있고(기본 꺼짐), 약관 제9조가 그 근거입니다.
> 예시 별(`seeded`)도 게시 대상에서 빠져 있습니다. 이 스크립트는 체크된 잔별만 고릅니다.

---

## 막혔을 때

**별이 하나도 안 보여요 / "하늘에 닿지 못했어요" 가 뜹니다**
`.env.local` 이 있는지, 개발 서버를 다시 띄웠는지 보세요 (Vite는 환경변수를 재시작 때만 읽습니다).
배포라면 Vercel 환경변수를 확인하고 다시 배포하세요.
브라우저 콘솔에 `[잔별]` 로 시작하는 메시지가 있으면 거기에 답이 있습니다.

**"new row violates row-level security policy"**
`schema.sql` 의 RLS 정책이 다 안 올라갔거나, 익명 로그인이 꺼져 있습니다.
Authentication → Sign In / Up 에서 `Allow anonymous sign-ins` 를 확인하세요.

**"insert or update on table stars violates foreign key constraint"**
`handle_new_user` 트리거가 없습니다. `schema.sql` 의 그 부분만 다시 실행하세요.

**카드 글자가 전부 □□□**
한글 폰트가 안 올라갔습니다. `assets/fonts/` 에 `.otf` 두 개가 있는지,
`vercel.json` 의 `includeFiles` 가 살아 있는지 보세요.
다시 만들려면 `python3 scripts/subset-fonts.py`.

**카톡 미리보기가 안 바뀌어요**
카카오 디버거에서 초기화 → 그래도 안 되면 이미지 주소의 `?v=` 번호를 올리세요.
이미지 캐시는 초기화 대상이 아니라 주소가 바뀌어야 새로 받아옵니다.

**'내 성단 지키기'를 눌렀는데 아무 일도 안 일어나요**
Supabase에서 Manual Linking이 꺼져 있거나, 해당 제공자의 리디렉션 주소에
`https://janbyeol.com/` 이 안 들어 있습니다.

**남의 별에 온기를 더했는데 숫자가 안 올라가요**
`sync_warmth` 가 `security definer` 로 안 올라갔습니다. 온기를 주는 사람과
별의 주인이 다르기 때문에, 이게 없으면 RLS에 막혀 조용히 아무 일도 안 일어납니다.
`supabase/schema.sql` 의 그 함수를 다시 실행하세요.
(`supabase/tests/` 의 1번 항목이 이걸 잡아냅니다.)
