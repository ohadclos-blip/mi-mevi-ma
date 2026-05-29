const NICKNAME_KEY = (eventId: string) => `mmm_nickname_${eventId}`
const CLAIMS_KEY   = (eventId: string) => `mmm_claims_${eventId}`

export function getNickname(eventId: string): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(NICKNAME_KEY(eventId))
}

export function setNickname(eventId: string, nickname: string): void {
  localStorage.setItem(NICKNAME_KEY(eventId), nickname)
}

export function getClaimedItems(eventId: string): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(CLAIMS_KEY(eventId)) ?? '{}')
  } catch { return {} }
}

export function addClaimedItem(eventId: string, itemId: string, claimId: string): void {
  const claims = getClaimedItems(eventId)
  claims[itemId] = claimId
  localStorage.setItem(CLAIMS_KEY(eventId), JSON.stringify(claims))
}

export function removeClaimedItem(eventId: string, itemId: string): void {
  const claims = getClaimedItems(eventId)
  delete claims[itemId]
  localStorage.setItem(CLAIMS_KEY(eventId), JSON.stringify(claims))
}

export function getAllEventIdsWithClaims(): string[] {
  if (typeof window === 'undefined') return []
  return Object.keys(localStorage)
    .filter(k => k.startsWith('mmm_claims_'))
    .map(k => k.replace('mmm_claims_', ''))
    .filter(eventId => Object.keys(getClaimedItems(eventId)).length > 0)
}
