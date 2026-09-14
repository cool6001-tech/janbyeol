/** 받침 유무에 따라 조사를 고른다 ('고독이' / '바다가') */
export function hasBatchim(word) {
  if (!word) return false
  const code = word.charCodeAt(word.length - 1)
  if (code < 0xac00 || code > 0xd7a3) return false
  return (code - 0xac00) % 28 !== 0
}

export function subjectParticle(word) {
  return hasBatchim(word) ? '이' : '가'
}

export function topicParticle(word) {
  return hasBatchim(word) ? '은' : '는'
}
