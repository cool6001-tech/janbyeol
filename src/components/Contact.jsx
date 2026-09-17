import { useEffect, useRef, useState } from 'react'

/**
 * 잔별을 만든 사람에게
 * ---------------------------------------------------------------
 * 양식을 두지 않고 **메일 주소만** 보여줍니다. 받는 서버도, 저장할 개인정보도 없어요.
 * 제휴·마케팅 제안이든 서비스에 대한 조언이든, 보내는 사람이 자기 메일로 편하게 씁니다.
 *
 * 입구는 두 곳이고, 둘 다 이 카드를 엽니다.
 *   1. 오른쪽 위 ? 메뉴  → 메뉴 안에서 바로 바뀌어 보임 (ContactMail)
 *   2. 나의 성단 패널 맨 아래 → 작은 시트로 떠오름 (ContactSheet)
 *
 * 주소를 바꾸려면 아래 한 줄만 고치면 됩니다.
 */
export const CONTACT_EMAIL = 'cool6001@gmail.com'

const MAIL_SUBJECT = '[잔별] '

/** 주소를 클립보드에 — 클립보드 권한이 없는 환경에서도 되도록 한 번 더 시도합니다 */
async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* 아래 방법으로 */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

/** 메일 주소 카드의 알맹이 — 메뉴 안에서도, 시트 안에서도 똑같이 씁니다 */
export function ContactMail({ onBack, titleId }) {
  const [copied, setCopied] = useState(null) // null | 'ok' | 'fail'
  const timer = useRef(0)
  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = async () => {
    const ok = await copyText(CONTACT_EMAIL)
    setCopied(ok ? 'ok' : 'fail')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(null), 2200)
  }

  return (
    <div className="contactmail">
      {onBack && (
        <button className="contactback" type="button" onClick={onBack}>
          ‹ 메뉴
        </button>
      )}
      <p className="cm-lede" id={titleId}>
        잔별을 만든 사람에게
        <br />
        전하고 싶은 이야기가 있나요?
      </p>
      <p className="cm-sub">
        바라는 점, 함께하고 싶은 일, 불편했던 점까지 — 무엇이든 편하게 보내주세요.
      </p>
      {/* 길게 눌러 직접 고를 수도 있게 글자로 둡니다 */}
      <div className="cm-addr">{CONTACT_EMAIL}</div>
      <div className="cm-actions">
        <button className="cm-copy" type="button" onClick={copy} aria-live="polite">
          {copied === 'ok' ? '복사했어요' : copied === 'fail' ? '길게 눌러 복사해 주세요' : '주소 복사'}
        </button>
        <a className="cm-write" href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(MAIL_SUBJECT)}`}>
          메일 쓰기
        </a>
      </div>
    </div>
  )
}

/** 나의 성단에서 열리는 작은 시트 (넓은 화면에서는 가운데, 좁은 화면에서는 아래에서) */
export function ContactSheet({ onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="contactveil"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <section className="contactsheet" role="dialog" aria-modal="true" aria-labelledby="contact-title">
        <span className="grip" aria-hidden="true" />
        <button className="close" type="button" onClick={onClose} aria-label="닫기">
          ×
        </button>
        <ContactMail titleId="contact-title" />
      </section>
    </div>
  )
}
