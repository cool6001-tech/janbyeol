/**
 * 처음 오신 분을 위한 예시 잔별
 * ---------------------------------------------------------------
 * 빈 하늘로 시작하면 이 서비스가 무엇인지 보이지 않아서,
 * 첫 방문 때 한 번만 심어둡니다. (나의 성단에서 전부 지울 수 있습니다.)
 *
 * 형식: [본문, 태그, 사진씨앗(0이면 사진 없음), 며칠 전, 내가 쓴 글인지]
 */

import { galaxyPositionFor } from '../lib/galaxy.js'

const ENTRIES = [
  ['제주엔 비가 왔다. 바다가 온통 회색이라 오히려 마음이 놓였다.', ['비', '바다', '슬픔'], 101, 2, false],
  ['배선반 앞에 서면 늘 한숨부터 나온다. 어제 내 손으로 꽂은 선인데 오늘은 낯설다.', ['일', '피로'], 202, 1, false],
  ['퇴근길 버스 창에 이마를 대면 유리가 차갑다. 그게 좋아서 계속 대고 있었다.', ['일상', '밤'], 0, 4, false],
  ['편의점 삼각김밥 비닐을 세 번째 시도에 성공했다. 오늘의 성취.', ['일상', '기쁨'], 0, 6, false],
  ['엄마가 김치를 보냈다. 택배 상자에 테이프가 열 바퀴 감겨 있었다.', ['가족'], 303, 9, false],
  ['새벽 세 시. 냉장고 돌아가는 소리만 들린다.', ['밤', '고독'], 0, 3, false],
  ['출근길에 목련이 다 떨어져 있었다. 어제까진 분명 있었는데.', ['일상', '슬픔'], 404, 15, false],
  ['회의에서 한마디도 못 했다. 할 말은 있었는데.', ['일', '고독'], 0, 21, false],
  ['고양이가 무릎에서 잠들어서 다리가 저린데 못 움직이겠다.', ['동물', '기쁨'], 505, 8, false],
  ['비 오는 날 우산 없이 걸었다. 생각보다 안 춥더라.', ['비', '일상'], 0, 34, false],
  ['월급날인데 통장이 조용하다.', ['일', '피로'], 0, 27, false],
  ['친구 결혼식에서 혼자 웃다가 혼자 울었다.', ['기쁨', '슬픔'], 0, 52, false],
  ['한강에 앉아 있으면 세상에서 나만 멈춰 있는 것 같다.', ['고독', '밤'], 606, 63, false],
  ['오늘 처음으로 커피를 안 마셨다. 별일 아닌데 뿌듯하다.', ['일상'], 0, 12, false],
  ['작업복 소매가 또 기름에 젖었다. 이젠 냄새도 익숙하다.', ['일', '피로'], 0, 45, false],
  ['지하철에서 자리를 양보했는데 안 앉으셨다. 괜히 민망해서 다음 역에 내렸다.', ['일상'], 0, 88, false],
  ['밤바다는 소리만 들린다. 안 보여도 거기 있다는 게 좋다.', ['바다', '밤'], 707, 120, false],
  ['동생이 먼저 전화를 걸어왔다. 용건은 없었다.', ['가족', '기쁨'], 0, 150, false],
  ['설명서 없는 기계를 삼십 분 만에 고쳤다. 아무도 안 봤지만.', ['일', '기쁨'], 0, 190, false],
  ['울고 싶은데 눈물이 안 나는 날이 있다.', ['슬픔', '고독'], 0, 240, false],
  ['빨래에서 햇빛 냄새가 났다.', ['일상', '기쁨'], 808, 300, false],
  ['장마가 끝났다는데 아직 우산을 못 치웠다.', ['비', '일상'], 0, 380, false],

  // 내가 쓴 잔별 — 시간 축과 감정의 궤적이 보이도록 흩어 둡니다
  ['오늘은 아무 일도 없었다. 그게 제일 좋았다.', ['일상'], 0, 5, true],
  ['야근하고 나오니 별이 보였다. 서울에서도 보이는구나.', ['일', '밤', '피로'], 0, 23, true],
  ['혼자 먹는 밥이 편해진 게 다행인지 아닌지 모르겠다.', ['고독', '일상'], 909, 70, true],
  ['비가 오면 이상하게 오래된 일이 생각난다.', ['비', '슬픔'], 0, 140, true],
  ['아빠 목소리가 조금 작아진 것 같았다.', ['가족', '슬픔'], 0, 260, true],
]

/** 딱 1년 전 오늘 — '작년 오늘의 별'이 첫 방문에도 보이도록 */
const ANNIVERSARY = [
  '처음으로 혼자 바다에 갔다. 아무한테도 말 안 했다.',
  ['바다', '고독'],
  1010,
]

/**
 * 예시 잔별을 쓴 사람들.
 * 한 사람 = 하나의 성단이므로, 여러 명이 있어야 은하에 성단이 여럿 생깁니다.
 */
const OTHERS = [
  { id: 'other-dawn', name: '새벽 세 시의 누군가' },
  { id: 'other-laundry', name: '빨래 개는 사람' },
  { id: 'other-magnolia', name: '목련 아래' },
  { id: 'other-waves', name: '파도 세는 사람' },
  { id: 'other-far', name: '먼 곳에서' },
  { id: 'other-december', name: '12월의 밤' },
]

const PRESET_REPLIES = {
  0: [['먼 곳에서', '저도 그 회색이 좋아요. 아무것도 안 해도 되는 색 같아서.']],
  1: [['새벽 세 시의 누군가', '익숙해진 게 서러운 날도 있죠.']],
  5: [
    ['빨래 개는 사람', '저도 지금 깨어 있어요.'],
    ['12월의 밤', '냉장고 소리, 이상하게 위로가 돼요.'],
  ],
  19: [['목련 아래', '그런 날은 그냥 앉아 있어도 돼요.']],
  22: [['이름 없는 잔별', '아무 일 없는 하루가 제일 귀해요.']],
  25: [['먼 곳에서', '저도 오늘 그랬어요.']],
}

const DAY = 86400000

function makeId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

export function buildSeed(me, now = Date.now()) {
  const stars = ENTRIES.map((entry, i) => {
    const [text, tags, photoSeed, daysAgo, mine] = entry
    const replies = (PRESET_REPLIES[i] || []).map(([who, body]) => ({
      id: makeId('r'),
      who,
      text: body,
      createdAt: new Date(now - daysAgo * DAY + 3600000).toISOString(),
    }))
    const author = OTHERS[i % OTHERS.length]
    const base = {
      id: makeId('s'),
      authorId: mine ? me.id : author.id,
      authorName: mine ? me.name : author.name,
      text,
      tags,
      photo: null,
      photoSeed: photoSeed || null,
      createdAt: new Date(now - daysAgo * DAY).toISOString(),
      warmth: mine ? Math.floor(Math.random() * 24) + 3 : Math.floor(Math.random() * 9),
      warmedBy: [],
      replies,
      seeded: true,
      posV: 3,
    }
    return { ...base, pos: galaxyPositionFor(base, undefined, now) }
  })

  // 정확히 1년 전 오늘
  const today = new Date(now)
  const lastYear = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate(), 21, 40)
  const anniversary = {
    id: makeId('s'),
    authorId: me.id,
    authorName: me.name,
    text: ANNIVERSARY[0],
    tags: ANNIVERSARY[1],
    photo: null,
    photoSeed: ANNIVERSARY[2],
    createdAt: lastYear.toISOString(),
    warmth: 37,
    warmedBy: [],
    replies: [
      {
        id: makeId('r'),
        who: '파도 세는 사람',
        text: '혼자 간 바다는 오래 남더라고요.',
        createdAt: new Date(lastYear.getTime() + 7200000).toISOString(),
      },
    ],
    seeded: true,
    posV: 3,
  }
  stars.push({ ...anniversary, pos: galaxyPositionFor(anniversary, undefined, now) })

  return stars
}
