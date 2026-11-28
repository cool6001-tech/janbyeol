/**
 * 손님별 — 잔별 하늘을 잠시 지나가는 다른 서비스의 별
 * ---------------------------------------------------------------
 * 잔별의 별은 모두 **누군가의 하루**입니다. 그래서 콜라보 서비스는 잔별(별)로 띄우지 않고,
 * 은하 바깥을 도는 **혜성·행성**으로 띄웁니다. 사람들의 별과 섞이지 않고, 한눈에
 * "이건 손님이구나" 하고 알 수 있게요.
 *
 *   혜성(comet)  — 정해진 기간에만 찾아왔다가 떠나는 손님 (시즌 콜라보)
 *   행성(planet) — 오래 곁에 머무는 이웃 (상시 파트너)
 *
 * 이 하늘에 들어오는 손님의 기준
 *   · 사람의 마음을 다독이거나, 작은 선의를 건네는 서비스
 *   · 광고처럼 깜빡이지 않습니다. 은하 가장자리를 천천히 돌 뿐이에요.
 *   · 누르면 바로 떠나지 않고, 먼저 "어떤 손님인지" 잔별의 말투로 소개합니다.
 *   · 잔별 밖으로 나간다는 걸 분명히 알려줍니다.
 *
 * 새 콜라보를 더할 때는 아래 배열에 하나만 추가하면 됩니다.
 * 기간(from · until)이 지나면 저절로 하늘에서 사라져요.
 * orbit 을 적지 않으면 그날의 하늘을 보고 **별과 최대한 겹치지 않는 궤도**를
 * 스스로 고릅니다 (autoOrbit). 손님마다 고르는 자리가 달라요.
 * ---------------------------------------------------------------
 */

/**
 * 새 손님 알림 방식
 *   'fade'    — 화면 가운데 떠올랐다가 6초쯤 뒤 저절로 사라짐 (하늘을 가리지 않음)
 *   'confirm' — 화면 가운데 떠 있다가 [확인]을 눌러야 사라짐 ([혜성 보러 가기]도 함께)
 *
 * 미리보기: 주소 뒤에 ?visitor-preview=fade 또는 ?visitor-preview=confirm
 * (이미 본 사람도 다시 보이고, '봤음' 기록은 남기지 않습니다)
 */
export const ANNOUNCE_STYLE = 'confirm'
export const ANNOUNCE_MS = 6200

export const VISITORS = [
  {
    id: 'santa-2026',
    kind: 'comet',
    name: '혜성 산타',
    // 하늘의 이름표에서 도드라지게 보일 낱말 (굵게 · 손님 고유의 색)
    accent: '산타',
    partner: '산타의 칭찬카드',
    url: 'https://santa.nemoneai.com/',
    campaign: 'santa_2026',
    // 한국 시간 기준. 크리스마스(12월 25일) 하루가 끝나는 자정에 하늘을 떠납니다.
    from: '2026-11-28T00:00:00+09:00',
    until: '2026-12-26T00:00:00+09:00',

    // 하늘에서의 모습 — 산타의 붉은 옷과, 온기의 금빛
    head: [255, 120, 104], // 머리의 빛
    tail: [255, 214, 170], // 꼬리의 빛
    // 은하 둘레를 도는 길 (은하 반지름 1650 바깥쪽 가장자리)
    // 성단들이 모인 은하 한가운데를 돕니다. 핵의 빛에 묻히지 않게 원반보다 조금 위(lift)로 떠서.
    orbit: { a: 640, b: 640, lift: 260, tilt: 0.05, period: 240, phase: 2.4 },
    // 반짝일 때 번갈아 드는 빛 — 크리스마스의 빨강 · 금빛 · 초록
    sparkle: [
      [255, 92, 92],
      [255, 214, 120],
      [110, 232, 160],
    ],

    // 소개 시트 오른쪽 위에 걸터앉는 그림 (파트너 서비스의 그림을 그대로 불러옵니다)
    //   crop: 원본에서 잘라 쓸 영역 [x, y, 너비, 높이] — 간판 위의 산타만
    //   size: 원본 크기 [너비, 높이] · width: 시트에 보일 너비(px)
    //   잘린 아래 가장자리(산타의 손)가 시트 윗변에 얹히도록 놓입니다.
    art: {
      src: 'https://santa.nemoneai.com/v2r11/home-hero-desktop-r11.webp',
      alt: '엄지를 치켜든 산타',
      size: [1044, 668],
      crop: [196, 0, 644, 312],
      width: 190,
    },

    // 누르면 뜨는 소개 — 잔별의 말투로
    sheet: {
      eyebrow: '잔별에 찾아온 손님별',
      title: '어른에게도 산타는 필요하니까',
      body: [
        '올겨울, 잔별 하늘을 혜성 산타가 지나가고 있어요.',
        '이름과 MBTI, 혈액형을 알려주면 산타가 당신만을 위한 칭찬카드를 써 준대요. 매번 다른 말로요.',
        '오늘 하루를 별로 띄운 당신에게, 누군가 “잘했어” 하고 말해주는 밤이 되길.',
      ],
      cta: '산타에게 칭찬 받으러 가기',
      note: '산타의 칭찬카드(네모네) 페이지로 이동해요',
    },
  },
]

/** 지금 하늘에 떠 있는 손님들 */
export function activeVisitors(now = Date.now()) {
  return VISITORS.filter((v) => {
    const from = v.from ? new Date(v.from).getTime() : -Infinity
    const until = v.until ? new Date(v.until).getTime() : Infinity
    return now >= from && now < until
  })
}

/**
 * 손님이 지금 있는 자리 (3D). 시간 t(초)에 따라 은하 둘레를 천천히 돕니다.
 * 저장하지 않습니다 — 잔별과 달리 손님은 '지나가는' 존재라서요.
 */
export function visitorPos(v, t, orbit = v.orbit) {
  const o = orbit
  const ang = o.phase + (t / o.period) * Math.PI * 2
  const x = Math.cos(ang) * o.a
  const z = Math.sin(ang) * o.b
  // 살짝 기운 궤도 — 원반과 겹치지 않고 위를 비스듬히 지나갑니다
  const y = o.lift + Math.sin(ang) * o.a * o.tilt
  return { x, y, z }
}

/** 손님마다 늘 같은 값을 내는 작은 난수 (id 가 씨앗) */
function seeded(id) {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }
}

/**
 * 별과 최대한 겹치지 않는 궤도 고르기
 * ---------------------------------------------------------------
 * 은하 안쪽부터 화면에서 벗어나지 않는 바깥 한계(1300)까지, 여러 반지름·높이의 고리를
 * 후보로 두고 고리 가까이에 있는 잔별 수를 셉니다. 가장 한산한 고리를 고르되,
 *   · 다른 손님의 고리와는 떨어지게 하고
 *   · 비슷하게 한산한 고리끼리는 손님마다 다른 씨앗으로 골라서 (랜덤하게) 자리가 겹치지 않게 합니다.
 * 한 번 고른 궤도는 그 방문 동안 바뀌지 않아요 (별이 늘어도 혜성이 순간이동하지 않도록).
 */
export function autoOrbit(v, stars = [], taken = []) {
  const rnd = seeded(v.id)
  const NEAR = 170 // 이 거리 안의 잔별은 '겹친다'고 봅니다
  const pts = stars.map((s) => s.pos).filter(Boolean)
  let best = null
  for (let r = 450; r <= 1300; r += 50) {
    for (const lift of [140, 220, 300, 380]) {
      let crowd = 0
      for (const p of pts) {
        // 위에서 내려다보면 높이 차이는 잘 안 보여서, 은하 중심에서의 거리 차이로 겹침을 잽니다
        const d = Math.abs(Math.hypot(p.x, p.z) - r) + Math.abs(p.y - lift) * 0.25
        if (d < NEAR) crowd += 1 - d / NEAR
      }
      // 다른 손님 고리와 가까우면 벌점
      for (const o of taken) {
        const gap = Math.hypot(o.a - r, o.lift - lift)
        if (gap < 260) crowd += (260 - gap) * 0.2
      }
      const score = crowd + rnd() * 1.5 // 비슷하면 씨앗이 고릅니다
      if (!best || score < best.score) best = { score, r, lift }
    }
  }
  return {
    a: best.r,
    b: best.r,
    lift: best.lift,
    tilt: 0.02 + rnd() * 0.05,
    period: 240 + rnd() * 180,
    phase: rnd() * Math.PI * 2,
  }
}

/** 손님이 머무는 마지막 날 — '12월 25일' (until 직전의 한국 날짜) */
export function lastDayLabel(v) {
  if (!v.until) return ''
  const d = new Date(new Date(v.until).getTime() - 1)
  return d.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' })
}

/** 바깥으로 나가는 주소 — 어디서 왔는지 상대 서비스가 알 수 있게 꼬리표를 붙입니다 */
export function visitorLink(v) {
  try {
    const u = new URL(v.url)
    u.searchParams.set('utm_source', 'janbyeol')
    u.searchParams.set('utm_medium', v.kind)
    u.searchParams.set('utm_campaign', v.campaign || v.id)
    return u.toString()
  } catch {
    return v.url
  }
}

/**
 * 새 손님 알림 — 손님마다 **한 번만**.
 * 이 기기에서 아직 알리지 않은 손님들을 돌려주고, 알린 것으로 적어 둡니다.
 * (같은 날 둘이 함께 나타나면 한 번에 묶어서 알립니다)
 */
const SEEN_KEY = 'janbyeol:visitors-seen'
export function takeUnseenVisitors(list) {
  let seen = []
  try {
    seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')
  } catch {
    /* 저장소를 못 쓰는 환경 — 매번 알려도 괜찮습니다 */
  }
  const fresh = list.filter((x) => !seen.includes(x.id))
  if (!fresh.length) return []
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, ...fresh.map((x) => x.id)]))
  } catch {
    /* 무시 */
  }
  return fresh
}
