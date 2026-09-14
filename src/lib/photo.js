/**
 * 예시 사진 생성
 * ---------------------------------------------------------------
 * 예시 잔별의 사진은 외부 이미지를 불러오지 않고 캔버스로 그립니다.
 * 씨앗(seed) 숫자만 저장해두면 언제 열어도 같은 그림이 나오므로
 * 저장 공간에는 숫자 하나만 들어갑니다.
 * (사용자가 직접 올린 사진은 photo 필드에 그대로 보관됩니다.)
 */

const cache = new Map()

function seededRandom(seed) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

export function generatePhoto(seed) {
  if (cache.has(seed)) return cache.get(seed)

  const r = seededRandom(seed * 977 + 13)
  const c = document.createElement('canvas')
  c.width = 360
  c.height = 220
  const g = c.getContext('2d')

  const hues = [212, 226, 258, 198, 282, 20]
  const h0 = hues[Math.floor(r() * hues.length)]
  const h1 = h0 + (r() * 46 - 23)

  const bg = g.createLinearGradient(0, 0, 360 * (0.4 + r() * 0.6), 220)
  bg.addColorStop(0, `hsl(${h0},38%,17%)`)
  bg.addColorStop(1, `hsl(${h1},30%,6%)`)
  g.fillStyle = bg
  g.fillRect(0, 0, 360, 220)

  g.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 5; i++) {
    const x = r() * 360
    const y = r() * 220
    const rad = 50 + r() * 140
    const rg = g.createRadialGradient(x, y, 0, x, y, rad)
    rg.addColorStop(0, `hsla(${h0 + r() * 70 - 35},60%,${38 + r() * 22}%,${0.14 + r() * 0.2})`)
    rg.addColorStop(1, `hsla(${h1},50%,20%,0)`)
    g.fillStyle = rg
    g.beginPath()
    g.arc(x, y, rad, 0, Math.PI * 2)
    g.fill()
  }

  g.globalCompositeOperation = 'source-over'
  for (let j = 0; j < 3; j++) {
    g.fillStyle = `rgba(4,6,12,${0.16 + r() * 0.2})`
    g.fillRect(0, 110 + r() * 110, 360, 10 + r() * 40)
  }

  g.globalCompositeOperation = 'lighter'
  for (let k = 0; k < 900; k++) {
    g.fillStyle = `rgba(190,205,240,${r() * 0.05})`
    g.fillRect(r() * 360, r() * 220, 1, 1)
  }

  const url = c.toDataURL('image/jpeg', 0.72)
  cache.set(seed, url)
  return url
}

/** 별이 실제로 보여줄 이미지 (올린 사진 우선, 없으면 예시 생성) */
export function photoOf(star) {
  if (star.photo) return star.photo
  if (star.photoSeed) return generatePhoto(star.photoSeed)
  return null
}

export function hasPhoto(star) {
  return Boolean(star.photo || star.photoSeed)
}
