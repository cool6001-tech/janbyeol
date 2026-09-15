/**
 * 공감의 그물
 * ---------------------------------------------------------------
 * 잔별 하나를 누르면 거기서 닿는 다른 사람의 잔별로, 또 그 잔별이 닿는
 * 다음 잔별로 — 별빛이 번져나가는 구조를 만듭니다.
 *
 * 규칙 하나: 같은 성단 안(= 같은 사람)은 잇지 않습니다.
 * 내 글끼리 이어지면 그건 공감이 아니라 그냥 내 기록이니까요.
 */

import { affinityOf } from './affinity.js'

/**
 * 한 사람의 이야기 줄기.
 * 같은 성단 안(= 같은 사람)의 잔별을 띄운 순서대로 이어 붙입니다.
 * 태그가 아니라 시간으로 잇는 이유는, 이건 공감이 아니라 한 사람이 지나온
 * 길이기 때문입니다. 성단을 가로지르는 한 줄기 실이 됩니다.
 */
export function buildOwnThreads(stars) {
  const byAuthor = new Map()
  for (const star of stars) {
    if (!byAuthor.has(star.authorId)) byAuthor.set(star.authorId, [])
    byAuthor.get(star.authorId).push(star)
  }

  const edges = []
  for (const [authorId, list] of byAuthor) {
    if (list.length < 2) continue
    list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    for (let i = 1; i < list.length; i++) {
      edges.push({ a: list[i - 1].id, b: list[i].id, authorId, kind: 'own' })
    }
  }
  return edges
}

/**
 * 잔별들 사이의 이웃 관계.
 *
 * 무엇으로 잇는가가 이 서비스의 전부입니다. 예전에는 "겹치는 태그 개수"였어요.
 * 지금은 소재와 감정을 함께 본 0~10점입니다 (`affinity.js`).
 *
 * 점수가 높은 짝부터 차례로 이어 붙이되, 한 잔별이 너무 많은 선을 갖지 않게
 * 제한합니다. 그래서 **가장 닮은 사람이 바로 옆에 오고, 덜 닮은 사람은
 * 자연히 한 단계 건너에 놓입니다.** 문턱을 넘지 못한 짝은 아예 잇지 않아요 —
 * 아무 상관 없는 글끼리 이어지면 그물이 의미를 잃습니다.
 */
const MIN_SCORE = 3

export function buildGraph(stars, maxDegree = 3, minScore = MIN_SCORE) {
  const pairs = []
  for (let i = 0; i < stars.length; i++) {
    for (let j = i + 1; j < stars.length; j++) {
      // 같은 성단 안(= 같은 사람)은 잇지 않습니다. 그건 공감이 아니니까요.
      if (stars[i].authorId === stars[j].authorId) continue
      const w = affinityOf(stars[i], stars[j])
      if (w < minScore) continue
      pairs.push({ a: stars[i].id, b: stars[j].id, w })
    }
  }
  pairs.sort((x, y) => y.w - x.w)

  const adj = new Map()
  const edges = []
  const weights = new Map() // "a|b" → 점수
  const degreeOf = (id) => (adj.get(id) ? adj.get(id).length : 0)

  for (const pair of pairs) {
    if (degreeOf(pair.a) >= maxDegree || degreeOf(pair.b) >= maxDegree) continue
    if (!adj.has(pair.a)) adj.set(pair.a, [])
    if (!adj.has(pair.b)) adj.set(pair.b, [])
    adj.get(pair.a).push(pair.b)
    adj.get(pair.b).push(pair.a)
    edges.push(pair)
    weights.set(keyOf(pair.a, pair.b), pair.w)
  }

  /* 아무와도 이어지지 않은 잔별은 남기지 않습니다.
     문턱을 못 넘었더라도 가장 닮은 한 사람과는 잇습니다 —
     그물에서 끊긴 별은 누구에게도 발견될 수 없으니까요. */
  for (const star of stars) {
    if (degreeOf(star.id) > 0) continue
    let best = null
    for (const other of stars) {
      if (other.id === star.id || other.authorId === star.authorId) continue
      const w = affinityOf(star, other)
      if (!best || w > best.w) best = { id: other.id, w }
    }
    if (!best) continue
    if (!adj.has(star.id)) adj.set(star.id, [])
    if (!adj.has(best.id)) adj.set(best.id, [])
    adj.get(star.id).push(best.id)
    adj.get(best.id).push(star.id)
    edges.push({ a: star.id, b: best.id, w: best.w, lonely: true })
    weights.set(keyOf(star.id, best.id), best.w)
  }

  return { adj, edges, weights, scoreOf: (a, b) => weights.get(keyOf(a, b)) ?? 0 }
}

function keyOf(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/**
 * 한 잔별에서 별빛이 번져나가는 경로.
 * 1겹은 바로 닿는 잔별, 2겹은 그 잔별이 닿는 잔별… 겹마다 따로 담습니다.
 * 화면에서는 이 겹이 순서대로 하나씩 켜집니다.
 */
export function traceFrom(adj, rootId, maxDepth = 3) {
  const depthOf = new Map([[rootId, 0]])
  const edges = []
  let frontier = [rootId]

  for (let depth = 1; depth <= maxDepth; depth++) {
    const next = []
    for (const id of frontier) {
      for (const neighbor of adj.get(id) || []) {
        if (depthOf.has(neighbor)) continue
        depthOf.set(neighbor, depth)
        edges.push({ a: id, b: neighbor, depth })
        next.push(neighbor)
      }
    }
    frontier = next
    if (frontier.length === 0) break
  }

  return { rootId, depthOf, edges, maxDepth }
}

/** 이 잔별이 몇 개의 잔별, 몇 사람에게 닿아 있는지 */
export function reachOf(trace, stars) {
  if (!trace) return null
  const byId = new Map(stars.map((s) => [s.id, s]))
  const people = new Set()
  let count = 0
  for (const [id, depth] of trace.depthOf) {
    if (depth === 0) continue
    count++
    const star = byId.get(id)
    if (star) people.add(star.authorId)
  }
  return { count, people: people.size, depth: Math.max(0, ...trace.edges.map((e) => e.depth)) }
}
