import { useEffect, useRef, useState } from 'react'

/**
 * 이 별이 불편할 때 — 신고하거나, 이 사람을 그만 보거나
 * ---------------------------------------------------------------
 * 애플 1.2 가 요구하는 기능이지만, 요구받아서 붙이는 것처럼 보이면
 * 이 하늘의 공기가 바뀝니다. 그래서 평소에는 점 세 개로만 있다가
 * 필요한 사람에게만 열립니다.
 *
 * 문구도 신고답지 않게 적었습니다. 잔별에서 일어날 일의 대부분은
 * 범죄가 아니라 "이 사람 글은 지금 나한테 버겁다" 쪽일 테니까요.
 */

const REASONS = [
  { key: '괴롭힘', label: '누군가를 괴롭히는 글이에요' },
  { key: '혐오', label: '혐오나 차별이 담겼어요' },
  { key: '성적', label: '성적인 내용이에요' },
  { key: '자해', label: '자해나 위험이 걱정돼요' },
  { key: '광고', label: '광고나 스팸이에요' },
  { key: '기타', label: '그밖에 불편한 글이에요' },
]

export default function StarGuard({ star, onReport, onBlock, onDone }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState(null) // 'report' | 'block'
  const [busy, setBusy] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onAway = (e) => {
      if (!rootRef.current?.contains(e.target)) close()
    }
    const onKey = (e) => e.key === 'Escape' && close()
    document.addEventListener('pointerdown', onAway)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onAway)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const close = () => {
    setOpen(false)
    setMode(null)
  }

  const report = async (reason) => {
    if (busy) return
    setBusy(true)
    try {
      await onReport(star.id, reason)
      onDone?.('알려주셔서 고마워요. 이 별은 당신의 하늘에서 내려갑니다.')
    } catch {
      onDone?.('지금은 전하지 못했어요. 잠시 뒤에 다시 해주세요.')
    } finally {
      setBusy(false)
      close()
    }
  }

  const block = async () => {
    if (busy) return
    setBusy(true)
    try {
      await onBlock(star.authorId)
      onDone?.('이 사람의 잔별은 이제 보이지 않아요.')
    } catch {
      onDone?.('지금은 처리하지 못했어요. 잠시 뒤에 다시 해주세요.')
    } finally {
      setBusy(false)
      close()
    }
  }

  return (
    <div className="guard" ref={rootRef}>
      <button
        className="guardbtn"
        onClick={() => setOpen((v) => !v)}
        aria-label="이 잔별 신고하거나 숨기기"
        aria-expanded={open}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>

      {open && (
        <div className="guardmenu" role="menu">
          {mode === null && (
            <>
              <button role="menuitem" onClick={() => setMode('report')}>
                이 글이 불편해요
              </button>
              <button role="menuitem" onClick={() => setMode('block')}>
                이 사람의 잔별 그만 보기
              </button>
            </>
          )}

          {mode === 'report' && (
            <>
              <p className="guardtitle">어떤 점이 불편했나요?</p>
              {REASONS.map((r) => (
                <button key={r.key} role="menuitem" disabled={busy} onClick={() => report(r.key)}>
                  {r.label}
                </button>
              ))}
              <button className="guardback" onClick={() => setMode(null)}>
                돌아가기
              </button>
            </>
          )}

          {mode === 'block' && (
            <>
              <p className="guardtitle">
                이 사람이 띄운 잔별은 앞으로 당신의 하늘에 뜨지 않습니다.
                <br />
                나의 성단에서 언제든 되돌릴 수 있어요.
              </p>
              <button className="guarddanger" disabled={busy} onClick={block}>
                그만 보기
              </button>
              <button className="guardback" onClick={() => setMode(null)}>
                돌아가기
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
