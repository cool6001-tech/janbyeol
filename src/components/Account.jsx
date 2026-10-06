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
  // 이름은 한 번 정하면 끝 — 정한 뒤에는 이 자리에서 다시 묻지 않습니다
  const [name, setName] = useState(me.name || '나')
  const [draft, setDraft] = useState('')
  const [blocked, setBlocked] = useState([])

  useEffect(() => {
    setName(me.name || '나')
  }, [me.name])

  useEffect(() => {
    storage.blockedList().then(setBlocked).catch(() => {})
  }, [me.id])

  const saveName = async (e) => {
    e.preventDefault()
    if (!draft.trim()) return
    try {
      const saved = await rename(draft)
      setName(saved)
      onNotice?.(`이제 ‘${saved}’의 성단이에요`)
    } catch {
      onNotice?.('이름을 정하지 못했어요. 잠시 뒤에 다시 해주세요.')
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
  const named = Boolean(name) && name !== '나'

  /* 보여줄 것이 남았을 때만 상자를 띄웁니다.
     이름도 정했고 카카오/구글로도 이어졌다면, 이 상자는 할 일을 다 한 거예요. */
  if (named && !anonymous && blocked.length === 0) return null

  return (
    <section className="account">
      <span className="account-mark" aria-hidden="true" />

      <div className="account-body">
        {/* 이름 — 정하기 전까지만. 별빛을 이을 때 다른 사람에게 이 이름으로 보입니다 */}
        {!named && (
          <form className="acctnameask" onSubmit={saveName}>
            <h3>내 성단에 이름을 지어주세요</h3>
            <p className="acctfine">별빛을 이을 때 이 이름으로 보여요.</p>
            <div className="acctname">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={20}
                placeholder="예: 쿠리"
                aria-label="성단 이름"
              />
              <button type="submit" disabled={!draft.trim()}>
                정하기
              </button>
            </div>
          </form>
        )}

        {/* 아직 이 브라우저에만 있는 성단 — 잃을 수 있다는 사실과 지키는 길 */}
        {anonymous && (
          <div className="acctkeepwrap">
            <h3>이 성단을 지키는 일</h3>
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
              다른 기기에서 이미 지킨 성단이 있다면 같은 버튼을 누르세요.
              <br />
              원래 성단으로 들어가고, 이 기기에서 띄운 잔별도 함께 옮겨 담아요.
            </p>
          </div>
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
