export default function Toast({ message }) {
  return (
    <div className={`toast${message ? ' on' : ''}`} role="status">
      {message}
    </div>
  )
}
