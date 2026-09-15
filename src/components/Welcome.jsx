/**
 * 첫 화면의 두 마디.
 *
 * 문구와 안내는 한 덩어리처럼 보이지만 **따로 떠 있습니다.**
 * 좁은 화면에서는 은하가 화면 한가운데를 차지해서, 그 위에 글자를 올리면
 * 아무리 밝게 해도 읽히지 않아요. 그래서 문구는 은하 위로, 안내는 은하 아래로
 * 비켜 세웁니다. 그 자리는 App이 은하의 실제 화면상 크기에서 계산해 넘겨줍니다.
 */
export default function Welcome({ gone, layout }) {
  const cls = gone ? ' gone' : ''
  return (
    <>
      <div
        className={`welcome${cls}`}
        style={layout ? { top: `${layout.textTop}px` } : undefined}
        aria-hidden={gone}
      >
        <p>
          눈부시게 화려하지 않아도 괜찮아요.
          <br />
          우리는 모두 서로를 은은하게 비추는 잔별이니까요.
        </p>
      </div>

      <div
        className={`hint${cls}`}
        style={layout ? { top: `${layout.hintTop}px` } : undefined}
        aria-hidden={gone}
      >
        <small>별 하나를 눌러보세요</small>
      </div>
    </>
  )
}
