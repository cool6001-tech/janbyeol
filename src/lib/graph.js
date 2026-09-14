/**
 * 공감의 그물
 * ---------------------------------------------------------------
 * 잔별 하나를 누르면 거기서 닿는 다른 사람의 잔별로, 또 그 잔별이 닿는
 * 다음 잔별로 — 별빛이 번져나가는 구조를 만듭니다.
 *
 * 규칙 하나: 같은 성단 안(= 같은 사람)은 잇지 않습니다.
 * 내 글끼리 이어지면 그건 공감이 아니라 그냥 내 기록이니까요.
 */

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
 * 겹치는 태그가 많은 짝부터 차례로 이어 붙이되, 한 잔별이 너무 많은 선을
 * 갖지 않게 제한합니다. 그래야 그물이 촘촘하지 않고 길게 뻗습니다.
 */
export function buildGraph(stars, maxDegree = 3) {
  const pairs = []
  for (let i = 0; i < stars.length; i++) {
    for (let j = i + 1; j < stars.length; j++) {
      if (stars[i].authorId === stars[j].authorId) continue
      const shared = stars[i].tags.filter((t) => stars[j].tags.includes(t))
      if (shared.length === 0) continue
      pairs.push({ a: stars[i].id, b: stars[j].id, w: shared.length, tags: shared })
    }
  }
  pairs.sort((x, y) => y.w - x.w)

  const adj = new Map()
  const edges = []
  const degreeOf = (id) => (adj.get(id) ? adj.get(id).length : 0)

  for (const pair of pairs) {
    if (degreeOf(pair.a) >= maxDegree || degreeOf(pair.b) >= maxDegree) continue
    if (!adj.has(pair.a)) adj.set(pair.a, [])
    if (!adj.has(pair.b)) adj.set(pair.b, [])
    adj.get(pair.a).push(pair.b)
    adj.get(pair.b).push(pair.a)
    edges.push(pair)
  }

  return { adj, edges }
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
