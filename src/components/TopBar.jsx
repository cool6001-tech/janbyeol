/**
 * 두 버튼은 같은 우주를 보는 두 시점입니다.
 * 지금 어느 시점인지가 눈에 보이도록 켜진 쪽을 표시합니다.
 */
export default function TopBar({ clusterCount, mineMode, onToggleMine, onCosmos, onHelp }) {
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
        {/* 첫 안내를 다시 보는 자리 — 눈에 띄지 않게, 그러나 늘 같은 곳에 */}
        {onHelp && (
          <button className="helpbtn" onClick={onHelp} aria-label="잔별 안내 다시 보기" title="안내 다시 보기">
            ?
          </button>
        )}
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
