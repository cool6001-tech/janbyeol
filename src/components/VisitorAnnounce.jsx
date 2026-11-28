import { useEffect, useState } from 'react'
import { ANNOUNCE_MS, lastDayLabel } from '../data/visitors.js'
import { subjectParticle } from '../lib/korean.js'

/**
 * 새 손님별 알림 — 화면 가운데
 * ---------------------------------------------------------------
 *   mode 'fade'    떠올랐다가 ANNOUNCE_MS 뒤 저절로 사라집니다. 하늘을 누르는 데 방해되지 않아요.
 *   mode 'confirm' [확인]을 누를 때까지 남아 있고, [혜성 보러 가기]로 바로 소개를 열 수도 있어요.
 * 어느 쪽이든 손님마다 기기마다 한 번만 뜹니다 (App 이 정합니다).
 */
export default function VisitorAnnounce({ visitors, mode = 'fade', onClose, onOpen }) {
  const [leaving, setLeaving] = useState(false)

  const close = () => {
    setLeaving(true)
    setTimeout(onClose, 450)
  }

  useEffect(() => {
    if (mode !== 'fade') return
    const t = setTimeout(close, ANNOUNCE_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  useEffect(() => {
    if (mode !== 'confirm') return
    const onKey = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  if (!visitors?.length) return null
  const first = visitors[0]
  const names = visitors.map((v) => v.name)
  const last = names[names.length - 1]
  const who = names.length === 1 ? last : `${names.slice(0, -1).join(', ')}, ${last}`
  const until = visitors.length === 1 ? lastDayLabel(first) : ''
  const [hr, hg, hb] = first.head
  const [tr, tg, tb] = first.tail

  return (
    <div
      className={`vannounce ${mode}${leaving ? ' leaving' : ''}`}
      role={mode === 'confirm' ? 'dialog' : 'status'}
      aria-live="polite"
    >
      <section className="vannounce-card" style={{ '--v-head': `${hr},${hg},${hb}`, '--v-tail': `${tr},${tg},${tb}` }}>
        <div className="vs-mark vannounce-mark" aria-hidden="true">
          <span className="vs-tail" />
          <span className="vs-head" />
        </div>
        <p className="vs-eyebrow">잔별 하늘에 손님별이 찾아왔어요</p>
        <p className="vannounce-title">
          ✦ {who}
          {subjectParticle(last)} 나타났어요!
        </p>
        <p className="vannounce-sub">
          반짝이는 혜성을 눌러 보세요
          {until && (
            <>
              <br />
              {until}까지 우리 하늘에 머물러요
            </>
          )}
        </p>
        {mode === 'confirm' && (
          <div className="vannounce-actions">
            <button type="button" className="vannounce-ok" onClick={close} autoFocus>
              확인
            </button>
            <button
              type="button"
              className="vannounce-go"
              onClick={() => {
                onOpen?.(first.id)
                close()
              }}
            >
              혜성 보러 가기
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
