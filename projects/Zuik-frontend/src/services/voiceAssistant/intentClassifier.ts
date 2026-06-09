import type { ParsedCommand, PageContext } from './commandTypes'
import { ALL_INTENT_PATTERNS } from './nlp/patterns'
import {
  extractAlgoAmount,
  extractAssetId,
  extractSettingsSection,
  extractTestIdReference,
  extractWorkflowName,
  normalizeCommandText,
  stripWakePhrase,
} from './nlp/textUtils'

const UNKNOWN_COMMAND: ParsedCommand = {
  intent: 'unknown',
  action: 'unknown',
  params: {},
  confidence: 0,
  rawText: '',
}

function buildParsedCommand(
  pattern: (typeof ALL_INTENT_PATTERNS)[number],
  match: RegExpMatchArray,
  rawText: string,
): ParsedCommand {
  const params = pattern.paramExtractor?.(match, rawText) ?? {}
  return {
    intent: pattern.intent,
    action: pattern.action,
    params,
    confidence: Math.min(1, pattern.score / 100),
    rawText,
  }
}

function classifyByHeuristics(cleanText: string, rawText: string): ParsedCommand | null {
  const section = extractSettingsSection(cleanText)
  if (section && /\b(?:settings|section|management)\b/i.test(cleanText)) {
    return {
      intent: 'navigation',
      action: 'go_settings_section',
      params: { section },
      confidence: 0.75,
      rawText,
    }
  }

  const assetId = extractAssetId(cleanText)
  if (assetId && /\b(?:show|open|view)\b/i.test(cleanText)) {
    return {
      intent: 'navigation',
      action: 'go_market_asset',
      params: { assetId },
      confidence: 0.7,
      rawText,
    }
  }

  const workflowName = extractWorkflowName(cleanText)
  if (workflowName && /\b(?:run|start|execute|open)\b/i.test(cleanText)) {
    return {
      intent: 'workflow',
      action: 'run_workflow',
      params: { workflowName },
      confidence: 0.72,
      rawText,
    }
  }

  const amount = extractAlgoAmount(cleanText)
  if (amount !== null && /\bfund\b/i.test(cleanText)) {
    return {
      intent: 'form',
      action: 'fund_agent',
      params: { amount },
      confidence: 0.72,
      rawText,
    }
  }

  const testId = extractTestIdReference(cleanText)
  if (testId) {
    return {
      intent: 'component',
      action: 'click_testid',
      params: { testId },
      confidence: 0.7,
      rawText,
    }
  }

  return null
}

export function classifyCommand(text: string, pageContext?: PageContext): ParsedCommand {
  const rawText = text.trim()
  if (!rawText) {
    return { ...UNKNOWN_COMMAND, rawText }
  }

  const cleanText = stripWakePhrase(rawText)
  const normalized = normalizeCommandText(cleanText)

  const scored = ALL_INTENT_PATTERNS.map((pattern) => ({
    ...pattern,
    match: normalized.match(pattern.pattern),
  })).filter((entry) => entry.match !== null) as Array<
    (typeof ALL_INTENT_PATTERNS)[number] & { match: RegExpMatchArray }
  >

  if (scored.length > 0) {
    scored.sort((a, b) => b.score - a.score)
    const best = scored[0]
    const parsed = buildParsedCommand(best, best.match, rawText)

    if (pageContext && !pageContext.availableIntents.includes(parsed.intent)) {
      parsed.confidence *= 0.85
    }

    return parsed
  }

  const heuristic = classifyByHeuristics(cleanText, rawText)
  if (heuristic) return heuristic

  return { ...UNKNOWN_COMMAND, rawText }
}

export function getSuggestions(pageContext: PageContext): string[] {
  const base = [
    'Open builder',
    'Show my dashboard',
    'Go to agent settings',
    'Set risk tolerance to 50',
    'What is my balance?',
  ]

  if (pageContext.pathname === '/builder') {
    return [
      'Run my workflow',
      'Open AI assistant',
      'Create a DCA workflow',
      'Switch to agent wallet mode',
      ...base.slice(0, 2),
    ]
  }

  if (pageContext.pathname === '/settings') {
    return [
      'Set risk tolerance to 50',
      'Fund agent with 2 ALGO',
      'Send 1 ALGO from my agent to an address',
      'Open risk settings',
      ...base.slice(2),
    ]
  }

  if (pageContext.walletConnected) {
    return [
      'Send 1 ALGO to a recipient address',
      'Fund agent with 2 ALGO',
      ...base,
    ]
  }

  return base
}
