import { useEffect, useState } from 'react'
import { keepMyConstellation, rename, deleteAccount } from '../lib/account.js'
import { storage } from '../lib/storage.js'

/**
 * 이 성단을 지키는 일
 * ---------------------------------------------------------------
 * 로그인 화면은 끝내 만들지 않았습니다. 처음 온 사람은 아무것도 누르지 않고
 * 별을 띄웁니다. 다만 그 계정은 이 브라우저에만 묶여 있어서, 폰을 바꾸면
 * 성단을 잃어요. 그 사실을 조용히 알려주고, 원하는 사람만 이어 붙입니다.
 *
 * '로그인'이라는 말을 쓰지 않은 건 의도입니다. 여기서 일어나는 일은
 * 가입이 아니라 **지키기**라서요.
 *
 * 내보내는 것이 둘입니다.
 *   Account        — 성단 위쪽의 상자 (이름 · 성단 지키기 · 차단 목록)
 *   AccountFooter  — 맨 아래 조용한 줄 (약관 · 방침 · 계정 지우기)
 *
 * 계정 지우기를 아래로 내린 이유: 평생 한 번 누를까 말까 한 버튼이
 * 매번 눈에 먼저 들어올 이유가 없습니다. 찾을 수 있으면 충분해요.
 */
export default function Account({ me, onNotice }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(me.name || '나')
  const [blocked, setBlocked] = useState([])

  useEffect(() => {
    setDraft(me.name || '나')
  }, [me.name])

  useEffect(() => {
    storage.blockedList().then(setBlocked).catch(() => {})
  }, [me.id])

  const saveName = async (e) => {
    e.preventDefault()
    try {
      const name = await rename(draft)
      setEditing(false)
      onNotice?.(`이제 ${name}(으)로 불릴게요`)
    } catch {
      onNotice?.('이름을 바꾸지 못했어요')
    }
  }

  const keep = async (provider) => {
    try {
      await keepMyConstellation(provider)
    } catch {
      onNotice?.('지금은 연결하지 못했어요. 잠시 뒤에 다시 해주세요.')
    }
  }

  const unblock = async (user) => {
    await storage.unblock(user.id)
    setBlocked((prev) => prev.filter((b) => b.id !== user.id))
    onNotice?.('다시 이 사람의 잔별이 보입니다. 새로고침하면 하늘에 떠요.')
  }

  const anonymous = me.isAnonymous !== false

  return (
    <section className="account">
      <span className="account-mark" aria-hidden="true" />

      <div className="account-body">
        <h3>이 성단을 지키는 일</h3>

        {/* 이름 */}
        {editing ? (
          <form className="acctname" onSubmit={saveName}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={20}
              aria-label="불릴 이름"
              autoFocus
            />
            <button type="submit">저장</button>
          </form>
        ) : (
          <p className="acctline">
            지금은 <b>{me.name || '나'}</b>로 불리고 있어요.
            <button className="acctlink" onClick={() => setEditing(true)}>
              바꾸기
            </button>
          </p>
        )}

        {/* 익명이면 — 잃을 수 있다는 사실부터 */}
        {anonymous ? (
          <>
            <p className="acctnote">
              지금 이 성단은 이 브라우저에만 있어요.
              <br />
              폰을 바꾸거나 기록을 지우면 띄운 잔별이 사라집니다.
            </p>
            <div className="acctkeep">
              <button onClick={() => keep('kakao')}>카카오로 내 성단 지키기</button>
              <button onClick={() => keep('google')}>구글로 지키기</button>
            </div>
            <p className="acctfine">
              새 계정을 만드는 게 아니라, 지금 성단에 이어 붙이는 거예요.
              <br />
              띄운 잔별은 하나도 잃지 않습니다.
            </p>
            <p className="acctfine">
              다른 기기에서 이미 지킨 성단이 있다면, 그때 쓴 버튼을 똑같이 누르세요.
              <br />
              원래 성단으로 들어가고, 이 기기에서 띄운 잔별도 함께 옮겨 담아요.
            </p>
          </>
        ) : (
          <p className="acctnote">
            이 성단은 안전하게 이어져 있어요. 다른 기기에서도 그대로 열립니다.
          </p>
        )}

        {/* 그만 보기로 한 사람들 */}
        {blocked.length > 0 && (
          <div className="acctblocked">
            <p className="acctline">그만 보기로 한 사람 {blocked.length}명</p>
            <ul>
              {blocked.map((b) => (
                <li key={b.id}>
                  <span>{b.name}</span>
                  <button className="acctlink" onClick={() => unblock(b)}>
                    다시 보기
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * 맨 아래 조용한 줄.
 * 떠나는 문도 있어야 하지만(애플 5.1.1v · 개인정보 삭제 요구권),
 * 그 문이 제일 먼저 보일 필요는 없습니다.
 */
export function AccountFooter({ onNotice }) {
  const remove = async () => {
    if (
      !window.confirm(
        '계정을 지울까요?\n\n' +
          '띄운 잔별과 전한 온기, 올린 사진이 모두 사라지고 되돌릴 수 없습니다.\n\n' +
          '별 하나만 내리고 싶다면, 그 별을 열어 「이 별 거두기」를 쓰세요.'
      )
    )
      return
    try {
      await deleteAccount()
      window.location.reload()
    } catch {
      onNotice?.('지금은 지우지 못했어요. 잠시 뒤에 다시 해주세요.')
    }
  }

  return (
    <p className="acctlegal">
      <a href="/terms.html" target="_blank" rel="noreferrer">
        이용약관
      </a>
      <span aria-hidden="true">·</span>
      <a href="/privacy.html" target="_blank" rel="noreferrer">
        개인정보처리방침
      </a>
      <span aria-hidden="true">·</span>
      <button type="button" onClick={remove}>
        계정 지우기
      </button>
    </p>
  )
}
