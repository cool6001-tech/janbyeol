import { useRef, useState } from 'react'

/** 잔별 띄우기 — 글 한 줄과 사진 한 장 */
export default function Composer({ onSubmit, onFocus }) {
  const [text, setText] = useState('')
  const [photo, setPhoto] = useState(null)
  const fileRef = useRef(null)
  const areaRef = useRef(null)

  const grow = (el) => {
    el.style.height = 'auto'
    el.style.height = Math.min(110, el.scrollHeight) + 'px'
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
    if (fileRef.current) fileRef.current.value = ''
    if (areaRef.current) areaRef.current.style.height = 'auto'
  }

  return (
    <form className="composer" onSubmit={submit}>
      <textarea
        id="draft"
        ref={areaRef}
        rows={1}
        value={text}
        onFocus={onFocus}
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
