import { useRef, useState } from 'react'

/**
 * 잔별 띄우기 — 나의 이야기와 사진 한 장
 *
 * 한 줄만 써도 되고, 길게 써 내려가도 됩니다. 그래서 쓰기 시작하면
 * 입력창이 넉넉히 자라요(넓은 화면 약 9줄, 좁은 화면 약 7줄). 그보다 길면 안에서 스크롤됩니다.
 *
 * 좁은 화면에서는 평소에 한 줄로 접혀 있다가, 쓰기 시작하면 펼쳐집니다.
 * 입력창이 늘 150px를 차지하면 정작 봐야 할 하늘이 그만큼 줄어드니까요.
 */
export default function Composer({ onSubmit, onFocus, compact = false }) {
  const [text, setText] = useState('')
  const [photo, setPhoto] = useState(null)
  const [typing, setTyping] = useState(false)
  const fileRef = useRef(null)
  const areaRef = useRef(null)

  const folded = compact && !typing && !text.trim() && !photo
  /** 아무도 쓰고 있지 않은 빈 입력창 — 이때만 별이 반짝이며 부릅니다 */
  const idle = !typing && !text.trim() && !photo

  const grow = (el) => {
    el.style.height = 'auto'
    el.style.height = Math.min(compact ? 180 : 260, el.scrollHeight) + 'px'
  }

  const pickFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setPhoto(reader.result)
    reader.readAsDataURL(file)
  }

  const submit = (e) => {
    e.preventDefault()
    if (!text.trim()) return
    onSubmit({ text, photo })
    setText('')
    setPhoto(null)
    setTyping(false)
    if (fileRef.current) fileRef.current.value = ''
    if (areaRef.current) {
      areaRef.current.style.height = 'auto'
      areaRef.current.blur()
    }
  }

  return (
    <form
      className={`composer${compact ? ' compact' : ''}${folded ? ' folded' : ''}${idle ? ' idle' : ''}`}
      onSubmit={submit}
    >
      {/* 오늘의 이야기를 부르는 작은 별 — 비어 있을 땐 은은하게 반짝이고, 쓰기 시작하면 또렷하게 켜집니다 */}
      <span className="composespark" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M12 2.5c.6 4.6 2.3 7.3 9.5 9.5-7.2 2.2-8.9 4.9-9.5 9.5-.6-4.6-2.3-7.3-9.5-9.5 7.2-2.2 8.9-4.9 9.5-9.5z" />
        </svg>
      </span>
      <textarea
        id="draft"
        ref={areaRef}
        rows={1}
        value={text}
        onFocus={() => {
          setTyping(true)
          onFocus?.()
        }}
        onBlur={() => setTyping(false)}
        onChange={(e) => {
          setText(e.target.value)
          grow(e.target)
        }}
        placeholder="오늘, 흘려보내기 아까운 순간이 있었나요"
        aria-label="잔별 내용"
      />

      {photo && (
        <div className="thumb on">
          <img src={photo} alt="첨부한 사진 미리보기" />
          <span>사진 한 장이 담겼어요</span>
          <button type="button" onClick={() => setPhoto(null)}>
            해제
          </button>
        </div>
      )}

      <div className="crow">
        <button
          className="icobtn"
          type="button"
          onClick={() => fileRef.current?.click()}
          title="사진 한 장 첨부"
          aria-label="사진 첨부"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="3" />
            <circle cx="8.5" cy="9.5" r="1.6" />
            <path d="M4 17l5-5 4 4 3-2 4 4" />
          </svg>
        </button>
        <input id="photo-input" type="file" accept="image/*" hidden ref={fileRef} onChange={pickFile} />
        <span className="spacer" />
        <button className="send" type="submit" disabled={!text.trim()}>
          잔별 띄우기
        </button>
      </div>
    </form>
  )
}
