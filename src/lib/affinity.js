/**
 * 얼마나 닮았는가 — 소재와 감정, 두 축으로
 * ---------------------------------------------------------------
 * 예전에는 "겹치는 태그 개수"가 전부였습니다. 그래서 할머니와 엄마가 똑같이
 * '가족' 하나로 뭉개지고, 기쁨과 슬픔은 완전한 남남이었어요.
 *
 * 사람이 느끼는 닮음은 그렇지 않습니다.
 *
 *   할머니에 대한 즐거운 기억  ↔  할머니에 대한 즐거운 기억   10점
 *   할머니에 대한 즐거운 기억  ↔  할머니에 대한 슬픈 기억      7점   ← 소재가 같으니까
 *   할머니에 대한 즐거운 기억  ↔  엄마에 대한 슬픈 기억        4점   ← 같은 '가족'이긴 하니까
 *   할머니에 대한 즐거운 기억  ↔  바다에서의 슬픔              1점
 *
 * 소재가 같으면 감정이 반대여도 여전히 가깝습니다. 같은 것을 겪은 사람이니까요.
 * 그래서 소재에 0.7, 감정에 0.3을 줍니다. 소재가 같고 감정이 정반대일 때
 * 정확히 7점이 나오도록 맞춘 가중치입니다.
 *
 * 점수는 화면에 보이지 않습니다. 가까이 둘지 한 단계 건너 둘지를 정할 뿐이에요.
 */

/* ---------------------------------------------------------------
   소재 — 무엇에 대한 이야기인가

   group이 있는 이유: 할머니와 엄마는 다른 사람이지만 남남은 아닙니다.
   같은 key면 1.0, 같은 group이면 0.55.
--------------------------------------------------------------- */
export const TOPICS = [
  { key: '할머니', group: '가족', re: /할머니|할매|외할머니|친할머니/ },
  { key: '할아버지', group: '가족', re: /할아버지|할배|외할아버지|친할아버지/ },
  { key: '엄마', group: '가족', re: /엄마|어머니|모친/ },
  { key: '아빠', group: '가족', re: /아빠|아버지|부친/ },
  { key: '형제', group: '가족', re: /동생|누나|형이|언니|오빠|남매|형제/ },
  { key: '가족', group: '가족', re: /가족|식구|집안|부모님/ },

  { key: '연인', group: '사람', re: /남자친구|여자친구|애인|연인|헤어졌|고백/ },
  { key: '친구', group: '사람', re: /친구|동기|선배|후배|동료/ },
  { key: '낯선이', group: '사람', re: /아저씨|아주머니|할머님|모르는 사람|낯선/ },

  { key: '동물', group: '동물', re: /고양이|강아지|반려|길냥|냥이|멍멍|산책시/ },

  { key: '일', group: '일', re: /회사|출근|퇴근|일터|작업|현장|공구|기계|배선|납기|야근|월급|회의|상사|업무|사무실|작업복/ },
  { key: '학업', group: '일', re: /학교|시험|공부|과제|수업|졸업|학원/ },

  { key: '비', group: '날씨', re: /비가|비는|비를|비에|빗방울|장마|우산|소나기|젖었/ },
  { key: '눈', group: '날씨', re: /첫눈|함박눈|눈이 내|눈길|눈사람/ },
  { key: '계절', group: '날씨', re: /봄|여름|가을|겨울|목련|벚꽃|단풍|더위|추위/ },

  { key: '바다', group: '장소', re: /바다|파도|해변|해안|물결|섬|제주|한강/ },
  { key: '길', group: '장소', re: /버스|지하철|출근길|퇴근길|골목|정류장|횡단보도|기차/ },
  { key: '집', group: '장소', re: /집에|방에|냉장고|빨래|청소|이불|현관|창문/ },

  { key: '밤', group: '시간', re: /밤|새벽|자정|불면|잠 못|야식|한밤/ },

  { key: '음식', group: '일상', re: /밥|김치|라면|커피|삼각김밥|먹었|식사|한 끼|술/ },
  { key: '몸', group: '일상', re: /아팠|아프|병원|감기|약을|잠을|졸려/ },
]

/* ---------------------------------------------------------------
   감정 — 어떤 마음인가

   (v, e) = 좋고 싫음(valence), 깨어 있음과 가라앉음(energy).
   좌표를 주는 이유는 슬픔과 고독이 슬픔과 기쁨보다 가깝기 때문입니다.
   같으냐 다르냐로만 보면 이 차이가 사라져요.
--------------------------------------------------------------- */
export const EMOTIONS = [
  { key: '기쁨', v: 0.9, e: 0.5, re: /기쁘|기뻤|좋았|행복|뿌듯|웃었|웃음|설레|다행|신났|즐거|반가|성취|고마웠/ },
  { key: '평온', v: 0.35, e: -0.45, re: /편안|평온|고요|잔잔|차분|나른|괜찮|놓였|덤덤/ },
  { key: '그리움', v: -0.2, e: -0.2, re: /그립|그리워|그리웠|보고 싶|생각난|생각이 나|생각나|추억|옛|오래된 일/ },
  { key: '슬픔', v: -0.9, e: -0.3, re: /슬프|슬펐|눈물|먹먹|울었|울고|울다|울컥|서럽|허전|속상|서운/ },
  { key: '고독', v: -0.6, e: -0.7, re: /혼자|외로|고독|쓸쓸|적막|덩그러니|아무도|혼잣/ },
  { key: '피로', v: -0.5, e: -1, re: /피곤|지친|지쳐|한숨|힘들|버겁|번아웃|지겹/ },
  { key: '불안', v: -0.7, e: 0.65, re: /불안|초조|걱정|무섭|두렵|긴장|조마조마/ },
]

/** 감정 좌표에서 나올 수 있는 가장 먼 거리쯤 (기쁨 ↔ 불안·슬픔) */
const EMOTION_SPAN = 2.4

/** 소재 0.7 + 감정 0.3 — 소재가 같고 감정이 정반대면 7점이 되는 배분 */
const TOPIC_WEIGHT = 0.7
const EMOTION_WEIGHT = 0.3

/* ---------------------------------------------------------------
   글에서 두 축을 뽑아낸다
--------------------------------------------------------------- */

export function facetsOf(text) {
  const body = text || ''
  const topics = []
  const emotions = []
  for (const t of TOPICS) if (t.re.test(body)) topics.push(t)
  for (const em of EMOTIONS) if (em.re.test(body)) emotions.push(em)
  return { topics, emotions }
}

/** 별마다 한 번만 뽑아 두고 다시 씁니다 (짝을 지으면 n² 번 필요하니까) */
const cache = new Map()

export function facetsOfStar(star) {
  const hit = cache.get(star.id)
  if (hit) return hit
  const facets = facetsOf(star.text)
  cache.set(star.id, facets)
  // 예전 한도(4,000)는 별이 그보다 많아지면 계산 도중에 캐시가 계속 비워져서
  // 같은 글을 수백만 번 다시 읽었어요 (5,000개에서 10초 멈춤의 큰 원인). 넉넉히 둡니다.
  if (cache.size > 100000) cache.clear()
  return facets
}

/* ---------------------------------------------------------------
   닮음
--------------------------------------------------------------- */

function topicSim(a, b) {
  if (!a.length || !b.length) return 0
  let best = 0
  let exact = 0
  for (const x of a) {
    for (const y of b) {
      if (x.key === y.key) {
        best = 1
        exact++
      } else if (x.group === y.group && best < 0.55) {
        best = 0.55
      }
    }
  }
  // 소재가 여러 개 겹치면 조금 더 — '비 오는 바다'는 '비'만 같은 글보다 가깝습니다
  return Math.min(1, best + Math.max(0, exact - 1) * 0.12)
}

function emotionSim(a, b) {
  // 마음이 잡히지 않는 글도 있습니다. 둘 다 그렇다면 담담한 일상끼리 닮은 셈.
  if (!a.length && !b.length) return 0.5
  if (!a.length || !b.length) return 0.3

  let best = 0
  for (const x of a) {
    for (const y of b) {
      const d = Math.hypot(x.v - y.v, x.e - y.e)
      const sim = Math.max(0, 1 - d / EMOTION_SPAN)
      if (sim > best) best = sim
    }
  }
  return best
}

/**
 * 두 잔별이 얼마나 닮았는가. 0~10.
 * 화면에 숫자로 보이지는 않습니다 — 얼마나 가까이 둘지를 정할 뿐이에요.
 */
export function affinityOf(starA, starB) {
  const a = facetsOfStar(starA)
  const b = facetsOfStar(starB)
  return (
    10 *
    (TOPIC_WEIGHT * topicSim(a.topics, b.topics) +
      EMOTION_WEIGHT * emotionSim(a.emotions, b.emotions))
  )
}

/** 사람이 읽을 수 있는 설명 — 개발 중에 왜 이 점수가 나왔는지 볼 때 */
export function explain(starA, starB) {
  const a = facetsOfStar(starA)
  const b = facetsOfStar(starB)
  return {
    score: Number(affinityOf(starA, starB).toFixed(2)),
    topics: [a.topics.map((t) => t.key), b.topics.map((t) => t.key)],
    emotions: [a.emotions.map((e) => e.key), b.emotions.map((e) => e.key)],
    topicSim: Number(topicSim(a.topics, b.topics).toFixed(2)),
    emotionSim: Number(emotionSim(a.emotions, b.emotions).toFixed(2)),
  }
}
