/**
 * 은하의 모양 — 그리고 그 안의 성단들
 * ---------------------------------------------------------------
 * 천문학에서 성단은 은하의 하위 구조입니다. 은하 안 한 지점에 중력으로 묶여
 * 뭉쳐 있는 별 무리죠. 흩어져 있으면 성단이 아닙니다.
 *
 * 그래서 이 서비스의 구조도 그대로 따릅니다.
 *
 *   잔별      글 하나          별 하나
 *   성단      한 사람의 기록    은하 안 한 자리에 뭉친 별 무리
 *   은하      모두의 성단      수만 개의 성단이 모여 이룬 나선
 *
 * 사람마다 은하 안에 자기 자리(성단 터)를 하나 갖습니다. 내가 띄우는 잔별은
 * 전부 그 자리 근처에서 태어나요. 그래서 '나의 성단'은 비유가 아니라 사실입니다.
 *
 * 배경 잔별도 매끄럽게 흩뿌리지 않고 성단 단위로 뭉쳐서 만듭니다.
 * 나선 팔의 울퉁불퉁한 결이 곧 '아직 다가가지 않은 남의 성단들'입니다.
 */

export const ARMS = 4
const R_MAX = 1650 // 은하 반지름
const R_BULGE = 240 // 중심 핵
const WINDING = 2.35 // 팔이 감기는 정도
const THICK = 105 // 중심부 원반 두께

/** 성단 하나의 크기. 은하 반지름의 1/15쯤 — 다가가면 화면을 채웁니다. */
export const CLUSTER_R = 105

/* ---------------------------------------------------------------
   성단 안에서 잔별의 자리를 무엇으로 정할지

   inward   오래된 잔별일수록 성단 중심으로 잠긴다
            (실제 성단도 오래된 별이 안쪽에 모입니다)
   byEmotion 방향을 감정 태그로 — 같은 마음은 성단의 같은 쪽에 모인다
--------------------------------------------------------------- */
export const CLUSTER_MAPPING = {
  inward: true,
  byEmotion: true,
}

/* ---------------- 결정적 난수 ---------------- */

/** 같은 씨앗이면 언제나 같은 자리 — 좌표가 기록의 일부가 되려면 필요합니다 */
export function hashSeed(value) {
  const str = String(value)
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function rng(seed) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s >>>= 0
    s ^= s >> 17
    s ^= s << 5
    s >>>= 0
    return s / 4294967296
  }
}

/** 정규분포 비슷하게 (가운데가 촘촘하고 바깥이 성기게) */
function gauss(rand) {
  return rand() + rand() + rand() - 1.5
}

/* ---------------- 나선 팔 ---------------- */

/**
 * 팔 위의 한 점.
 * @param t 0(중심) ~ 1(가장자리)
 */
export function armPoint(rand, t, arm, spread = 1) {
  const r = R_BULGE + Math.pow(t, 0.85) * (R_MAX - R_BULGE)
  const spin = WINDING * Math.log(1 + 2.6 * t)
  const scatter = gauss(rand) * 0.34 * spread * (1 - 0.3 * t)
  const theta = (arm * Math.PI * 2) / ARMS + spin + scatter
  const height = (THICK * Math.exp(-r / 850) + 12) * gauss(rand) * 0.8
  return { x: Math.cos(theta) * r, y: height, z: Math.sin(theta) * r, r, offset: scatter }
}

function bulgePoint(rand) {
  const u = Math.pow(rand(), 1.9)
  const r = u * R_BULGE * 1.5
  const theta = rand() * Math.PI * 2
  const phi = Math.acos(2 * rand() - 1)
  return {
    x: Math.sin(phi) * Math.cos(theta) * r,
    y: Math.cos(phi) * r * 0.45,
    z: Math.sin(phi) * Math.sin(theta) * r,
  }
}

/**
 * 먼지 띠 — 어둡게 칠하는 게 아니라 별을 솎아냅니다.
 * 실제로도 앞쪽 먼지에 가려 별이 안 보이는 것이니까요.
 */
function blockedByDust(rand, offset, t) {
  if (t < 0.12) return false
  const inLane = offset < -0.1 && offset > -0.3
  return inLane && rand() < 0.78
}

/* ---------------- 성단 터 ---------------- */

/**
 * 한 사람에게 은하 안 자리 하나.
 * 같은 사람은 언제나 같은 자리입니다 — 이게 '나의 성단'이 성립하는 근거예요.
 */
export function clusterSiteFor(authorId) {
  const rand = rng(hashSeed('site:' + authorId))
  const arm = Math.floor(rand() * ARMS)
  const t = 0.1 + Math.pow(rand(), 0.9) * 0.86
  const p = armPoint(rand, t, arm, 0.9)
  return { x: p.x, y: p.y, z: p.z }
}

/**
 * 성단 안에서 잔별 하나의 자리.
 * 최근 것은 바깥(별이 태어나는 자리), 오래된 것은 중심으로 잠깁니다.
 */
export function galaxyPositionFor(star, mapping = CLUSTER_MAPPING, now = Date.now()) {
  const site = clusterSiteFor(star.authorId || 'unknown')
  const rand = rng(hashSeed(star.id))

  let depth = 1 // 1 = 성단 바깥, 0 = 중심
  if (mapping.inward && star.createdAt) {
    const days = (now - new Date(star.createdAt).getTime()) / 86400000
    depth = Math.pow(1 - Math.min(1, Math.max(0, days / 730)), 0.8)
  } else {
    depth = rand()
  }
  const r = CLUSTER_R * (0.2 + 0.8 * depth) * (0.55 + rand() * 0.6)

  // 같은 마음은 성단의 같은 쪽에 모인다
  const tagAngle = mapping.byEmotion
    ? ((hashSeed(star.tags?.[0] || '일상') % 3600) / 3600) * Math.PI * 2
    : rand() * Math.PI * 2
  const theta = tagAngle + (rand() - 0.5) * 0.9
  const phi = Math.acos(2 * rand() - 1)

  return {
    x: site.x + Math.sin(phi) * Math.cos(theta) * r,
    y: site.y + Math.cos(phi) * r * 0.6,
    z: site.z + Math.sin(phi) * Math.sin(theta) * r,
  }
}

/* ---------------- 배경 — 아직 다가가지 않은 성단들 ---------------- */

/**
 * 배경 잔별. 매끄럽게 흩뿌리지 않고 성단 단위로 뭉쳐서 만듭니다.
 * 나선 팔의 울퉁불퉁한 결이 곧 남들의 성단이에요.
 * kind 0 = 팔의 성단, 1 = 중심 핵, 2 = 헤일로
 */
export function buildAmbient(count = 20000, seed = 20260914) {
  const rand = rng(seed)
  const out = []

  const bulgeCount = Math.round(count * 0.2)
  for (let i = 0; i < bulgeCount; i++) {
    const p = bulgePoint(rand)
    out.push({ x: p.x, y: p.y, z: p.z, a: 0.22 + rand() * 0.55, kind: 1 })
  }

  const haloCount = Math.round(count * 0.05)
  for (let i = 0; i < haloCount; i++) {
    const theta = rand() * Math.PI * 2
    const phi = Math.acos(2 * rand() - 1)
    const r = R_MAX * (0.7 + rand() * 0.9)
    out.push({
      x: Math.sin(phi) * Math.cos(theta) * r,
      y: Math.cos(phi) * r * 0.6,
      z: Math.sin(phi) * Math.sin(theta) * r,
      a: 0.06 + rand() * 0.18,
      kind: 2,
    })
  }

  // 팔 사이를 옅게 채우는 원반 별 — 팔 사이가 완전히 비어 있지는 않습니다
  const fieldCount = Math.round(count * 0.14)
  for (let i = 0; i < fieldCount; i++) {
    const t = Math.pow(rand(), 1.25)
    const r = R_BULGE * 0.6 + t * (R_MAX - R_BULGE)
    const theta = rand() * Math.PI * 2
    out.push({
      x: Math.cos(theta) * r,
      y: (THICK * Math.exp(-r / 850) + 12) * gauss(rand) * 0.9,
      z: Math.sin(theta) * r,
      a: (0.07 + rand() * 0.24) * (1 - 0.3 * t),
      kind: 0,
    })
  }

  // 나머지는 전부 성단으로
  let remaining = count - out.length
  const PER_SITE = 34
  let guard = 0
  while (remaining > 0 && guard < 40000) {
    guard++
    const t = Math.pow(rand(), 1.05)
    const arm = Math.floor(rand() * ARMS)
    const p = armPoint(rand, t, arm)
    if (blockedByDust(rand, p.offset, t)) continue

    // 성단마다 크기와 밝기가 다르다
    const size = 0.55 + rand() * 1.1
    const members = Math.max(6, Math.round(PER_SITE * size * (0.5 + rand())))
    const glow = (0.14 + rand() * 0.5) * (1 - 0.3 * t)

    for (let i = 0; i < members && remaining > 0; i++) {
      const rr = CLUSTER_R * size * Math.pow(rand(), 0.55)
      const theta = rand() * Math.PI * 2
      const phi = Math.acos(2 * rand() - 1)
      out.push({
        x: p.x + Math.sin(phi) * Math.cos(theta) * rr,
        y: p.y + Math.cos(phi) * rr * 0.6,
        z: p.z + Math.sin(phi) * Math.sin(theta) * rr,
        a: glow * (0.45 + rand() * 0.85),
        kind: 0,
      })
      remaining--
    }
  }

  return out
}

/** 팔을 따라 깔리는 희뿌연 성운 — 별들이 뭉개져 면으로 보이는 부분 */
export function buildClouds(count = 60, seed = 777) {
  const rand = rng(seed)
  const out = []
  for (let i = 0; i < count; i++) {
    const t = Math.pow(rand(), 0.7)
    const arm = Math.floor(rand() * ARMS)
    const p = armPoint(rand, t, arm, 0.6)
    out.push({
      x: p.x,
      y: p.y * 0.5,
      z: p.z,
      r: 150 + rand() * 240,
      a: 0.018 + rand() * 0.03,
      warm: t < 0.35,
    })
  }
  return out
}

export const GALAXY_RADIUS = R_MAX
