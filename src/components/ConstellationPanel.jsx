import { monthLabel, relativeWhen, yearsAgo } from '../lib/time.js'
import { subjectParticle } from '../lib/korean.js'

/**
 * 나의 성단 — 저장된 기록이 회고가 되는 화면
 * 차트는 한 가지 색만 씁니다. 길이가 크기를 말하니 색까지 일할 필요가 없어요.
 */
export default function ConstellationPanel({ data, onClose, onSelectStar, onReset }) {
  const { count, warmth, starlight, tagRanking, months, brightest, anniversaries } = data
  const maxTag = Math.max(1, ...tagRanking.map((t) => t.count))
  const maxMonth = Math.max(1, ...months.map((m) => m.count))
  const topTag = tagRanking[0]

  return (
    <aside className="panel" aria-label="나의 성단">
      <header className="panelhead">
        <div>
          <h2>나의 성단</h2>
          <p>지금 하늘에는 내가 띄운 잔별만 밝혀져 있어요</p>
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
            아래 입력창에 오늘의 한 줄을 남겨보세요.
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
      </div>
    </aside>
  )
}
