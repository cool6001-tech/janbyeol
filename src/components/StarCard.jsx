import { useEffect, useRef, useState } from 'react'
import { photoOf, hasPhoto } from '../lib/photo.js'
import { relativeWhen, isAnniversary, yearsAgo } from '../lib/time.js'

/**
 * 잔별 카드
 * 우주 뷰에서는 보이지 않던 사진이, 여기서만 어두운 톤으로 깔립니다.
 */
export default function StarCard({ star, me, reach, open = true, onWarm, onReply, onClose }) {
  const [draft, setDraft] = useState('')
  const bodyRef = useRef(null)

  useEffect(() => {
    setDraft('')
    if (bodyRef.current) bodyRef.current.scrollTop = 0
  }, [star?.id])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!star) return <section className="card" aria-hidden="true" />

  const photo = photoOf(star)
  const mine = star.authorId === me.id
  const warmed = (star.warmedBy || []).includes(me.id)
  const replies = star.replies || []
  const anniversary = isAnniversary(star.createdAt)

  const submit = (e) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    onReply(star.id, text)
    setDraft('')
  }

  return (
    <section className={`card${open ? ' open' : ''}`} aria-live="polite">
      <span className="grip" aria-hidden="true" />
      <button className="close" onClick={onClose} aria-label="닫기">
        ×
      </button>

      <div className={`cardhead${hasPhoto(star) ? ' haspic' : ''}`}>
        {photo && <div className="photo" style={{ backgroundImage: `url(${photo})` }} />}
        <div className="meta">
          <span className="dot" style={{ color: star.warmth > 6 ? '#FFB067' : '#8FB3FF' }} />
          <em>
            {mine ? '나의 잔별 · ' : ''}
            {relativeWhen(star.createdAt)}
          </em>
        </div>
        <div className="body">{star.text}</div>
        <div className="tags">
          {star.tags.map((t) => (
            <span className="tag" key={t}>
              {t}
            </span>
          ))}
        </div>
        {anniversary && (
          <p className="anniversary">{yearsAgo(star.createdAt)}년 전 오늘, 당신은 여기 있었어요.</p>
        )}
        {reach?.count > 0 && (
          <p className="reach">
            이 마음은 <b>{reach.people}명</b>의 잔별 {reach.count}개에 닿아 있어요.
          </p>
        )}
      </div>

      <div className="cardbody" ref={bodyRef}>
        <div className="warmrow">
          <button className={`warmbtn${warmed ? ' on' : ''}`} onClick={() => onWarm(star.id)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M12 3c2.5 3.2 1 4.8 0 6-1.4 1.7-2.6 3-2.6 5A4.6 4.6 0 0 0 12 19a4.6 4.6 0 0 0 4.6-5c0-1.5-.8-2.6-1.6-3.6" />
            </svg>
            온기 더하기
          </button>
          <span className="count">온기 {star.warmth || 0}</span>
        </div>

        {mine && star.warmth > 0 && (
          <p className="glowline">
            별거 아니라 생각한 이 한 줄이, <b>{star.warmth}명</b>의 밤을 비췄어요.
          </p>
        )}

        <div className="threads">
          {replies.length === 0 ? (
            <p className="empty">
              아직 이어진 별빛이 없어요.
              <br />
              먼저 한 줄을 건네보세요.
            </p>
          ) : (
            replies.map((r) => (
              <div className="thread" key={r.id}>
                <i />
                <p>
                  <b>{r.who}</b>
                  {r.text}
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      <form className="replybar" onSubmit={submit}>
        <input
          id="reply-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="별빛 이어가기 — 다정한 한 줄"
          aria-label="댓글 입력"
          maxLength={80}
        />
        <button type="submit">잇기</button>
      </form>
    </section>
  )
}
