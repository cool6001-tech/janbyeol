/**
 * 좌표와 투영
 * ---------------------------------------------------------------
 * 설계 결정: 별의 좌표는 "띄우는 순간 한 번 정해서 저장"합니다.
 * 매번 다시 계산하면 글이 늘 때마다 은하가 재배치되고,
 * '내 별은 늘 그 자리에 있다'는 감각이 사라집니다.
 * 하늘이 곧 기억의 지형이 되려면 좌표가 기록의 일부여야 합니다.
 */

/* 어느 자리에 놓을지는 galaxy.js가 정합니다 (나선 팔 · 중심 핵 · 먼지 띠).
   이 파일은 그 자리를 화면으로 옮기는 일만 합니다. */

/** 렌즈의 초점거리. 화면에 담을 거리를 계산할 때도 같은 값을 씁니다. */
export const FOCAL = 820

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

/**
 * 3D 좌표 → 화면 좌표
 * 카메라는 target을 바라보며 yaw/pitch로 공전하고 dist만큼 떨어져 있다.
 *
 * cam.ox / cam.oy 는 화면의 중심을 옮깁니다. 아래에서 시트가 화면을 가리면
 * 그만큼 하늘의 중심을 위로 올려야 별이 시트 뒤에 숨지 않습니다.
 */
export function project(point, cam, width, height) {
  const dx = point.x - cam.tx
  const dy = point.y - cam.ty
  const dz = point.z - cam.tz

  const cy = Math.cos(cam.yaw)
  const sy = Math.sin(cam.yaw)
  const x1 = dx * cy - dz * sy
  const z1 = dx * sy + dz * cy

  const cp = Math.cos(cam.pitch)
  const sp = Math.sin(cam.pitch)
  const y2 = dy * cp - z1 * sp
  const z2 = dy * sp + z1 * cp + cam.dist

  if (z2 < 60) return null
  const k = cam.focal / z2
  return {
    sx: width / 2 + (cam.ox || 0) + x1 * k,
    sy: height / 2 + (cam.oy || 0) - y2 * k,
    k,
    z: z2,
  }
}

/**
 * 반지름 radius 만큼의 무리가 화면의 margin(px) 안에 들어오려면
 * 카메라가 얼마나 떨어져 있어야 하는가.
 */
export function distanceToFit(radius, margin, focal = FOCAL) {
  return (radius * focal) / Math.max(1, margin)
}

/**
 * 끌려온 별이 잠시 머무는 궤도 위의 자리.
 * 고리를 완전한 원으로 두면 기계처럼 보여서, 높이와 반지름을 조금씩 흔듭니다.
 */
export function orbitSlot(center, index, total, radius, seed = 0) {
  const n = Math.max(1, total)
  const angle = (index / n) * Math.PI * 2 + seed
  const wobble = 0.86 + ((index * 37) % 28) / 100
  const r = radius * wobble
  const lift = (((index * 53) % 100) - 50) / 50
  return {
    x: center.x + Math.cos(angle) * r,
    y: center.y + lift * radius * 0.26,
    z: center.z + Math.sin(angle) * r,
  }
}
