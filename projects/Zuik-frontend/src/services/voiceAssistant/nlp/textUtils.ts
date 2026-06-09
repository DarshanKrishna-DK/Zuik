/**
 * Lightweight NLP helpers for rule-based intent classification.
 */

export function normalizeCommandText(text: string): string {
  return text
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[^\w\s.'/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function stripWakePhrase(text: string): string {
  return normalizeCommandText(text)
    .replace(/^(hey\s+)?(zuik|zuke|zoik|zwick)\s*,?\s*/i, '')
    .trim()
}

export function containsAny(haystack: string, needles: string[]): boolean {
  const normalized = normalizeCommandText(haystack)
  return needles.some((needle) => normalized.includes(needle))
}

export function matchesPattern(text: string, pattern: RegExp): RegExpMatchArray | null {
  return normalizeCommandText(text).match(pattern)
}

export function extractFirstNumber(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)/)
  if (!match) return null
  const value = Number.parseFloat(match[1])
  return Number.isFinite(value) ? value : null
}

export function extractAlgoAmount(text: string): number | null {
  const algoMatch = text.match(/(\d+(?:\.\d+)?)\s*algo/i)
  if (algoMatch) {
    return Number.parseFloat(algoMatch[1])
  }
  return extractFirstNumber(text)
}

/** Extract a base32 Algorand address (58 chars) from spoken or pasted text. */
export function extractAlgorandAddress(text: string): string | null {
  const match = text.match(/\b([A-Za-z2-7]{58})\b/)
  return match?.[1] ?? null
}

export function extractAssetId(text: string): string | null {
  const match = text.match(/\b(?:asset|token)\s*(?:id\s*)?[#:]?\s*(\d+|cg:[\w-]+)\b/i)
  if (match) return match[1]
  const bare = text.match(/\b(\d{5,})\b/)
  return bare ? bare[1] : null
}

export function extractWorkflowName(text: string): string | null {
  const patterns = [
    /(?:run|start|open)\s+(?:my\s+)?(?:the\s+)?(.+?)\s+(?:strategy|workflow|bot)\b/i,
    /(?:run|start)\s+(?:my\s+)?(.+?)$/i,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) {
      const name = match[1].trim()
      if (name.length > 1 && !/^(a|the|my)$/i.test(name)) {
        return name
      }
    }
  }
  return null
}

export function extractSettingsSection(text: string): string | null {
  if (containsAny(text, ['account settings', 'my account', 'wallet settings'])) return 'account'
  if (containsAny(text, ['agent', 'guardian', 'automation', 'agent wallet'])) return 'agents'
  if (containsAny(text, ['risk', 'tolerance', 'token safety'])) return 'risk'
  if (containsAny(text, ['telegram', 'notification', 'notifications'])) return 'telegram'
  return null
}

export function extractTestIdReference(text: string): string | null {
  const match = text.match(/(?:testid|test id|data-testid)\s+([\w-]+)/i)
  return match?.[1] ?? null
}

export function pickBestMatch<T extends { pattern: RegExp; score: number }>(
  text: string,
  candidates: T[],
): (T & { match: RegExpMatchArray }) | null {
  const normalized = normalizeCommandText(text)
  let best: (T & { match: RegExpMatchArray }) | null = null

  for (const candidate of candidates) {
    const match = normalized.match(candidate.pattern)
    if (!match) continue
    if (!best || candidate.score > best.score) {
      best = { ...candidate, match }
    }
  }

  return best
}
