import { useEffect, useRef, useState } from 'react'
import { photoOf, hasPhoto } from '../lib/photo.js'
import { relativeWhen, readWhen, isAnniversary, yearsAgo } from '../lib/time.js'
import { emotionOf, EMOTION_COLORS, cssColor } from '../lib/emotionColor.js'
import StarGuard from './StarGuard.jsx'

/** 빈 줄로 나뉜 문단들 — 한 줄짜리 줄바꿈은 문단 안에 그대로 남습니다 */
function paragraphsOf(text = '') {
  const parts = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
  return parts.length ? parts : [text.trim()]
}

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
  onReport,
  onBlock,
  onNotice,
  onAllowFeature,
  onRemove,
  onClose,
}) {
  const [draft, setDraft] = useState('')
  const [confirmRemove, setConfirmRemove] = useState(false)
  const bodyRef = useRef(null)

  useEffect(() => {
    setDraft('')
    setConfirmRemove(false) // 다른 별을 열면 물음은 닫힙니다
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

  /**
   * 이 별 하나를 보냅니다.
   * 링크는 /s/<id> — 서버가 이 글이 담긴 미리보기를 붙여 보내주는 주소입니다.
   * 카카오톡에서 글 한 줄이 그대로 보이는 건 그 덕분이에요.
   */
  const share = async () => {
    const url = `${window.location.origin}/s/${star.id}`
    const text = star.text.length > 40 ? `${star.text.slice(0, 40)}…` : star.text
    try {
      if (navigator.share) {
        await navigator.share({ title: '잔별', text, url })
        return
      }
      await navigator.clipboard.writeText(url)
      onNotice?.('주소를 복사했어요. 어디든 붙여넣어 보내세요.')
    } catch {
      /* 사용자가 공유창을 닫은 것 — 알릴 일이 아닙니다 */
    }
  }

  return (
    <section className={`card${open ? ' open' : ''}`} aria-live="polite">
      <span className="grip" aria-hidden="true" />
      <button className="close" onClick={onClose} aria-label="닫기">
        ×
      </button>
      {/* 남의 별에만 — 내 글을 내가 신고할 일은 없으니까요 */}
      {!mine && onReport && (
        <StarGuard star={star} onReport={onReport} onBlock={onBlock} onDone={onNotice} />
      )}

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
        {/* 글쓴이가 끊어 쓴 자리를 지킵니다.
            한 덩어리로 쏟아놓으면 열 줄짜리 벽이 되고, 읽는 사람은 숨 쉴 데가 없습니다.
            빈 줄은 문단으로, 한 줄 줄바꿈은 그대로. 빈 줄을 아무리 많이 넣어도
            문단 사이 간격은 한 번만 벌어집니다 — 카드가 찢어지지 않도록. */}
        <div className={`body${star.text.length > 150 ? ' long' : ''}`}>
          {paragraphsOf(star.text).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
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

        {/* 내 잔별에만 — 글이 끝나는 자리에 둡니다.
            글을 다 읽고 "이건 내리고 싶다"는 마음이 드는 지점이 바로 여기라서요.
            한 번에 지우지 않고 한 번 더 묻습니다. 되돌릴 수 없으니까요. */}
        {mine && onRemove && (
          <div className="removeone">
            {confirmRemove ? (
              <>
                <span>이어진 별빛과 온기도 함께 사라져요.</span>
                <button type="button" className="yes" onClick={() => onRemove(star.id)}>
                  거두기
                </button>
                <button type="button" onClick={() => setConfirmRemove(false)}>
                  그대로 두기
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmRemove(true)}>
                이 별 거두기
              </button>
            )}
          </div>
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
          <button className="sharebtn" onClick={share} aria-label="이 잔별 보내기">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 15V4m0 0L8.5 7.5M12 4l3.5 3.5" />
              <path d="M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13" />
            </svg>
            보내기
          </button>
        </div>

        {mine && star.warmth > 0 && (
          <p className="glowline">
            별거 아니라 생각한 이 한 줄이, <b>{star.warmth}명</b>의 밤을 비췄어요.
          </p>
        )}

        {/* 내 잔별에만 — 소개 허락은 언제든 거둘 수 있어야 합니다 */}
        {mine && onAllowFeature && (
          <label className="featuretoggle">
            <input
              type="checkbox"
              checked={star.allowFeature === true}
              onChange={(e) => {
                onAllowFeature(star.id, e.target.checked)
                onNotice?.(
                  e.target.checked
                    ? '이 잔별은 공식 계정에 소개될 수 있어요'
                    : '소개 허락을 거뒀어요'
                )
              }}
            />
            <span>잔별 공식 계정에 소개되어도 좋아요</span>
          </label>
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
