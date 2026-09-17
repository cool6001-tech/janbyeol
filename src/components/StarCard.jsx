import { useEffect, useRef, useState } from 'react'
import { photoOf, hasPhoto } from '../lib/photo.js'
import { relativeWhen, readWhen, isAnniversary, yearsAgo } from '../lib/time.js'
import { emotionOf, EMOTION_COLORS, cssColor } from '../lib/emotionColor.js'

/**
 * 잔별 카드
 * 우주 뷰에서는 보이지 않던 사진이, 여기서만 어두운 톤으로 깔립니다.
 */
export default function StarCard({
  star,
  me,
  reach,
  open = true,
  readAt,
  shine,
  onWarm,
  onReply,
  onClose,
}) {
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
        {shine && (
          <div className="shinebadge">
            <span className="shinebadge-star" aria-hidden="true" />
            <b>오늘 가장 빛나는 별</b>
          </div>
        )}
        <div className="meta">
          {/* 하늘에서 본 그 별의 색 그대로 — 어떤 마음의 이야기인지 */}
          <span className="dot" style={{ color: cssColor(EMOTION_COLORS[emotionOf(star)]) }} />
          <em className="emo" style={{ color: cssColor(EMOTION_COLORS[emotionOf(star)]) }}>
            {emotionOf(star)}
          </em>
          <em>
            {mine ? '나의 잔별 · ' : ''}
            {relativeWhen(star.createdAt)}
          </em>
          {/* 하늘의 별길을 놓쳤더라도, 여는 순간 바로 알 수 있게 */}
          {readAt && <em className="seen">{readWhen(readAt)}</em>}
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
        {/* '이 마음은 N명의 잔별 M개에 닿아 있어요'는 뺐습니다. 숫자가 둘이라 읽히지 않았고,
            내 별에서는 아래 '별거 아니라 생각한 이 한 줄이, N명의 밤을 비췄어요' 한 줄이면 충분해요. */}
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

      {/* 별빛 이어가기 — 눈에 잘 띄지 않던 자리라, 작은 별 하나가 은은하게 반짝이며 부릅니다.
          쓰기 시작하면 반짝임은 멈추고 또렷하게 켜진 채로, '잇기'가 따뜻해집니다. */}
      <form className={`replybar${draft.trim() ? ' ready' : ''}`} onSubmit={submit}>
        <span className="replyspark" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M12 2.5c.6 4.6 2.3 7.3 9.5 9.5-7.2 2.2-8.9 4.9-9.5 9.5-.6-4.6-2.3-7.3-9.5-9.5 7.2-2.2 8.9-4.9 9.5-9.5z" />
          </svg>
        </span>
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
