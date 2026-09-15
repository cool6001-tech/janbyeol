import { useEffect, useMemo, useRef } from 'react'
import { project, orbitSlot, FOCAL } from '../lib/geometry.js'
import { buildAmbient, buildClouds, clusterSiteFor, CLUSTER_R } from '../lib/galaxy.js'
import { ageFade, isAnniversary } from '../lib/time.js'
import { hasPhoto } from '../lib/photo.js'

/** 배경 잔별 수. 개별로는 보이지 않고 뭉쳐서 빛의 면이 됩니다. */
const AMBIENT_COUNT = 20000
/** 밝기를 몇 단계로 뭉쳐 그릴지 — 색을 바꾸는 횟수를 줄이는 최적화 */
const LEVELS = 7
/** 별빛이 한 겹 건너가는 데 걸리는 시간 */
const REVEAL_STEP = 620

/**
 * 3D 공용 은하
 * ---------------------------------------------------------------
 * 캔버스에 직접 투영해서 그립니다. 별의 밝기·온도·오라를 한 픽셀 단위로
 * 제어해야 해서 그래프 라이브러리 대신 직접 그리는 쪽을 택했습니다.
 *
 * React와의 역할 분담:
 *   - 무엇이 있는가(별 목록·연결·선택)는 React가 props로 준다
 *   - 매 프레임 어떻게 움직이는가는 이 안의 ref가 들고 있는다
 *   렌더 루프가 props를 ref로 읽기 때문에 상태가 바뀌어도 루프는 끊기지 않습니다.
 */
export default function Galaxy({
  stars,
  links,
  selectedId,
  gather,
  focus,
  ripple,
  trace,
  myId,
  mineMode,
  onSelect,
  reducedMotion,
  cardAnchorRef,
  cardOpen,
  anchored,
  bottomInset,
  topInset = 0,
}) {
  const canvasRef = useRef(null)
  const propsRef = useRef(null)
  const sceneRef = useRef({
    cam: {
      yaw: 0.4, pitch: 0.92, dist: 3400,
      tYaw: 0.4, tPitch: 0.92, tDist: 3400,
      tx: 0, ty: 0, tz: 0, ttx: 0, tty: 0, ttz: 0,
      ox: 0, oy: 0, // 아래를 시트가 가리면 하늘의 중심을 위로 올린다
      focal: FOCAL,
    },
    runtime: new Map(),
    ambient: null,
    clouds: null,
    buckets: null,
    ambientDim: 1, // 나의 성단 시점에서 은하 전체가 물러나는 정도
    ripples: [],
    idleSpin: true,
    idleTimer: 0,
  })

  /** 어느 별이 어느 궤도의 몇 번째 자리로 끌려오는가 */
  const gatherSlots = useMemo(() => {
    const map = new Map()
    if (!gather?.anchorId) return map
    const { ring1 = [], ring2 = [], r1 = 230, r2 = 430 } = gather
    ring1.forEach((id, i) => map.set(id, { r: r1, i, n: ring1.length, seed: 0.45 }))
    ring2.forEach((id, i) => map.set(id, { r: r2, i, n: ring2.length, seed: 1.25 }))
    return map
  }, [gather])

  propsRef.current = {
    stars,
    links,
    selectedId,
    gather,
    gatherSlots,
    trace,
    myId,
    mineMode,
    onSelect,
    reducedMotion,
    cardAnchorRef,
    cardOpen,
    anchored,
    bottomInset,
    topInset,
  }

  /* 은하는 한 번만 만든다 (같은 씨앗 → 언제나 같은 하늘) */
  if (!sceneRef.current.ambient) {
    sceneRef.current.ambient = buildAmbient(AMBIENT_COUNT)
    sceneRef.current.clouds = buildClouds(60)
    // 3종류(팔·핵·헤일로) × 밝기 단계만큼의 그릇을 미리 만들어 둔다
    sceneRef.current.buckets = Array.from({ length: 3 * LEVELS }, () => [])
  }

  /* 카메라 이동 요청 */
  useEffect(() => {
    if (!focus) return
    const scene = sceneRef.current
    const target = focus.pos || { x: 0, y: 0, z: 0 }
    scene.cam.ttx = target.x
    scene.cam.tty = target.y
    scene.cam.ttz = target.z
    if (focus.dist) scene.cam.tDist = focus.dist
    if (typeof focus.pitch === 'number') scene.cam.tPitch = focus.pitch
    scene.idleSpin = false
    scene.idleTimer = performance.now() + (focus.hold || 4000)
  }, [focus])

  /* 별빛이 번져나가기 시작하는 시각 — 누른 잔별이 바뀔 때마다 처음부터 */
  useEffect(() => {
    sceneRef.current.traceStart = performance.now()
  }, [trace?.rootId])

  /* 온기 파문 — {id, key}가 바뀔 때마다 한 번 번진다 */
  useEffect(() => {
    if (!ripple?.id) return
    sceneRef.current.ripples.push({ id: ripple.id, born: performance.now() })
  }, [ripple])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const scene = sceneRef.current
    let raf = 0
    let width = 0
    let height = 0
    const t0 = performance.now()

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    /* 별마다 살아 있는 값 (저장되지 않는 것들) */
    const runtimeOf = (star) => {
      let rt = scene.runtime.get(star.id)
      if (!rt) {
        rt = {
          phase: Math.random() * 6.283,
          speed: 0.6 + Math.random() * 0.9,
          hue: (Math.random() - 0.5) * 26,
          size: 1.2 + Math.random() * 1.0,
          warm: 0,
          dim: 1, // 나의 성단 시점에서 남의 잔별이 저무는 정도

          x: star.pos.x,
          y: star.pos.y,
          z: star.pos.z,
          born: performance.now(),
        }
        scene.runtime.set(star.id, rt)
      }
      return rt
    }

    const warmTarget = (star, iWarmed) => {
      const base = Math.min(1, (star.warmth || 0) / 14)
      const fromReplies = Math.min(0.3, (star.replies?.length || 0) * 0.07)
      return Math.min(1, base + fromReplies + (iWarmed ? 0.35 : 0))
    }

    /**
     * 별빛의 온도
     * 차가운 별빛 → 따뜻한 호박빛으로 색을 직접 섞습니다.
     * (색상환을 따라 돌리면 중간에 초록을 지나갑니다. 온기가 초록일 리는 없죠.)
     */
    const COOL = [168, 198, 255]
    const WARM = [255, 176, 103]
    const channel = (v) => Math.max(0, Math.min(255, Math.round(v)))

    const starColor = (rt, bright) => {
      const w = rt.warm
      const k = 0.45 + 0.55 * Math.min(1.25, bright)
      const r = (COOL[0] + (WARM[0] - COOL[0]) * w) * k - rt.hue * 0.6
      const g = (COOL[1] + (WARM[1] - COOL[1]) * w) * k
      const b = (COOL[2] + (WARM[2] - COOL[2]) * w) * k + rt.hue * 0.6
      return `rgb(${channel(r)},${channel(g)},${channel(b)})`
    }

    const linkColor = (warm, alpha) => {
      const r = COOL[0] + (WARM[0] - COOL[0]) * warm
      const g = COOL[1] + (WARM[1] - COOL[1]) * warm
      const b = COOL[2] + (WARM[2] - COOL[2]) * warm
      return `rgba(${channel(r)},${channel(g)},${channel(b)},${alpha.toFixed(3)})`
    }

    const frame = (now) => {
      const p = propsRef.current
      const t = (now - t0) / 1000
      const cam = scene.cam
      const reduced = p.reducedMotion

      if (scene.idleTimer && now > scene.idleTimer) {
        scene.idleSpin = true
        scene.idleTimer = 0
      }
      if (scene.idleSpin && !reduced) cam.tYaw += 0.00042

      cam.yaw += (cam.tYaw - cam.yaw) * 0.06
      cam.pitch += (cam.tPitch - cam.pitch) * 0.06
      cam.dist += (cam.tDist - cam.dist) * 0.055
      cam.tx += (cam.ttx - cam.tx) * 0.05
      cam.ty += (cam.tty - cam.ty) * 0.05
      cam.tz += (cam.ttz - cam.tz) * 0.05

      // 위아래 UI가 가린 만큼 하늘의 중심을 옮긴다 — 남은 띠의 한가운데로.
      // 좁은 화면에서 별이 시트 뒤에 숨지 않게 하는 건 이 두 줄입니다.
      const oyTarget = ((p.topInset || 0) - (p.bottomInset || 0)) / 2
      cam.oy += (oyTarget - cam.oy) * 0.08

      ctx.clearRect(0, 0, width, height)
      ctx.globalCompositeOperation = 'lighter'

      // 나의 성단 시점에서는 은하 전체가 한 걸음 물러난다.
      // 완전히 끄지는 않습니다 — 내 잔별이 은하 어디쯤에 있는지는 보여야 하니까요.
      const traced = p.trace ? p.trace.depthOf : null
      const traceElapsed = now - (scene.traceStart || now)
      const ambientTarget = traced ? 0.4 : p.mineMode ? 0.45 : 1
      scene.ambientDim += (ambientTarget - scene.ambientDim) * 0.06
      const aDim = scene.ambientDim

      // 중심 핵의 빛무리 — 수많은 별이 뭉쳐 하나의 덩어리로 보이는 부분
      const core = project({ x: 0, y: 0, z: 0 }, cam, width, height)
      if (core) {
        const rad = Math.max(40, 520 * core.k)
        const cg = ctx.createRadialGradient(core.sx, core.sy, 0, core.sx, core.sy, rad)
        cg.addColorStop(0, `rgba(255,246,226,${0.44 * aDim})`)
        cg.addColorStop(0.18, `rgba(255,228,182,${0.13 * aDim})`)
        cg.addColorStop(0.55, `rgba(196,178,190,${0.035 * aDim})`)
        cg.addColorStop(1, 'rgba(120,130,190,0)')
        ctx.fillStyle = cg
        ctx.beginPath()
        ctx.arc(core.sx, core.sy, rad, 0, 6.283)
        ctx.fill()
      }

      // 팔을 따라 깔린 성운
      for (const c of scene.clouds) {
        const pr = project(c, cam, width, height)
        if (!pr) continue
        const rad = c.r * pr.k
        if (rad < 3) continue
        if (pr.sx < -rad || pr.sx > width + rad || pr.sy < -rad || pr.sy > height + rad) continue
        const g2 = ctx.createRadialGradient(pr.sx, pr.sy, 0, pr.sx, pr.sy, rad)
        const ca = c.a * aDim
        g2.addColorStop(0, c.warm ? `rgba(240,214,180,${ca})` : `rgba(176,198,246,${ca})`)
        g2.addColorStop(1, 'rgba(90,110,170,0)')
        ctx.fillStyle = g2
        ctx.beginPath()
        ctx.arc(pr.sx, pr.sy, rad, 0, 6.283)
        ctx.fill()
      }

      // 배경 잔별 — 밝기 단계별로 묶어서 한 번에 그린다.
      // 점 하나마다 객체를 만들면 2만 개 × 60프레임이라 투영을 여기서 직접 계산합니다.
      const buckets = scene.buckets
      for (let i = 0; i < buckets.length; i++) buckets[i].length = 0

      const cy = Math.cos(cam.yaw)
      const sy = Math.sin(cam.yaw)
      const cp = Math.cos(cam.pitch)
      const sp = Math.sin(cam.pitch)
      const halfW = width / 2 + cam.ox
      const halfH = height / 2 + cam.oy

      for (let i = 0; i < scene.ambient.length; i++) {
        const a = scene.ambient[i]
        const dx = a.x - cam.tx
        const dy = a.y - cam.ty
        const dz = a.z - cam.tz
        const x1 = dx * cy - dz * sy
        const z1 = dx * sy + dz * cy
        const y2 = dy * cp - z1 * sp
        const z2 = dy * sp + z1 * cp + cam.dist
        if (z2 < 60) continue
        const k = cam.focal / z2
        const sx = halfW + x1 * k
        if (sx < 0 || sx > width) continue
        const sYy = halfH - y2 * k
        if (sYy < 0 || sYy > height) continue
        const alpha = a.a * (k * 2.6 > 1.15 ? 1.15 : k * 2.6)
        if (alpha < 0.04) continue
        const level = alpha * LEVELS >= LEVELS ? LEVELS - 1 : (alpha * LEVELS) | 0
        const bucket = buckets[a.kind * LEVELS + level]
        bucket.push(sx, sYy)
      }

      const TINT = ['184,202,244', '255,236,206', '196,206,236'] // 팔 · 핵 · 헤일로
      for (let kind = 0; kind < 3; kind++) {
        for (let level = 0; level < LEVELS; level++) {
          const bucket = buckets[kind * LEVELS + level]
          if (bucket.length === 0) continue
          ctx.fillStyle = `rgba(${TINT[kind]},${(((level + 0.75) / LEVELS) * 0.9 * aDim).toFixed(3)})`
          for (let i = 0; i < bucket.length; i += 2) {
            ctx.fillRect(bucket[i], bucket[i + 1], 1, 1)
          }
        }
      }

      /* 별의 현재 위치를 먼저 정리한다.
         고른 잔별이 있으면, 닿아 있는 잔별들이 그 별 곁의 궤도로 끌려옵니다.
         저장된 좌표(star.pos)는 그대로예요 — 화면 위에서만 잠시 모이는 겁니다. */
      const byId = new Map()
      const slots = p.gatherSlots
      const anchor = p.gather?.anchorId
        ? p.stars.find((s) => s.id === p.gather.anchorId)
        : null
      const anchorPos = anchor ? anchor.pos : null

      for (const star of p.stars) {
        const rt = runtimeOf(star)
        let target = star.pos
        const slot = anchorPos && star.id !== anchor.id ? slots.get(star.id) : null
        if (slot) target = orbitSlot(anchorPos, slot.i, slot.n, slot.r, slot.seed)
        const ease = slot ? 0.055 : 0.035
        rt.x += (target.x - rt.x) * ease
        rt.y += (target.y - rt.y) * ease
        rt.z += (target.z - rt.z) * ease

        // 어떤 잔별이 밝고 어떤 잔별이 저무는가
        let dimTarget = 1
        if (traced) {
          // 별빛이 번져나가는 중 — 아직 닿지 않은 겹은 어둡게 기다린다.
          // 겹이 깊어질수록 더 저물게 해서, 고른 별과 그 곁이 먼저 읽히도록.
          const depth = traced.get(star.id)
          const arrived = depth !== undefined && traceElapsed >= (depth - 1) * REVEAL_STEP
          dimTarget = arrived ? Math.max(0.24, 1 - 0.19 * depth) : 0.08
        } else if (p.mineMode && star.authorId !== p.myId) {
          dimTarget = 0.12
        }
        rt.dim += (dimTarget - rt.dim) * 0.06

        const pr = project(rt, cam, width, height)
        byId.set(star.id, { star, rt, pr })
      }

      /* 연결선 두 겹.
         뒤 — 공감의 그물: 다른 사람의 잔별에 닿는 선. 늘 희미하게 깔려 있다.
         앞 — 이야기의 줄기: 같은 사람의 잔별을 시간 순으로 이은 실. 내 것은 또렷하게. */
      for (const link of p.links) {
        const A = byId.get(link.a)
        const B = byId.get(link.b)
        if (!A?.pr || !B?.pr) continue
        const isOwn = link.kind === 'own'
        const isMineThread = isOwn && link.authorId === p.myId
        const warmAvg = (A.rt.warm + B.rt.warm) / 2

        let alpha = isOwn
          ? (isMineThread ? 0.3 : 0.06) + warmAvg * 0.2
          : 0.05 + 0.05 * Math.min(1, (link.w || 1) / 2) + warmAvg * 0.08
        if (link.cluster) alpha += 0.14
        if (!traced && (p.selectedId === link.a || p.selectedId === link.b)) alpha += 0.14
        alpha *= Math.min(A.rt.dim, B.rt.dim)
        // 별빛이 번져나가는 중에는 기존 선이 배경으로 물러난다
        if (traced) alpha *= isOwn ? 0.7 : 0.4
        if (alpha < 0.004) continue

        const grd = ctx.createLinearGradient(A.pr.sx, A.pr.sy, B.pr.sx, B.pr.sy)
        grd.addColorStop(0, linkColor(isMineThread ? Math.max(0.5, A.rt.warm) : A.rt.warm, alpha))
        grd.addColorStop(1, linkColor(isMineThread ? Math.max(0.5, B.rt.warm) : B.rt.warm, alpha))
        ctx.strokeStyle = grd
        ctx.lineWidth = isMineThread ? 1.1 : 0.8
        ctx.beginPath()
        ctx.moveTo(A.pr.sx, A.pr.sy)
        ctx.lineTo(B.pr.sx, B.pr.sy)
        ctx.stroke()
      }

      /* 번져나가는 별빛.
         누른 잔별에서 1겹, 2겹, 3겹으로 차례차례 뻗어나갑니다.
         선 끝에는 빛이 실제로 건너가는 게 보이도록 작은 점이 달려 있습니다. */
      if (traced && p.trace.edges.length) {
        for (const e of p.trace.edges) {
          const A = byId.get(e.a)
          const B = byId.get(e.b)
          if (!A?.pr || !B?.pr) continue
          const started = traceElapsed - (e.depth - 1) * REVEAL_STEP
          if (started <= 0) continue
          const prog = Math.min(1, started / 760)
          const hx = A.pr.sx + (B.pr.sx - A.pr.sx) * prog
          const hy = A.pr.sy + (B.pr.sy - A.pr.sy) * prog

          // 겹이 깊어질수록 따뜻한 빛에서 먼 별빛 쪽으로
          const mix = Math.min(1, (e.depth - 1) / 2)
          const alpha = (0.52 - 0.14 * (e.depth - 1)) * (reduced ? 1 : 0.85 + 0.15 * Math.sin(t * 2))
          ctx.strokeStyle = linkColor(1 - mix, alpha)
          ctx.lineWidth = 1.2 - 0.2 * (e.depth - 1)
          ctx.beginPath()
          ctx.moveTo(A.pr.sx, A.pr.sy)
          ctx.lineTo(hx, hy)
          ctx.stroke()

          if (prog < 1) {
            ctx.fillStyle = linkColor(1 - mix, 0.9)
            ctx.beginPath()
            ctx.arc(hx, hy, 1.8, 0, 6.283)
            ctx.fill()
          }
        }
      }

      // 성단의 빛무리 — 한 사람의 기록이 모여 있는 자리
      if (!scene.sites) scene.sites = new Map()
      for (const star of p.stars) {
        if (!scene.sites.has(star.authorId)) {
          scene.sites.set(star.authorId, clusterSiteFor(star.authorId))
        }
      }
      for (const [authorId, site] of scene.sites) {
        const pr = project(site, cam, width, height)
        if (!pr) continue
        const rad = CLUSTER_R * 2.4 * pr.k
        if (rad < 4) continue
        if (pr.sx < -rad || pr.sx > width + rad || pr.sy < -rad || pr.sy > height + rad) continue
        const isMine = authorId === p.myId
        const alpha = (isMine ? 0.12 : 0.06) * (p.mineMode && !isMine ? 0.25 : 1)
        const cgr = ctx.createRadialGradient(pr.sx, pr.sy, 0, pr.sx, pr.sy, rad)
        cgr.addColorStop(0, isMine ? `rgba(255,206,158,${alpha})` : `rgba(178,200,246,${alpha})`)
        cgr.addColorStop(0.5, isMine ? `rgba(226,180,150,${alpha * 0.35})` : `rgba(150,175,230,${alpha * 0.35})`)
        cgr.addColorStop(1, 'rgba(90,110,170,0)')
        ctx.fillStyle = cgr
        ctx.beginPath()
        ctx.arc(pr.sx, pr.sy, rad, 0, 6.283)
        ctx.fill()
      }

      // 별 — 먼 것부터
      const visible = [...byId.values()].filter((v) => v.pr).sort((a, b) => b.pr.z - a.pr.z)

      for (const { star, rt, pr } of visible) {
        const iWarmed = (star.warmedBy || []).includes(p.myId)
        rt.warm += (warmTarget(star, iWarmed) - rt.warm) * 0.07

        const born = Math.min(1, (now - rt.born) / 900)
        const fade = ageFade(star.createdAt) // 흐려지는 별
        const anniversary = isAnniversary(star.createdAt)
        const twinkle = reduced ? 0.92 : 0.72 + 0.28 * Math.sin(t * rt.speed + rt.phase)
        const photoTwinkle = hasPhoto(star)
          ? reduced
            ? 1.06
            : 1 + 0.22 * Math.sin(t * 2.1 + rt.phase * 1.7)
          : 1
        const selected = star.id === p.selectedId

        const bright =
          twinkle * photoTwinkle * born * fade * rt.dim * (0.78 + 0.34 * rt.warm) *
          (selected ? 1.3 : 1) * (anniversary ? 1.25 : 1)

        /* 크기의 상한.
           모든 별을 4.4px로 눌러두면 아무리 다가가도 별이 커지지 않습니다.
           고른 별과 곁으로 끌려온 별에만 상한을 풀어, 줌인이 눈에 보이게 합니다. */
        const inOrbit = slots.has(star.id)
        const cap = selected ? 11 : inOrbit ? 7 : 4.4

        let rad = rt.size * Math.max(0.4, pr.k * 22) * (0.92 + 0.4 * rt.warm) * born
        rad *= selected ? 1.45 : 1
        rad *= 0.6 + 0.4 * fade
        rad *= 0.55 + 0.45 * rt.dim
        rad = Math.max(0.9, Math.min(rad, cap))

        // 헤일로
        const halo = rad * (hasPhoto(star) ? 11 : 8) * (0.8 + 0.5 * rt.warm)
        const mix = rt.warm
        const g = ctx.createRadialGradient(pr.sx, pr.sy, 0, pr.sx, pr.sy, halo)
        g.addColorStop(0, `rgba(${Math.round(180 + 70 * mix)},${Math.round(200 - 40 * mix)},${Math.round(255 - 110 * mix)},${(0.34 * bright).toFixed(3)})`)
        g.addColorStop(0.35, `rgba(${Math.round(120 + 110 * mix)},${Math.round(150 - 20 * mix)},${Math.round(240 - 90 * mix)},${(0.1 * bright).toFixed(3)})`)
        g.addColorStop(1, 'rgba(60,80,160,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(pr.sx, pr.sy, halo, 0, 6.283)
        ctx.fill()

        // 사진을 품은 잔별 — 우주 뷰에서 이미지는 보이지 않고 오라만 다르다
        if (hasPhoto(star)) {
          const ring = rad * 3 + 3 + (reduced ? 0 : Math.sin(t * 1.3 + rt.phase) * 1.4)
          ctx.strokeStyle = `rgba(${Math.round(170 + 60 * mix)},200,255,${(0.16 * bright).toFixed(3)})`
          ctx.lineWidth = 0.9
          ctx.beginPath()
          ctx.arc(pr.sx, pr.sy, ring, 0, 6.283)
          ctx.stroke()

          const spike = rad * 5.2 * bright
          ctx.strokeStyle = `rgba(215,228,255,${(0.16 * bright).toFixed(3)})`
          ctx.beginPath()
          ctx.moveTo(pr.sx - spike, pr.sy)
          ctx.lineTo(pr.sx + spike, pr.sy)
          ctx.moveTo(pr.sx, pr.sy - spike)
          ctx.lineTo(pr.sx, pr.sy + spike)
          ctx.stroke()
        }

        // 핵
        ctx.fillStyle = starColor(rt, Math.min(1.15, bright))
        ctx.beginPath()
        ctx.arc(pr.sx, pr.sy, rad, 0, 6.283)
        ctx.fill()

        // 작년 오늘의 별 — 느리게 숨 쉬는 고리
        if (anniversary) {
          const breathe = (reduced ? 0.3 : 0.22 + 0.18 * Math.sin(t * 0.9 + rt.phase)) * rt.dim
          ctx.strokeStyle = `rgba(255,198,140,${breathe.toFixed(3)})`
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.arc(pr.sx, pr.sy, rad + 11 + (reduced ? 0 : Math.sin(t * 0.9) * 2), 0, 6.283)
          ctx.stroke()
        }

        if (selected) {
          // 지금 보고 있는 잔별 — 또렷한 고리 하나와 숨 쉬는 고리 하나
          ctx.strokeStyle = `rgba(255,214,170,${(0.62 + 0.18 * Math.sin(t * 3)).toFixed(3)})`
          ctx.lineWidth = 1.4
          ctx.beginPath()
          ctx.arc(pr.sx, pr.sy, rad + 10, 0, 6.283)
          ctx.stroke()

          const pulse = reduced ? 0 : (t * 0.55) % 1
          ctx.strokeStyle = `rgba(255,196,140,${(0.3 * (1 - pulse)).toFixed(3)})`
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.arc(pr.sx, pr.sy, rad + 12 + pulse * 34, 0, 6.283)
          ctx.stroke()
        }
        if (star.authorId === p.myId) {
          ctx.strokeStyle = `rgba(255,190,130,${p.mineMode ? 0.34 : 0.2})`
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.arc(pr.sx, pr.sy, rad + 16, 0, 6.283)
          ctx.stroke()
        }
      }

      /* 카드는 고른 별 옆에 떠 있습니다.
         React가 매 프레임 다시 그리면 입력창이 버벅이므로, 좌표만 여기서
         DOM에 직접 써넣습니다. 그리고 별과 카드를 얇은 꼬리선으로 잇습니다. */
      const wrap = p.cardAnchorRef?.current
      const anchorView = p.cardOpen && p.selectedId ? byId.get(p.selectedId) : null
      if (wrap && p.anchored && anchorView?.pr) {
        const cardEl = wrap.firstElementChild
        if (cardEl) {
          if (now - (scene.cardMeasured || 0) > 240) {
            scene.cardW = cardEl.offsetWidth || 340
            scene.cardH = cardEl.offsetHeight || 320
            scene.cardMeasured = now
          }
          const cw = scene.cardW || 340
          const ch = scene.cardH || 320
          const GAP = 46
          const toRight = anchorView.pr.sx + GAP + cw <= width - 16
          const x = toRight
            ? Math.min(width - cw - 16, anchorView.pr.sx + GAP)
            : Math.max(16, anchorView.pr.sx - GAP - cw)
          const y = Math.max(72, Math.min(height - ch - 20, anchorView.pr.sy - ch / 2))
          wrap.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`

          const ex = toRight ? x : x + cw
          const ey = Math.max(y + 20, Math.min(y + ch - 20, anchorView.pr.sy))
          ctx.strokeStyle = 'rgba(255,206,158,0.3)'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(anchorView.pr.sx, anchorView.pr.sy)
          ctx.lineTo(ex, ey)
          ctx.stroke()
        }
      }

      // 온기 파문
      for (let i = scene.ripples.length - 1; i >= 0; i--) {
        const r = scene.ripples[i]
        const life = (now - r.born) / 1100
        const v = byId.get(r.id)
        if (life >= 1 || !v?.pr) {
          scene.ripples.splice(i, 1)
          continue
        }
        ctx.strokeStyle = `rgba(255,176,103,${((1 - life) * 0.4).toFixed(3)})`
        ctx.lineWidth = 1.4 * (1 - life)
        ctx.beginPath()
        ctx.arc(v.pr.sx, v.pr.sy, 10 + life * 90, 0, 6.283)
        ctx.stroke()
      }

      ctx.globalCompositeOperation = 'source-over'
      scene.lastProjected = byId
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    /* ----- 조작 -----
       손가락 하나면 돌리고, 둘이면 벌려서 다가갑니다.
       예전에는 휠 이벤트만 있어서 휴대폰에서는 확대·축소가 아예 안 됐습니다. */
    const pointers = new Map()
    const clampDist = (v) => Math.max(260, Math.min(9000, v))
    let drag = null
    let moved = 0
    let pinch = null

    const coarse = window.matchMedia?.('(pointer: coarse)').matches
    const PICK_R = coarse ? 42 : 28

    const onDown = (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      scene.idleSpin = false
      try {
        canvas.setPointerCapture(e.pointerId)
      } catch {
        /* 이미 놓인 포인터 — 무시 */
      }
      if (pointers.size === 1) {
        drag = { x: e.clientX, y: e.clientY }
        moved = 0
        canvas.classList.add('dragging')
      } else if (pointers.size === 2) {
        drag = null
        const [a, b] = [...pointers.values()]
        pinch = { span: Math.max(12, Math.hypot(a.x - b.x, a.y - b.y)), dist: scene.cam.tDist }
      }
    }

    const onMove = (e) => {
      if (!pointers.has(e.pointerId)) return
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

      if (pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()]
        const span = Math.hypot(a.x - b.x, a.y - b.y)
        if (span > 12) {
          scene.cam.tDist = clampDist(pinch.dist * (pinch.span / span))
          scene.idleTimer = performance.now() + 2600
        }
        moved = 999 // 핀치는 탭이 아니다
        return
      }

      if (!drag) return
      const dx = e.clientX - drag.x
      const dy = e.clientY - drag.y
      moved += Math.abs(dx) + Math.abs(dy)
      scene.cam.tYaw -= dx * 0.0042
      scene.cam.tPitch = Math.max(-1.1, Math.min(1.1, scene.cam.tPitch + dy * 0.0034))
      drag.x = e.clientX
      drag.y = e.clientY
    }

    const release = (e, tapped) => {
      const had = pointers.delete(e.pointerId)
      if (pointers.size < 2) pinch = null
      if (pointers.size === 0) {
        canvas.classList.remove('dragging')
        if (tapped && had && drag && moved < 8) pick(e.clientX, e.clientY)
        drag = null
        scene.idleTimer = performance.now() + 2600
      } else if (pointers.size === 1) {
        // 핀치에서 손가락 하나가 떨어진 뒤 — 남은 손가락으로 이어서 돌린다
        const [only] = [...pointers.values()]
        drag = { x: only.x, y: only.y }
        moved = 999
      }
    }

    const onUp = (e) => release(e, true)
    const onCancel = (e) => release(e, false)

    const onWheel = (e) => {
      e.preventDefault()
      scene.idleSpin = false
      scene.cam.tDist = clampDist(scene.cam.tDist * (1 + (e.deltaY > 0 ? 0.12 : -0.12)))
      scene.idleTimer = performance.now() + 2600
    }

    const pick = (cx, cy) => {
      const rect = canvas.getBoundingClientRect()
      const x = cx - rect.left
      const y = cy - rect.top
      let best = null
      let bestDist = PICK_R
      for (const v of scene.lastProjected?.values() || []) {
        if (!v.pr) continue
        const d = Math.hypot(v.pr.sx - x, v.pr.sy - y)
        if (d < bestDist) {
          bestDist = d
          best = v.star
        }
      }
      propsRef.current.onSelect(best ? best.id : null)
    }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onCancel)
    canvas.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onCancel)
      canvas.removeEventListener('wheel', onWheel)
    }
  }, [])

  return <canvas ref={canvasRef} className="sky" aria-label="잔별들이 떠 있는 3D 은하" />
}
