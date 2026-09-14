export default function Welcome({ gone }) {
  return (
    <div className={`welcome${gone ? ' gone' : ''}`} aria-hidden={gone}>
      <p>
        눈부시게 화려하지 않아도 괜찮아요.
        <br />
        우리는 모두 서로를 은은하게 비추는 잔별이니까요.
      </p>
      <small>별 하나를 눌러보세요</small>
    </div>
  )
}
