import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { sb } from '../lib/supabase.js'
import { ensureUser } from '../lib/storage.js'
import './admin.css'

/**
 * 트랙션 리포트 — janbyeol.com/admin
 * ---------------------------------------------------------------
 * 숫자는 모두 서버의 admin_report() 가 합계로만 돌려줍니다.
 * 이 화면은 누가 무엇을 했는지 목록을 받지 않습니다 — 받을 길 자체가 없어요.
 * 관리자 명단(admins)에 없는 계정이 열면 서버가 거절합니다.
 */

const PERIODS = [7, 30, 90]

const fmt = (n, digits = 0) =>
  n === null || n === undefined || Number.isNaN(n)
    ? '—'
    : Number(n).toLocaleString('ko-KR', { maximumFractionDigits: digits, minimumFractionDigits: 0 })
const pct = (a, b) => (b > 0 ? `${fmt((a / b) * 100, 1)}%` : '—')
const minutes = (m) => (m === null || m === undefined ? '—' : `${fmt(m, 1)}분`)

/* 날짜별 추이 — 지표 하나에 차트 하나 (한 축, 한 색) */
const SERIES = [
  { key: 'visitors', label: '방문자', unit: '명', avg: true },
  { key: 'new_users', label: '새 계정', unit: '개' },
  { key: 'authors', label: '별을 띄운 사람', unit: '명', avg: true },
  { key: 'stars', label: '띄운 별', unit: '개' },
  { key: 'warmths', label: '온기', unit: '번' },
  { key: 'replies', label: '별빛(답글)', unit: '개' },
  { key: 'daily_min_per_user', label: '사용자당 하루 체류', unit: '분', digits: 1, avg: true },
  { key: 'share_visits', label: '공유 링크 방문', unit: '번' },
]

export default function AdminReport() {
  const [days, setDays] = useState(30)
  const [state, setState] = useState({ status: 'loading' })
  const [showTable, setShowTable] = useState(false)

  useEffect(() => {
    document.title = '잔별 · 트랙션 리포트'
    document.body.classList.add('adminpage')
    // 검색에 잡히지 않게
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    return () => {
      document.body.classList.remove('adminpage')
      meta.remove()
    }
  }, [])

  const load = useCallback(async (d) => {
    setState((s) => ({ ...s, status: s.data ? 'refreshing' : 'loading' }))
    const me = await ensureUser()
    const { data, error } = await sb.rpc('admin_report', { p_days: d })
    if (error) {
      const denied = /not_admin/.test(error.message || '') || error.code === '42501'
      setState({ status: denied ? 'denied' : 'error', me, error })
      return
    }
    setState({ status: 'ready', me, data })
  }, [])

  useEffect(() => {
    load(days)
  }, [days, load])

  if (state.status === 'loading') return <Shell><p className="ad-muted">불러오는 중…</p></Shell>
  if (state.status === 'denied') return <Denied me={state.me} />
  if (state.status === 'error')
    return (
      <Shell>
        <p className="ad-muted">리포트를 불러오지 못했어요.</p>
        <pre className="ad-code">{state.error?.message}</pre>
        <p className="ad-muted">supabase/metrics.sql 을 SQL Editor 에서 실행했는지 확인해 주세요.</p>
      </Shell>
    )

  const r = state.data
  const t = r.totals
  const w = r.window

  return (
    <Shell
      right={
        <div className="ad-periods" role="group" aria-label="기간">
          {PERIODS.map((p) => (
            <button key={p} className={p === days ? 'on' : ''} onClick={() => setDays(p)}>
              최근 {p}일
            </button>
          ))}
          <button className="ad-refresh" onClick={() => load(days)} aria-label="새로고침">
            ↻
          </button>
        </div>
      }
    >
      <p className="ad-range">
        {r.from} ~ {r.to} (한국 시간)
        {state.status === 'refreshing' && <span className="ad-muted"> · 새로 불러오는 중…</span>}
      </p>

      {/* 전체 누적 */}
      <Section title="전체 누적" note="서비스를 연 뒤 지금까지">
        <Tile label="총 사용자(계정)" value={fmt(t.users)} sub="기기·브라우저마다 하나씩 생겨요" />
        <Tile label="별을 띄운 사람" value={fmt(t.authors)} sub={`전체의 ${pct(t.authors, t.users)}`} />
        <Tile label="띄운 별" value={fmt(t.stars)} sub={`온기 ${fmt(t.warmths)} · 별빛 ${fmt(t.replies)}`} />
        <Tile
          label="성단을 지킨 사람"
          value={fmt(t.linked)}
          sub={`카카오 ${fmt(t.linked_kakao)} · 구글 ${fmt(t.linked_google)}`}
        />
      </Section>

      <Section title="유입" note="얼마나 들어오나">
        <Tile label="방문자" value={fmt(w.visitors)} sub={`접속 ${fmt(w.sessions)}번`} />
        <Tile label="새 계정" value={fmt(w.new_users)} sub="처음 온 브라우저" />
      </Section>

      <Section title="활성화" note="들어온 사람이 실제로 써 보나 — 가장 중요">
        <Tile
          label="새로 온 사람 중 별을 띄운 비율"
          value={pct(w.new_users_activated, w.new_users)}
          sub={`${fmt(w.new_users_activated)} / ${fmt(w.new_users)}명`}
          strong
        />
      </Section>

      <Section title="참여" note="서로 반응이 오가나">
        <Tile label="하루 평균 띄운 별" value={fmt(w.stars / r.days, 1)} sub={`기간 합계 ${fmt(w.stars)}개`} />
        <Tile label="별 1개당 받은 온기" value={fmt(w.warmth_per_star, 2)} />
        <Tile label="별 1개당 별빛" value={fmt(w.replies_per_star, 2)} />
      </Section>

      <Section title="체류" note="한 번 들어오면 얼마나 머무나">
        <Tile label="한 번 접속 평균" value={minutes(w.avg_session_min)} sub={`중앙값 ${minutes(w.median_session_min)}`} />
        <Tile label="사용자당 하루 체류" value={minutes(w.daily_min_per_user)} sub="그날 들어온 사람 기준 평균" />
      </Section>

      <Section title="유지" note="다시 오나">
        <Tile
          label="이틀 이상 들어온 방문자"
          value={pct(w.returning_visitors, w.visitors)}
          sub={`${fmt(w.returning_visitors)} / ${fmt(w.visitors)}명`}
        />
        <Tile
          label="다른 날 또 별을 띄운 사람"
          value={pct(w.repeat_authors, w.authors)}
          sub={`${fmt(w.repeat_authors)} / ${fmt(w.authors)}명`}
        />
      </Section>

      <Section title="애착" note="계속 쓸 마음이 있나">
        <Tile label="성단을 지킨 비율" value={pct(t.linked, t.users)} sub="카카오·구글 연결 / 전체 계정" />
      </Section>

      <Section title="확산" note="밖으로 퍼지나">
        <Tile label="공유 링크로 들어온 수" value={fmt(w.share_visits)} sub="사람이 연 것만 (미리보기 수집기 제외)" />
        <Tile label="공식 계정 소개" value={fmt(w.featured)} sub={`누적 ${fmt(t.featured)}개`} />
      </Section>

      <section className="ad-section">
        <header className="ad-sechead">
          <h2>날짜별 추이</h2>
          <button className="ad-link" onClick={() => setShowTable((v) => !v)}>
            {showTable ? '차트로 보기' : '표로 보기'}
          </button>
        </header>
        {showTable ? (
          <DailyTable daily={r.daily} />
        ) : (
          <div className="ad-charts">
            {SERIES.map((s) => (
              <LineChart key={s.key} series={s} daily={r.daily} />
            ))}
          </div>
        )}
      </section>

      <footer className="ad-foot">
        <p>
          모든 숫자는 서버가 합계로만 계산해서 보내줍니다. 누가 무엇을 읽었는지는 기록하지 않으며,
          머문 시간 기록은 90일 뒤 지워집니다.
        </p>
        <p>
          ‘사용자’와 ‘방문자’는 사람이 아니라 <b>브라우저</b> 기준이에요 — 한 사람이 폰과 PC로 오면 둘로 셉니다.
          체류 시간은 이 기능을 배포한 뒤부터 쌓입니다
          {r.sessions_since ? ` (첫 기록: ${String(r.sessions_since).slice(0, 10)})` : ' (아직 기록 없음)'}.
        </p>
      </footer>
    </Shell>
  )
}

function Shell({ children, right }) {
  return (
    <main className="ad">
      <header className="ad-top">
        <div>
          <a className="ad-brand" href="/">
            잔별
          </a>
          <h1>트랙션 리포트</h1>
        </div>
        {right}
      </header>
      {children}
    </main>
  )
}

function Section({ title, note, children }) {
  return (
    <section className="ad-section">
      <header className="ad-sechead">
        <h2>{title}</h2>
        {note && <span className="ad-muted">{note}</span>}
      </header>
      <div className="ad-tiles">{children}</div>
    </section>
  )
}

function Tile({ label, value, sub, strong }) {
  return (
    <div className={`ad-tile${strong ? ' strong' : ''}`}>
      <span className="ad-tile-label">{label}</span>
      <b className="ad-tile-value">{value}</b>
      {sub && <span className="ad-tile-sub">{sub}</span>}
    </div>
  )
}

/* ---------------- 꺾은선 — 한 지표, 한 축, 가는 선, 마우스를 올리면 그날 값 ---------------- */
function LineChart({ series, daily }) {
  const W = 320
  const H = 120
  const pad = { l: 30, r: 10, t: 12, b: 20 }
  const values = daily.map((d) => (d[series.key] === null ? null : Number(d[series.key])))
  const max = Math.max(1, ...values.filter((v) => v !== null))
  const niceMax = niceCeil(max)
  const x = (i) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, daily.length - 1)
  const y = (v) => pad.t + (1 - v / niceMax) * (H - pad.t - pad.b)
  const [hover, setHover] = useState(null)
  const svgRef = useRef(null)

  const path = useMemo(() => {
    let d = ''
    let pen = false
    values.forEach((v, i) => {
      if (v === null) {
        pen = false
        return
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
      pen = true
    })
    return d
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daily, series.key, niceMax])

  const total = values.reduce((a, v) => a + (v || 0), 0)

  const onMove = (e) => {
    const rect = svgRef.current.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (daily.length - 1))
    setHover(Math.max(0, Math.min(daily.length - 1, i)))
  }

  const hv = hover !== null ? values[hover] : null

  return (
    <figure className="ad-chart">
      <figcaption>
        <span>{series.label}</span>
        <b>
          {/* 사람 수·시간은 날마다 더하면 같은 사람이 여러 번 세어지므로 '하루 평균'으로 */}
          {series.avg
            ? `하루 평균 ${avgOf(values) === null ? '—' : fmt(avgOf(values), 1) + series.unit}`
            : `합계 ${fmt(total)}${series.unit}`}
        </b>
      </figcaption>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${series.label} 날짜별 추이`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line className="ad-grid" x1={pad.l} x2={W - pad.r} y1={y(niceMax * f)} y2={y(niceMax * f)} />
            <text className="ad-axis" x={pad.l - 6} y={y(niceMax * f) + 3} textAnchor="end">
              {fmt(niceMax * f, niceMax <= 5 ? 1 : series.digits || 0)}
            </text>
          </g>
        ))}
        <text className="ad-axis" x={pad.l} y={H - 4}>
          {shortDate(daily[0]?.day)}
        </text>
        <text className="ad-axis" x={W - pad.r} y={H - 4} textAnchor="end">
          {shortDate(daily[daily.length - 1]?.day)}
        </text>
        <path className="ad-line" d={path} />
        {hover !== null && (
          <g>
            <line className="ad-cross" x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} />
            {hv !== null && <circle className="ad-dot" cx={x(hover)} cy={y(hv)} r="4" />}
          </g>
        )}
      </svg>
      {hover !== null && (
        <div className="ad-tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <span>{daily[hover].day}</span>
          <b>{hv === null ? '기록 없음' : `${fmt(hv, series.digits || 0)}${series.unit}`}</b>
        </div>
      )}
    </figure>
  )
}

function DailyTable({ daily }) {
  return (
    <div className="ad-tablewrap">
      <table className="ad-table">
        <thead>
          <tr>
            <th>날짜</th>
            {SERIES.map((s) => (
              <th key={s.key}>{s.label}</th>
            ))}
            <th>한 번 접속 평균</th>
          </tr>
        </thead>
        <tbody>
          {[...daily].reverse().map((d) => (
            <tr key={d.day}>
              <td>{d.day}</td>
              {SERIES.map((s) => (
                <td key={s.key}>{d[s.key] === null ? '—' : fmt(d[s.key], s.digits || 0)}</td>
              ))}
              <td>{d.avg_session_min === null ? '—' : fmt(d.avg_session_min, 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Denied({ me }) {
  const id = me?.id || '(아직 계정이 없어요 — 새로고침해 보세요)'
  const sql = `insert into public.admins (user_id) values ('${me?.id || ''}') on conflict do nothing;`
  const [copied, setCopied] = useState(false)
  return (
    <Shell>
      <section className="ad-section">
        <h2 className="ad-h2">관리자로 등록된 계정이 아니에요</h2>
        <p className="ad-muted">
          이 브라우저의 계정 ID 는 아래와 같아요. 평소 쓰는 기기에서, 카카오·구글로 성단을 지킨 상태로 연 게 맞는지 먼저 확인해 주세요.
          {me?.isAnonymous !== false && ' (지금은 아직 연결하지 않은 익명 계정이에요 — 이 계정을 등록하면 이 브라우저에서만 리포트가 열립니다)'}
        </p>
        <pre className="ad-code">{id}</pre>
        <p className="ad-muted">Supabase → SQL Editor 에서 아래 한 줄을 실행하면 이 계정이 관리자가 됩니다.</p>
        <pre className="ad-code">{sql}</pre>
        <button
          className="ad-btn"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(sql)
              setCopied(true)
            } catch {
              /* 무시 */
            }
          }}
        >
          {copied ? '복사했어요' : 'SQL 복사'}
        </button>
      </section>
    </Shell>
  )
}

function niceCeil(v) {
  if (v <= 5) return 5
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / p
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return step * p
}

function shortDate(s) {
  if (!s) return ''
  const [, m, d] = String(s).split('-')
  return `${Number(m)}/${Number(d)}`
}

function avgOf(values) {
  const v = values.filter((x) => x !== null)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}
