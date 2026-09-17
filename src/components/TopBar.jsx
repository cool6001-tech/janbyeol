import { useEffect, useRef, useState } from 'react'
import { ContactMail } from './Contact.jsx'

/**
 * 두 버튼은 같은 우주를 보는 두 시점입니다.
 * 지금 어느 시점인지가 눈에 보이도록 켜진 쪽을 표시합니다.
 *
 * 그 옆의 ? 는 작은 메뉴입니다 — 늘 같은 자리에, 눈에 띄지 않게.
 *   · 안내 다시 보기
 *   · 잔별을 만든 사람에게 → 같은 자리에서 메일 주소로 바뀝니다
 */
export default function TopBar({ clusterCount, mineMode, onToggleMine, onCosmos, onHelp, onMenuOpen }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [view, setView] = useState('menu') // 'menu' | 'mail'
  const wrapRef = useRef(null)
  const btnRef = useRef(null)

  const closeMenu = (restoreFocus = false) => {
    setMenuOpen(false)
    if (restoreFocus) btnRef.current?.focus({ preventScroll: true })
  }

  // 바깥을 누르거나 Esc를 누르면 닫힙니다
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setMenuOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') closeMenu(true)
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const toggleMenu = () => {
    const next = !menuOpen
    setMenuOpen(next)
    setView('menu')
    if (next) onMenuOpen?.()
  }

  return (
    <div className="topbar">
      <div className="mark">
        <b>잔별</b>
        <span>Janbyeol</span>
      </div>
      <div className="topright">
        {clusterCount > 0 && !mineMode && (
          <span className="chip warmish static" aria-live="polite">
            공감 성단 · 닮은 잔별 {clusterCount}
          </span>
        )}

        <div className="helpwrap" ref={wrapRef}>
          <button
            ref={btnRef}
            className={`helpbtn${menuOpen ? ' on' : ''}`}
            onClick={toggleMenu}
            aria-haspopup="true"
            aria-expanded={menuOpen}
            aria-label="잔별 메뉴"
            title="안내 · 만든 사람에게"
          >
            ?
          </button>

          {menuOpen && (
            <div className="helpmenu" role={view === 'menu' ? 'menu' : 'dialog'} aria-label="잔별 메뉴">
              {view === 'menu' ? (
                <>
                  <button
                    className="helpitem"
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      closeMenu()
                      onHelp?.()
                    }}
                  >
                    <i className="hi-dot cool" aria-hidden="true" />
                    <span>
                      <b>안내 다시 보기</b>
                      <small>처음 온 것처럼 잔별을 둘러봐요</small>
                    </span>
                  </button>
                  <div className="helpsep" aria-hidden="true" />
                  <button className="helpitem" role="menuitem" type="button" onClick={() => setView('mail')}>
                    <i className="hi-dot warm" aria-hidden="true" />
                    <span>
                      <b>잔별을 만든 사람에게</b>
                      <small>바라는 점, 함께하고 싶은 일</small>
                    </span>
                    <em aria-hidden="true">›</em>
                  </button>
                </>
              ) : (
                <ContactMail onBack={() => setView('menu')} />
              )}
            </div>
          )}
        </div>

        <div className="segment" role="group" aria-label="하늘을 보는 시점">
          <button className={`chip${mineMode ? ' on' : ''}`} onClick={onToggleMine} aria-pressed={mineMode}>
            나의 성단
          </button>
          <button className={`chip${mineMode ? '' : ' on'}`} onClick={onCosmos} aria-pressed={!mineMode}>
            전체 은하
          </button>
        </div>
      </div>
    </div>
  )
}
