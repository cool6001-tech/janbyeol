import { useEffect, useRef, useState } from 'react'
import { letters } from '../lib/storage.js'

/**
 * 잔별을 만든 사람에게 보내는 편지
 * ---------------------------------------------------------------
 * '피드백 보내기' 양식처럼 보이면 사람들은 불만만 적거나 아예 쓰지 않습니다.
 * 그래서 편지처럼 — 무엇이든 괜찮다는 말부터 건넵니다.
 *
 * 종류는 고르지 않아도 됩니다. 다만 제휴·협업처럼 **답장이 있어야 이어지는**
 * 이야기를 고르면, 이메일을 남겨 달라고 조용히 한 번 더 말합니다.
 */

const KINDS = [
  { id: 'wish', label: '잔별에게 바라는 점' },
  { id: 'collab', label: '함께하고 싶어요' },
  { id: 'trouble', label: '불편했던 점' },
  { id: 'etc', label: '그냥 하고 싶은 말' },
]

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function LetterSheet({ narrow, onClose }) {
  const [kind, setKind] = useState(null)
  const [text, setText] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle | sending | sent | error
  const [via, setVia] = useState(null)
  const textRef = useRef(null)

  useEffect(() => {
    // 넓은 화면에서만 바로 쓸 수 있게 — 휴대폰에서는 키보드가 시트를 가려버려요
    if (!narrow) textRef.current?.focus({ preventScroll: true })
  }, [narrow])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const emailBad = email.trim() !== '' && !EMAIL_RE.test(email.trim())
  const canSend = text.trim().length > 0 && !emailBad && status !== 'sending'
  const kindLabel = KINDS.find((k) => k.id === kind)?.label

  const submit = async (e) => {
    e.preventDefault()
    if (!canSend) return
    setStatus('sending')
    try {
      const result = await letters.send({ kind, kindLabel, text, email })
      setVia(result.via)
      setStatus('sent')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div
      className="letterveil"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <section className="letter" role="dialog" aria-modal="true" aria-labelledby="letter-title">
        <span className="grip" aria-hidden="true" />
        <button className="close" type="button" onClick={onClose} aria-label="닫기">
          ×
        </button>

        {status === 'sent' ? (
          <div className="letterdone">
            <span className="letterstar" aria-hidden="true" />
            <h2 id="letter-title">
              {via === 'mail' ? '메일 앱이 열렸어요.' : '편지가 잘 닿았어요.'}
            </h2>
            <p>
              {via === 'mail'
                ? '메일 앱에서 ‘보내기’를 누르면 잔별을 만든 사람에게 전해져요.'
                : '보내주신 마음, 천천히 소중히 읽을게요.'}
            </p>
            {via === 'local' && (
              <small className="letterdev">
                개발 모드 — 받을 곳(VITE_LETTER_ENDPOINT)이 아직 설정되지 않아 이 브라우저에만 저장됐어요.
              </small>
            )}
            <button className="tour-primary" type="button" onClick={onClose}>
              닫기
            </button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <header className="letterhead">
              <span className="tour-eyebrow">편지</span>
              <h2 id="letter-title">잔별을 만든 사람에게</h2>
              <p>
                바라는 점, 함께하고 싶은 일, 불편했던 점까지 — 무엇이든 괜찮아요.
                <br />이 편지는 은하에 별로 뜨지 않고, 만든 사람에게만 닿아요.
              </p>
            </header>

            <div className="letterkinds" role="radiogroup" aria-label="어떤 이야기인가요 (선택)">
              {KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  role="radio"
                  aria-checked={kind === k.id}
                  className={`tag letterkind${kind === k.id ? ' on' : ''}`}
                  onClick={() => setKind(kind === k.id ? null : k.id)}
                >
                  {k.label}
                </button>
              ))}
            </div>

            <textarea
              ref={textRef}
              className="lettertext"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="편하게 적어주세요."
              aria-label="편지 내용"
              rows={6}
              maxLength={4000}
            />

            <label className="letteremail">
              <span>답장 받을 이메일 (선택)</span>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="답장이 필요할 때만 남겨주세요"
                aria-invalid={emailBad}
              />
              {emailBad ? (
                <small className="warn">이메일 주소를 한 번만 더 확인해 주세요.</small>
              ) : kind === 'collab' && !email.trim() ? (
                <small className="warmhint">함께하는 이야기라면, 답장 받을 이메일을 남겨주세요.</small>
              ) : (
                <small>남겨주신 이메일은 답장을 드릴 때만 쓰여요.</small>
              )}
            </label>

            {status === 'error' && (
              <p className="letterror" role="alert">
                편지를 보내지 못했어요. 잠시 뒤에 다시 보내주세요. 쓰신 내용은 그대로 남아 있어요.
              </p>
            )}

            <footer className="letterfoot">
              <button className="tour-quiet" type="button" onClick={onClose}>
                다음에 쓸게요
              </button>
              <button className="tour-primary small" type="submit" disabled={!canSend}>
                {status === 'sending' ? '보내는 중…' : '편지 보내기'}
              </button>
            </footer>
          </form>
        )}
      </section>
    </div>
  )
}
