import { useRef } from 'react'
import { monthLabel, relativeWhen, yearsAgo } from '../lib/time.js'
import { subjectParticle } from '../lib/korean.js'

/**
 * 나의 성단 — 저장된 기록이 회고가 되는 화면
 * 차트는 한 가지 색만 씁니다. 길이가 크기를 말하니 색까지 일할 필요가 없어요.
 */
export default function ConstellationPanel({
  data,
  sheet = false,
  open = true,
  onToggle,
  onClose,
  onSelectStar,
  onReset,
  roadCount = 0,
  onClearRoad,
  onWriteLetter,
}) {
  const { count, warmth, starlight, tagRanking, months, brightest, anniversaries } = data
  const maxTag = Math.max(1, ...tagRanking.map((t) => t.count))
  const maxMonth = Math.max(1, ...months.map((m) => m.count))
  const topTag = tagRanking[0]

  /* 손잡이는 톡 눌러도, 위아래로 쓸어도 열리고 닫힙니다.
     손잡이 모양을 보면 사람들은 대개 끌어올리려 하니까요. */
  const swipe = useRef(null)
  const onDown = (e) => {
    swipe.current = { y: e.clientY, dy: 0 }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onMove = (e) => {
    if (swipe.current) swipe.current.dy = e.clientY - swipe.current.y
  }
  const onUp = () => {
    const s = swipe.current
    swipe.current = null
    if (!s) return
    if (Math.abs(s.dy) < 10) onToggle?.()
    else if (s.dy < -26 && !open) onToggle?.()
    else if (s.dy > 26 && open) onToggle?.()
  }

  return (
    <aside
      className={`panel${sheet ? ' sheet' : ''}${open ? ' open' : ''}`}
      aria-label="나의 성단"
    >
      {/* 좁은 화면에서는 손잡이만 남기고 접힙니다 — 평소엔 하늘이 화면 전체 */}
      <header className="panelhead">
        {sheet && (
          <button
            className="grab"
            type="button"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={() => (swipe.current = null)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onToggle?.()
              }
            }}
            aria-expanded={open}
            aria-label={open ? '회고 접기' : '회고 펼치기'}
          >
            <span className="grip" />
          </button>
        )}
        <div className="paneltitle">
          <h2>나의 성단</h2>
          <p>
            {sheet && !open
              ? `잔별 ${count} · 온기 ${warmth} — 끌어올리면 회고`
              : '지금 하늘에는 내가 띄운 잔별만 밝혀져 있어요'}
          </p>
        </div>
        <button className="close static" onClick={onClose} aria-label="전체 은하로 돌아가기" title="전체 은하로">
          ×
        </button>
      </header>

      <div className="panelbody">
        {count === 0 ? (
          <p className="empty">
            아직 띄운 잔별이 없어요.
            <br />
            아래 입력창에 나의 이야기를 남겨보세요. 한 줄만이라도 충분해요.
          </p>
        ) : (
          <>
            <div className="figures">
              <div className="figure">
                <b>{count}</b>
                <span>띄운 잔별</span>
              </div>
              <div className="figure warm">
                <b>{warmth}</b>
                <span>받은 온기</span>
              </div>
              <div className="figure">
                <b>{starlight}</b>
                <span>이어진 별빛</span>
              </div>
            </div>

            {brightest && (
              <button className="brightest" onClick={() => onSelectStar(brightest.id)}>
                <span className="eyebrow">가장 밝은 잔별</span>
                <p>{brightest.text}</p>
                <em>
                  별거 아니라 생각한 이 한 줄이, {brightest.warmth}명의 밤을 비췄어요.
                </em>
              </button>
            )}

            {anniversaries.length > 0 && (
              <section className="block">
                <h3>작년 오늘의 별</h3>
                {anniversaries.map((s) => (
                  <button className="memory" key={s.id} onClick={() => onSelectStar(s.id)}>
                    <span className="eyebrow">{yearsAgo(s.createdAt)}년 전 오늘</span>
                    <p>{s.text}</p>
                  </button>
                ))}
              </section>
            )}

            <section className="block">
              <h3>감정의 궤적</h3>
              {topTag && (
                <p className="lede">
                  당신의 하늘엔 <b>‘{topTag.tag}’</b>
                  {subjectParticle(topTag.tag)} 가장 많았어요.
                </p>
              )}
              <ul className="bars">
                {tagRanking.slice(0, 6).map((t) => (
                  <li key={t.tag} title={`${t.tag} — 잔별 ${t.count}개`}>
                    <span className="barlabel">{t.tag}</span>
                    <span className="bartrack">
                      <span className="barfill" style={{ width: `${(t.count / maxTag) * 100}%` }} />
                    </span>
                    <span className="barvalue">{t.count}</span>
                  </li>
                ))}
              </ul>

              <div className="strip" role="img" aria-label="최근 12개월 동안 띄운 잔별 수">
                {months.map((m, i) => (
                  <div className="col" key={m.key} title={`${monthLabel(m.key)} — 잔별 ${m.count}개`}>
                    <span
                      className="colfill"
                      style={{ height: `${Math.max(2, (m.count / maxMonth) * 100)}%`, opacity: m.count ? 1 : 0.28 }}
                    />
                    <small>{i % 3 === 0 ? monthLabel(m.key) : ''}</small>
                  </div>
                ))}
              </div>
              <p className="axisnote">최근 12개월 · 한 칸이 한 달</p>
            </section>

            <section className="block">
              <h3>띄운 잔별</h3>
              <ul className="mylist">
                {data.mine.slice(0, 12).map((s) => (
                  <li key={s.id}>
                    <button onClick={() => onSelectStar(s.id)}>
                      <span>{s.text}</span>
                      <em>{relativeWhen(s.createdAt)}</em>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}

        {roadCount > 0 && (
          <footer className="panelfoot">
            <p>
              별길에 잔별 <b>{roadCount}</b>개. 읽은 순서대로 이어진 길이에요 — 나에게만 보입니다.
            </p>
            <button
              onClick={() => {
                if (window.confirm('별길을 지울까요? 띄운 잔별은 그대로 남습니다.')) onClearRoad?.()
              }}
            >
              별길 지우기
            </button>
          </footer>
        )}

        <footer className="panelfoot">
          <p>처음 오셨다면 예시 기록 몇 개가 함께 떠 있어요.</p>
          <button
            onClick={() => {
              if (window.confirm('하늘을 처음 상태로 되돌릴까요? 띄운 잔별이 모두 사라집니다.')) onReset()
            }}
          >
            하늘 비우기
          </button>
        </footer>

        {/* 맨 아래 — 내 기록을 다 돌아본 뒤에야 닿는 자리. 조용히, 그러나 편지처럼. */}
        {onWriteLetter && (
          <button className="letterinvite" type="button" onClick={onWriteLetter}>
            <span className="letterinvite-mark" aria-hidden="true" />
            <span className="letterinvite-text">
              <b>잔별을 만든 사람에게 전하고 싶은 이야기가 있나요?</b>
              <small>바라는 점, 함께하고 싶은 일, 무엇이든 편하게</small>
            </span>
            <span className="letterinvite-go">편지 쓰기</span>
          </button>
        )}
      </div>
    </aside>
  )
}
