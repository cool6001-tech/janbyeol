import { useRef } from 'react'
import { relativeWhen, yearsAgo } from '../lib/time.js'
import { subjectParticle } from '../lib/korean.js'
import Account, { AccountFooter } from './Account.jsx'
import { isFeatureOnce } from '../lib/policy.js'

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
  roadCount = 0,
  onClearRoad,
  onContact,
  me,
  onNotice,
  featurePref,
  onFeaturePref,
}) {
  const { count, warmth, starlight, tagRanking, brightest, anniversaries } = data
  const maxTag = Math.max(1, ...tagRanking.map((t) => t.count))
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
      {/* 접혀 있을 땐 손잡이뿐 아니라 제목 줄 어디를 눌러도 펼쳐집니다.
          손잡이(38px)만 눌리던 때는 '나의 성단' 글자를 눌러도 반응이 없어 못 찾는 분이 많았어요. */}
      <header
        className="panelhead"
        onClick={(e) => {
          if (!sheet || open) return
          if (e.target.closest('.grab, .close')) return
          onToggle?.()
        }}
      >
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
              ? `잔별 ${count} · 온기 ${warmth} — 눌러서 내 잔별 보기`
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
            </section>

            {/* 이 패널의 주인공 — 내가 띄운 잔별. 한 장 한 장 카드로, 내 별의 색(호박빛)으로 */}
            <section className="block mystars">
              <h3>띄운 잔별</h3>
              <ul className="mylist">
                {data.mine.slice(0, 12).map((s) => (
                  <li key={s.id}>
                    <button onClick={() => onSelectStar(s.id)}>
                      <i className="mylist-mark" aria-hidden="true" />
                      <span className="mylist-text">{s.text}</span>
                      <em>{relativeWhen(s.createdAt)}</em>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}

        {/* 공식 계정 소개 — 처음 띄울 때 한 번 고른 것을 여기서 언제든 바꿉니다 (약관 제9조) */}
        {onFeaturePref && featurePref !== undefined && isFeatureOnce() && (
          <section className="block featurepref">
            <h3>공식 계정 소개</h3>
            <label className="featuretoggle">
              <input
                type="checkbox"
                checked={featurePref === true}
                onChange={async (e) => {
                  const on = e.target.checked
                  try {
                    await onFeaturePref(on)
                    onNotice?.(
                      on
                        ? '앞으로 띄우는 잔별은 공식 계정에 소개될 수 있어요'
                        : '소개 허락을 거뒀어요. 지금까지 허락한 잔별도 모두 거뒀어요.'
                    )
                  } catch {
                    onNotice?.('지금은 바꾸지 못했어요. 잠시 뒤에 다시 해주세요.')
                  }
                }}
              />
              <span>앞으로 띄우는 잔별을 잔별 공식 계정에 소개해도 좋아요</span>
            </label>
            <p className="featurepref-note">
              이름 없이 글과 온기 수만 실립니다. 끄면 지금까지 허락한 잔별도 모두 거둬요.
            </p>
          </section>
        )}

        {me && <Account me={me} onNotice={onNotice} />}

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

        {/* '내 잔별 거두기'(전부 지우기)는 뺐습니다.
            이제 별 하나하나를 그 카드에서 거둘 수 있으니, 여기 또 두면
            "전부 지우기"가 먼저 눈에 띄는 패널이 됩니다.
            계정까지 통째로 지우는 길은 맨 아래 AccountFooter 에 남아 있습니다. */}

        {/* 맨 아래 — 내 기록을 다 돌아본 뒤에야 닿는 자리. 조용히, 그러나 편지처럼. */}
        {onContact && (
          <button className="contactinvite" type="button" onClick={onContact}>
            <span className="contactinvite-text">잔별을 만든 사람에게 전하고 싶은 이야기가 있나요?</span>
            <span className="contactinvite-go">메일 주소 보기</span>
          </button>
        )}

        {me && <AccountFooter onNotice={onNotice} />}
      </div>
    </aside>
  )
}
