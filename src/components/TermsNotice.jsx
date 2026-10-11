import { useState } from 'react'
import { TERMS_NOTICE } from '../lib/policy.js'

/**
 * 약관 변경 안내 — 이용약관 제3조: 적용일 7일 전부터 서비스 화면에 게시합니다.
 * 한 번 닫으면 이 기기에서는 다시 뜨지 않아요.
 */
const KEY = `janbyeol.notice.${TERMS_NOTICE.id}`

function dismissed() {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export default function TermsNotice() {
  const [open, setOpen] = useState(() => Date.now() < TERMS_NOTICE.until && !dismissed())
  if (!open) return null
  const close = () => {
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      /* 무시 */
    }
    setOpen(false)
  }
  return (
    <div className="termsnotice" role="status">
      <span>
        <b>10월 15일부터 이용약관이 바뀌어요.</b> 공식 계정 소개 동의를 글마다 묻지 않고, 처음 한 번만 물어요.
      </span>
      <a href="/terms.html" target="_blank" rel="noreferrer">
        자세히
      </a>
      <button type="button" onClick={close} aria-label="안내 닫기">
        ×
      </button>
    </div>
  )
}
