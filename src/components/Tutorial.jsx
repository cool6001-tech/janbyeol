import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { EMOTION_COLORS, EMOTION_ORDER, cssColor } from '../lib/emotionColor.js'

/**
 * 처음 온 사람을 위한 안내
 * ---------------------------------------------------------------
 * 설명서처럼 읽히면 이 서비스의 결과 어긋납니다. 그래서 규칙 셋만 지킵니다.
 *
 *  1. 말은 짧게, 한 장면에 하나만.
 *  2. 가짜 화면을 따로 만들지 않고 **실제 하늘과 실제 버튼**을 보여줍니다.
 *     장면이 바뀔 때마다 App이 카메라를 옮기고(onStep), 버튼은 빛으로 짚어요.
 *  3. 세계관 용어(온기, 별빛, 성단)는 쓰되, 처음 듣는 사람도 알 수 있게
 *     그림 옆에 평범한 말로 한 번씩만 풀어 둡니다.
 *
 * 장면은 세 종류입니다.
 *  - 'open'   : 여는 말 / 닫는 말 — 하늘 한가운데 글자만
 *  - 'sky'    : 하늘을 보여주는 장면 — 카드는 아래, 하늘은 위로 비켜섭니다
 *  - 'target' : 실제 버튼을 짚는 장면 — 그 자리만 밝게 남깁니다
 */

const STEPS = [
  { id: 'prologue', kind: 'open' },
  {
    id: 'star',
    kind: 'sky',
    eyebrow: '잔별',
    title: '별 하나는, 누군가의 이야기예요',
    body: '이 은하의 별은 모두 누군가 띄운 이야기예요. 한 사람의 별은 한자리에 모여 성단이 되고, 성단들이 모여 은하가 됩니다.',
    art: 'scale',
  },
  {
    id: 'open',
    kind: 'sky',
    eyebrow: '읽고, 건네기',
    title: '별을 누르면 이야기가 열려요',
    body: '마음이 닿았다면 온기를 더하고, 건네고 싶은 말이 있다면 별빛을 이어주세요.',
    art: 'actions',
  },
  {
    id: 'bond',
    kind: 'sky',
    eyebrow: '이어진 빛',
    title: '닮은 마음은 빛으로 이어져요',
    body: '비슷한 하루를 지나온 사람의 별끼리는 가느다란 선이 그어져요. 은하 저편에도 나와 같은 밤을 보낸 누군가가 있다는 뜻이에요.',
    art: 'bond',
  },
  {
    id: 'compose',
    kind: 'target',
    target: '.composer',
    eyebrow: '잔별 띄우기',
    title: '당신의 이야기도 띄워보세요',
    body: '한 줄만이라도 충분하고, 마음에 남은 이야기를 길게 써 내려가도 좋아요. 사진도 한 장 담을 수 있어요. 띄우는 순간, 닮은 마음들이 곁으로 모여듭니다.',
  },
  {
    // 이 장면 동안 실제로 '나의 성단' 시점이 켜집니다 (App이 전환)
    id: 'mine',
    kind: 'target',
    target: '.segment .chip:nth-child(1)',
    eyebrow: '나의 성단',
    title: '내 이야기들은 한자리에 모여요',
    body: '‘나의 성단’을 누르면 내가 띄운 별만 밝아지고, 어떤 마음이 많았는지 조용히 돌아볼 수 있어요.',
  },
  {
    // 그리고 다시 '전체 은하'로
    id: 'cosmos',
    kind: 'target',
    target: '.segment .chip:nth-child(2)',
    eyebrow: '전체 은하',
    title: '언제든, 모두의 하늘로',
    body: '‘전체 은하’를 누르면 모든 사람의 별이 함께 떠 있는 하늘로 돌아와요. 오늘은 누가 어떤 이야기를 띄웠는지 천천히 둘러보세요.',
  },
  { id: 'finale', kind: 'open' },
]

/** 진행 표시에 들어가는 장면 (여는 말·닫는 말 제외) */
const LESSONS = STEPS.filter((s) => s.kind !== 'open').map((s) => s.id)

const GAP = 18 // 짚은 버튼과 카드 사이
const PAD = 8 // 짚은 버튼 둘레의 여백

export default function Tutorial({ narrow, reducedMotion, onStep, onInset, onFinish }) {
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState(null) // 짚고 있는 버튼의 화면 위치
  const [cardH, setCardH] = useState(0)
  const [viewport, setViewport] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  const [leaving, setLeaving] = useState(false)
  const cardRef = useRef(null)
  const primaryRef = useRef(null)
  const rootRef = useRef(null)
  const lastHole = useRef(null)
  const byKeyboard = useRef(false) // 키보드로 오가는 중인가

  const step = STEPS[index]
  const lesson = LESSONS.indexOf(step.id)

  /* 장면이 바뀌면 App이 하늘을 그 장면에 맞게 옮깁니다 */
  useEffect(() => {
    onStep?.(step.id)
  }, [step.id, onStep])

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  /* 짚을 버튼의 자리를 잽니다 */
  useLayoutEffect(() => {
    if (step.kind !== 'target') {
      setRect(null)
      return
    }
    const measure = () => {
      const el = document.querySelector(step.target)
      if (!el) return setRect(null)
      const r = el.getBoundingClientRect()
      setRect({ left: r.left, top: r.top, width: r.width, height: r.height })
    }
    measure()
    // 입력창이 접히고 펼쳐지는 전환이 끝난 뒤 한 번 더
    const t = setTimeout(measure, 260)
    return () => clearTimeout(t)
  }, [step, viewport])

  /* 카드 높이 — 하늘을 얼마나 비켜 세울지 정하는 값 */
  useLayoutEffect(() => {
    const el = cardRef.current
    if (!el) return setCardH(0)
    setCardH(el.offsetHeight)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setCardH(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [step.id, viewport])

  /* 카드가 아래를 가리는 장면에서는 그만큼 하늘의 중심을 위로 */
  const edge = narrow ? 12 : 28
  const inset = step.kind === 'sky' && cardH ? cardH + edge + 12 : 0
  useEffect(() => {
    onInset?.(inset)
  }, [inset, onInset])
  useEffect(() => () => onInset?.(0), [onInset])

  /* ---------- 오가기 ---------- */

  const close = useCallback(
    (action) => {
      if (leaving) return
      // 입력창은 누른 그 순간에 포커스해야 모바일에서 키보드가 올라옵니다
      if (action === 'write') document.getElementById('draft')?.focus()
      setLeaving(true)
      setTimeout(() => onFinish(action), reducedMotion ? 0 : 520)
    },
    [leaving, onFinish, reducedMotion]
  )

  const next = useCallback(() => {
    setIndex((i) => Math.min(STEPS.length - 1, i + 1))
  }, [])
  const prev = useCallback(() => {
    setIndex((i) => Math.max(1, i - 1)) // 여는 말로는 되돌아가지 않습니다
  }, [])

  useEffect(() => {
    if (leaving) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close(step.id === 'finale' ? 'done' : 'skip')
      } else if (e.key === 'ArrowRight' && step.id !== 'finale') {
        e.preventDefault()
        next()
      } else if (e.key === 'ArrowLeft' && lesson > 0) {
        e.preventDefault()
        prev()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [leaving, step.id, lesson, next, prev, close])

  /**
   * 초점 — 키보드로 오가는 사람에게는 장면마다 '다음' 버튼에 초점을 둡니다.
   * 손가락이나 마우스로 누르는 사람에게는 버튼 둘레에 초점 테두리가 생기지 않게,
   * 안내 전체(대화상자)에만 조용히 초점을 둡니다. 화면 낭독기는 여기서 읽기 시작해요.
   */
  useEffect(() => {
    const onKey = () => (byKeyboard.current = true)
    const onPointer = () => (byKeyboard.current = false)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onPointer, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', onPointer, true)
    }
  }, [])
  useEffect(() => {
    const t = setTimeout(() => {
      const el = byKeyboard.current ? primaryRef.current : rootRef.current
      el?.focus({ preventScroll: true })
    }, 60)
    return () => clearTimeout(t)
  }, [step.id])

  /* ---------- 자리 계산 ---------- */

  const hole = useMemo(() => {
    if (!rect) return null
    // 알약 모양 버튼은 알약 모양 그대로 짚습니다
    const pill = /segment|chip/.test(step.target)
    const radius = pill ? (rect.height + PAD * 2) / 2 : 24
    return {
      left: rect.left - PAD,
      top: rect.top - PAD,
      width: rect.width + PAD * 2,
      height: rect.height + PAD * 2,
      borderRadius: radius,
    }
  }, [rect, step.target])
  // 빛이 꺼질 때도 제자리에서 사그라들도록 마지막 자리를 기억해 둡니다
  if (hole) lastHole.current = hole
  const holeStyle = hole || lastHole.current || {
    left: viewport.w / 2,
    top: viewport.h / 2,
    width: 0,
    height: 0,
    borderRadius: 24,
  }

  const cardStyle = useMemo(() => {
    const { w, h } = viewport
    const width = narrow ? w - 24 : Math.min(420, w - 32)
    if (step.kind === 'sky' || (step.kind === 'target' && !rect)) {
      return {
        width,
        left: narrow ? 12 : (w - width) / 2,
        bottom: edge,
        maxHeight: h - 96,
      }
    }
    if (step.kind === 'target' && rect) {
      const cx = rect.left + rect.width / 2
      const left = narrow ? 12 : Math.max(16, Math.min(w - width - 16, cx - width / 2))
      const below = rect.top + rect.height / 2 < h / 2
      return below
        ? { width, left, top: rect.top + rect.height + PAD + GAP, maxHeight: h - (rect.top + rect.height + PAD + GAP) - 16 }
        : { width, left, bottom: h - rect.top + PAD + GAP, maxHeight: rect.top - PAD - GAP - 16 }
    }
    return null
  }, [viewport, narrow, step.kind, rect, edge])

  return (
    <div
      className={`tour is-${step.kind}${leaving ? ' leaving' : ''}`}
      ref={rootRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`tour-title-${step.id}`}
    >
      {/* 그늘 — 장면마다 다르게 깔립니다 */}
      <div className="tour-shade flat" aria-hidden="true" />
      <div className="tour-shade sky" aria-hidden="true" />
      <div className={`tour-hole${hole ? ' on' : ''}`} style={holeStyle} aria-hidden="true" />

      {step.id === 'prologue' && (
        <div className="tour-open" key="prologue">
          <span className="tour-kicker">처음 오셨군요</span>
          <h2 id="tour-title-prologue">
            눈부시게 화려하지 않아도 괜찮아요.
            <br />
            우리는 모두 서로를 은은하게 비추는 잔별이니까요.
          </h2>
          <p>
            잔별은 사소한 하루와 마음에 남은 이야기를 띄우고,
            <br />
            닮은 마음끼리 서로를 비추는 작은 우주예요.
          </p>
          <div className="tour-open-actions">
            <button ref={primaryRef} className="tour-primary" onClick={next}>
              천천히 둘러보기
            </button>
            <button className="tour-quiet" onClick={() => close('skip')}>
              안내 없이 시작할게요
            </button>
          </div>
        </div>
      )}

      {step.id === 'finale' && (
        <div className="tour-open" key="finale">
          <span className="tour-kicker">이제, 당신의 밤</span>
          <h2 id="tour-title-finale">오늘을 비출 차례예요.</h2>
          <p>
            누군가의 별을 먼저 열어보거나,
            <br />
            단 한 줄만이라도, 당신의 별을 띄울 수 있어요.
          </p>
          <div className="tour-open-actions row">
            <button className="tour-secondary" onClick={() => close('read')}>
              별 하나 열어보기
            </button>
            <button ref={primaryRef} className="tour-primary" onClick={() => close('write')}>
              나의 이야기 쓰기
            </button>
          </div>
          <small className="tour-note">
            이 안내는 오른쪽 위 <i aria-hidden="true">?</i> 에서 언제든 다시 볼 수 있어요.
          </small>
        </div>
      )}

      {step.kind !== 'open' && cardStyle && (
        <section className="tour-card" style={cardStyle} ref={cardRef} key={step.id}>
          <header className="tour-cardhead">
            <span className="tour-eyebrow">{step.eyebrow}</span>
            <button className="tour-skip" onClick={() => close('skip')}>
              건너뛰기
            </button>
          </header>

          <div className="tour-cardbody">
            <h3 id={`tour-title-${step.id}`}>{step.title}</h3>
            <p>{step.body}</p>
            {step.art === 'scale' && (
              <>
                <ArtScale />
                <EmotionLegend />
              </>
            )}
            {step.art === 'actions' && <ArtActions />}
            {step.art === 'bond' && <ArtBond still={reducedMotion} />}
          </div>

          <footer className="tour-cardfoot">
            <Progress current={lesson} total={LESSONS.length} />
            <div className="tour-nav">
              <button className="tour-quiet" onClick={prev} disabled={lesson <= 0} aria-hidden={lesson <= 0}>
                이전
              </button>
              <button ref={primaryRef} className="tour-primary small" onClick={next}>
                {lesson === LESSONS.length - 1 ? '마치기' : '다음'}
              </button>
            </div>
          </footer>
        </section>
      )}

      <p className="sr-only" aria-live="polite">
        {lesson >= 0 ? `${LESSONS.length}개 중 ${lesson + 1}번째 안내: ${step.title}` : ''}
      </p>
    </div>
  )
}

/**
 * 진행 표시 — 점이 아니라 작은 별자리입니다.
 * 지나온 별은 이어지고, 지금 있는 별만 따뜻하게 빛나요.
 */
function Progress({ current, total }) {
  const gap = 18
  const width = (total - 1) * gap + 10
  const ys = [7, 4, 8, 3, 6, 5, 7]
  return (
    <svg
      className="tour-progress"
      width={width}
      height="12"
      viewBox={`0 0 ${width} 12`}
      role="img"
      aria-label={`${total}개 중 ${current + 1}번째`}
    >
      {Array.from({ length: total - 1 }, (_, i) => (
        <line
          key={`l${i}`}
          x1={5 + i * gap}
          y1={ys[i % ys.length]}
          x2={5 + (i + 1) * gap}
          y2={ys[(i + 1) % ys.length]}
          className={i < current ? 'lit' : ''}
        />
      ))}
      {Array.from({ length: total }, (_, i) => (
        <circle
          key={`c${i}`}
          cx={5 + i * gap}
          cy={ys[i % ys.length]}
          r={i === current ? 3 : 1.8}
          className={i === current ? 'now' : i < current ? 'past' : ''}
        />
      ))}
    </svg>
  )
}

/* ---------------- 장면 그림 ---------------- */

/** 잔별 → 성단 → 은하 : 크기의 사다리 */
function ArtScale() {
  const spiral = useMemo(() => {
    const pts = []
    for (let arm = 0; arm < 2; arm++) {
      for (let i = 0; i < 16; i++) {
        const t = i / 15
        const a = t * Math.PI * 2.2 + arm * Math.PI
        const r = 3 + t * 17
        pts.push({ x: 32 + Math.cos(a) * r, y: 24 + Math.sin(a) * r * 0.62, r: 1.25 - t * 0.55, o: 0.95 - t * 0.5 })
      }
    }
    return pts
  }, [])

  return (
    <div className="tour-art scale" aria-hidden="true">
      <figure>
        <svg viewBox="0 0 64 48">
          <circle cx="32" cy="24" r="9" className="halo" />
          <path d="M32 15v18M23 24h18" className="spike" />
          <circle cx="32" cy="24" r="2.6" className="core twinkle" />
        </svg>
        <figcaption>
          <b>잔별</b>
          <span>나의 이야기</span>
        </figcaption>
      </figure>
      <figure>
        <svg viewBox="0 0 64 48">
          <circle cx="32" cy="24" r="16" className="halo soft" />
          {[
            [26, 20],
            [35, 17],
            [39, 26],
            [30, 29],
            [22, 27],
            [33, 23],
            [42, 20],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i === 5 ? 2 : 1.4} className={`core${i % 3 === 0 ? ' twinkle' : ''}`} />
          ))}
        </svg>
        <figcaption>
          <b>성단</b>
          <span>한 사람의 기록</span>
        </figcaption>
      </figure>
      <figure>
        <svg viewBox="0 0 64 48">
          <ellipse cx="32" cy="24" rx="22" ry="14" className="halo soft" />
          {spiral.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={p.r} className="core" style={{ opacity: p.o }} />
          ))}
          <circle cx="32" cy="24" r="3" className="core warmcore" />
        </svg>
        <figcaption>
          <b>은하</b>
          <span>모두의 하루</span>
        </figcaption>
      </figure>
    </div>
  )
}

/** 별의 색은 이야기의 마음 — 한 줄짜리 작은 범례 */
function EmotionLegend() {
  return (
    <div className="tour-emolegend" aria-label="별의 색은 이야기의 마음이에요">
      <span className="tour-emolegend-lede">별의 색은 이야기의 마음이에요</span>
      <ul>
        {EMOTION_ORDER.map((k) => (
          <li key={k}>
            <i style={{ background: cssColor(EMOTION_COLORS[k]), boxShadow: `0 0 8px ${cssColor(EMOTION_COLORS[k], 0.8)}` }} />
            {k}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** 카드 안에서 실제로 누르게 될 두 가지 — 같은 모양 그대로 */
function ArtActions() {
  return (
    <div className="tour-art actions" aria-hidden="true">
      <div className="tour-demo-row">
        <span className="warmbtn tour-faux-warm">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M12 3c2.5 3.2 1 4.8 0 6-1.4 1.7-2.6 3-2.6 5A4.6 4.6 0 0 0 12 19a4.6 4.6 0 0 0 4.6-5c0-1.5-.8-2.6-1.6-3.6" />
          </svg>
          온기 더하기
        </span>
        <small>“나도 그랬어요” 하는 공감</small>
      </div>
      <div className="tour-demo-row">
        <span className="tour-faux-reply">
          <span className="replyspark" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 2.5c.6 4.6 2.3 7.3 9.5 9.5-7.2 2.2-8.9 4.9-9.5 9.5-.6-4.6-2.3-7.3-9.5-9.5 7.2-2.2 8.9-4.9 9.5-9.5z" />
            </svg>
          </span>
          <span>
            별빛 이어가기<em> — 다정한 한 줄</em>
          </span>
        </span>
        <small>짧은 답글</small>
      </div>
    </div>
  )
}

/** 은하 이쪽의 나, 저편의 누군가 — 그 사이를 건너는 빛 */
function ArtBond({ still }) {
  const path = 'M62 40 C 110 6, 190 6, 238 36'
  return (
    <div className="tour-art bond" aria-hidden="true">
      <svg viewBox="0 0 300 64">
        <path d={path} className="bondline" />
        {!still && (
          <circle r="2.4" className="traveler">
            <animateMotion dur="3.4s" repeatCount="indefinite" path={path} keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.45 0 0.55 1" />
          </circle>
        )}
        <g className="clusterA">
          <circle cx="50" cy="44" r="16" className="halo soft" />
          <circle cx="44" cy="40" r="1.5" className="core" />
          <circle cx="54" cy="47" r="1.3" className="core" />
          <circle cx="48" cy="50" r="1.1" className="core" />
          <circle cx="62" cy="40" r="2.3" className="core twinkle" />
        </g>
        <g className="clusterB">
          <circle cx="250" cy="40" r="16" className="halo soft warm" />
          <circle cx="256" cy="36" r="1.5" className="core" />
          <circle cx="246" cy="46" r="1.3" className="core" />
          <circle cx="258" cy="46" r="1.1" className="core" />
          <circle cx="238" cy="36" r="2.3" className="core warmcore twinkle" />
        </g>
      </svg>
      <div className="tour-bond-labels">
        <span>나의 비 오는 밤</span>
        <span>누군가의 비 오는 밤</span>
      </div>
    </div>
  )
}
