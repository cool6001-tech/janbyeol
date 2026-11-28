import { useEffect, useState } from 'react'
import { visitorLink } from '../data/visitors.js'
import { countVisitorEvent } from '../lib/visitorStats.js'

/**
 * 손님별 소개 시트
 * ---------------------------------------------------------------
 * 혜성을 누르면 바로 다른 사이트로 데려가지 않습니다.
 * 먼저 어떤 손님인지 잔별의 말투로 소개하고, 바깥으로 나간다는 걸 분명히 알린 뒤
 * 건너갈지는 보는 사람이 정해요. (앱에서는 native.js 가 바깥 링크를 브라우저 시트로 엽니다)
 */
export default function VisitorSheet({ visitor, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const [artOk, setArtOk] = useState(true)

  if (!visitor) return null
  const s = visitor.sheet
  const [hr, hg, hb] = visitor.head
  const [tr, tg, tb] = visitor.tail

  return (
    <div
      className="contactveil"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <section
        className="contactsheet visitorsheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="visitor-title"
        style={{ '--v-head': `${hr},${hg},${hb}`, '--v-tail': `${tr},${tg},${tb}` }}
      >
        {visitor.art && artOk && <VisitorArt art={visitor.art} onError={() => setArtOk(false)} />}
        <span className="grip" aria-hidden="true" />
        <button className="close" type="button" onClick={onClose} aria-label="닫기">
          ×
        </button>
        <div className="vs-body">
          <div className="vs-mark" aria-hidden="true">
            <span className="vs-tail" />
            <span className="vs-head" />
          </div>
          <p className="vs-eyebrow">
            {s.eyebrow} · {visitor.name}
          </p>
          <p className="cm-lede vs-title" id="visitor-title">
            {s.title}
          </p>
          {s.body.map((line, i) => (
            <p className="cm-sub" key={i}>
              {line}
            </p>
          ))}
          <a
            className="vs-go"
            href={visitorLink(visitor)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              countVisitorEvent(visitor.id, 'go') // 관리자 리포트 — 잔별이 보내준 유입
              setTimeout(onClose, 300)
            }}
          >
            {s.cta} <span aria-hidden="true">↗</span>
          </a>
          <p className="vs-note">{s.note}</p>
        </div>
      </section>
    </div>
  )
}

/**
 * 시트 윗변에 걸터앉는 파트너 그림.
 * 원본 그림 전체를 불러와 crop 영역만 보이게 잘라 둡니다 (따로 파일을 만들 필요가 없어요).
 * 그림을 못 불러오면(주소가 바뀌는 등) 조용히 사라지고, 시트는 그대로 보입니다.
 */
function VisitorArt({ art, onError }) {
  const [x, y, w, h] = art.crop
  const k = art.width / w
  return (
    <div className="vs-art" style={{ width: art.width, height: Math.round(h * k) }}>
      <img
        src={art.src}
        alt={art.alt || ''}
        draggable="false"
        onError={onError}
        style={{
          width: Math.round(art.size[0] * k),
          height: Math.round(art.size[1] * k),
          left: -Math.round(x * k),
          top: -Math.round(y * k),
        }}
      />
    </div>
  )
}
