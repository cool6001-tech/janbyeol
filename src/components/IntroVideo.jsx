import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * 처음 온 사람에게 보여주는 1분 소개 영상
 * ---------------------------------------------------------------
 * 소리 없이 바로 재생됩니다 (브라우저는 소리 있는 자동 재생을 막아요).
 * 자막이 영상에 들어 있어서 소리 없이도 내용이 전해지고,
 * 원하면 '소리 켜기'로 음악을 들을 수 있어요.
 *
 *  - 폰처럼 세로로 긴 화면에는 세로 영상, 넓은 화면에는 가로 영상
 *  - 언제든 '건너뛰기' (Esc 도 됩니다)
 *  - 데이터 절약 모드이거나 움직임을 줄이는 설정이면 자동 재생하지 않고 누르면 재생
 *  - 영상을 못 불러오면 조용히 넘어갑니다 — 영상 때문에 잔별을 못 쓰면 안 되니까요
 */
// mp4(H.264)를 먼저, 못 트는 브라우저는 webm(VP9)으로
const SOURCES = {
  wide: { mp4: '/intro/janbyeol-intro-wide.mp4', webm: '/intro/janbyeol-intro-wide.webm', poster: '/intro/janbyeol-intro-wide.jpg' },
  tall: { mp4: '/intro/janbyeol-intro-tall.mp4', webm: '/intro/janbyeol-intro-tall.webm', poster: '/intro/janbyeol-intro-tall.jpg' },
}

export default function IntroVideo({ onDone }) {
  const videoRef = useRef(null)
  const doneRef = useRef(false)
  const [muted, setMuted] = useState(true)
  const [progress, setProgress] = useState(0)
  const [needsTap, setNeedsTap] = useState(false)
  const [closing, setClosing] = useState(false)

  const tall = useMemo(() => {
    try {
      return window.matchMedia('(max-aspect-ratio: 1/1)').matches
    } catch {
      return false
    }
  }, [])
  const { mp4, webm, poster } = tall ? SOURCES.tall : SOURCES.wide

  const finish = (how) => {
    if (doneRef.current) return
    doneRef.current = true
    setClosing(true)
    try {
      videoRef.current?.pause()
    } catch {
      /* 무시 */
    }
    setTimeout(() => onDone?.(how), 450)
  }

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    let calm = false
    try {
      calm =
        navigator.connection?.saveData === true ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch {
      /* 무시 */
    }
    if (calm) {
      setNeedsTap(true)
      return
    }
    v.muted = true
    const p = v.play()
    if (p && typeof p.catch === 'function') p.catch(() => setNeedsTap(true))
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') finish('skip')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // finish 는 매번 같은 일을 하니 의존성 없이 둡니다

  const play = () => {
    const v = videoRef.current
    if (!v) return
    setNeedsTap(false)
    v.play().catch(() => finish('error'))
  }

  const toggleSound = () => {
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    setMuted(v.muted)
    if (v.paused) play()
  }

  return (
    <div
      className={`introvideo${closing ? ' closing' : ''}${tall ? ' tall' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="잔별 1분 소개 영상"
    >
      <video
        ref={videoRef}
        poster={poster}
        muted
        playsInline
        preload="auto"
        onTimeUpdate={(e) => {
          const v = e.currentTarget
          if (v.duration) setProgress(v.currentTime / v.duration)
        }}
        onEnded={() => finish('ended')}
      >
        <source src={mp4} type="video/mp4" />
        {/* 마지막 후보까지 못 틀면 그때 조용히 넘어갑니다 */}
        <source src={webm} type="video/webm" onError={() => finish('error')} />
      </video>

      <div className="iv-top">
        <button type="button" className="iv-btn" onClick={toggleSound} aria-pressed={!muted}>
          {muted ? '소리 켜기' : '소리 끄기'}
        </button>
        <button type="button" className="iv-btn strong" onClick={() => finish('skip')}>
          건너뛰기
        </button>
      </div>

      {needsTap && (
        <button type="button" className="iv-play" onClick={play}>
          <span aria-hidden="true">▶</span> 1분 소개 영상 보기
        </button>
      )}

      <div className="iv-bar" aria-hidden="true">
        <span style={{ transform: `scaleX(${progress})` }} />
      </div>
    </div>
  )
}
