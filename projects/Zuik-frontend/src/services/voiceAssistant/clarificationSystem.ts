import type { ParsedIntent } from '../intentParser'
import type { ParsedCommand } from './commandTypes'
import type { PageContext } from './commandTypes'

export type AmbiguityKind =
  | 'missing_param'
  | 'multiple_targets'
  | 'low_confidence'
  | 'vague_intent'
  | 'settings_section'
  | 'workflow_target'

export interface ClarificationSession {
  originalRequest: string
  question: string
  attemptCount: number
  kind?: AmbiguityKind
  options?: string[]
  missingFields?: string[]
}

const CLARIFICATION_MARKERS =
  /\?|please confirm|which one|clarify|not sure|could you specify|provide the|what (?:asset|token|amount|interval|section|workflow)/i

const LOW_CONFIDENCE_THRESHOLD = 0.6
const COMMAND_AMBIGUITY_THRESHOLD = 0.55

const VAGUE_PATTERNS =
  /\b(?:something|stuff|that thing|do it|help me|fix it|change it|update it|run it|stop it)\b/i

const SETTINGS_AMBIGUOUS =
  /\b(?:settings|preferences|configuration)\b/i

const WORKFLOW_AMBIGUOUS =
  /\b(?:workflow|strategy|agent|run|stop|pause)\b/i

export class ClarificationStore {
  private pending: ClarificationSession | null = null

  hasPending(): boolean {
    return this.pending !== null
  }

  getPending(): ClarificationSession | null {
    return this.pending ? { ...this.pending } : null
  }

  setPending(session: ClarificationSession): void {
    this.pending = { ...session }
  }

  clear(): void {
    this.pending = null
  }

  incrementAttempt(): void {
    if (this.pending) {
      this.pending = { ...this.pending, attemptCount: this.pending.attemptCount + 1 }
    }
  }
}

export function needsClarification(intent: ParsedIntent): boolean {
  const explanation = intent.explanation ?? intent.advisor_message ?? ''
  const hasWorkflowSteps = Array.isArray(intent.steps) && intent.steps.length > 0

  if (
    intent.intent === 'answer_question' ||
    intent.intent === 'describe_workflow' ||
    hasWorkflowSteps
  ) {
    return false
  }

  if (typeof intent.confidence === 'number' && intent.confidence < LOW_CONFIDENCE_THRESHOLD) {
    return CLARIFICATION_MARKERS.test(explanation)
  }

  return CLARIFICATION_MARKERS.test(explanation) && !hasWorkflowSteps
}

export function extractClarificationQuestion(intent: ParsedIntent): string {
  const message = (intent.advisor_message ?? intent.explanation ?? '').trim()
  if (!message) {
    return 'Could you share a few more details so I can help?'
  }

  const sentences = message.split(/(?<=[.!?])\s+/).filter(Boolean)
  const questionSentence = sentences.find((s) => s.includes('?'))
  if (questionSentence) return questionSentence.trim()

  if (message.endsWith('?')) return message
  return `${message} Could you clarify?`
}

export function mergeClarificationAnswer(originalRequest: string, answer: string): string {
  const trimmedAnswer = answer.trim()
  if (!trimmedAnswer) return originalRequest
  return `${originalRequest.trim()}. Additional detail: ${trimmedAnswer}`
}

export function formatClarificationPrompt(session: ClarificationSession): string {
  if (session.options?.length) {
    const optionsText = session.options.slice(0, 4).join(', ')
    return `${session.question} Options: ${optionsText}.`
  }
  return session.question
}

export function detectCommandAmbiguity(
  parsed: ParsedCommand,
  text: string,
  pageContext: PageContext,
): AmbiguityKind | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  if (parsed.intent === 'unknown' && VAGUE_PATTERNS.test(trimmed)) {
    return 'vague_intent'
  }

  if (
    parsed.intent !== 'unknown' &&
    parsed.confidence >= COMMAND_AMBIGUITY_THRESHOLD &&
    parsed.confidence < LOW_CONFIDENCE_THRESHOLD
  ) {
    return 'low_confidence'
  }

  if (
    parsed.action === 'go_settings' &&
    !pageContext.settingsSection &&
    SETTINGS_AMBIGUOUS.test(trimmed) &&
    !/\b(?:agent|risk|telegram|account)\b/i.test(trimmed)
  ) {
    return 'settings_section'
  }

  if (
    (parsed.action === 'run_workflow' ||
      parsed.action === 'stop_workflow' ||
      parsed.action === 'pause_workflow' ||
      parsed.action === 'resume_workflow') &&
    WORKFLOW_AMBIGUOUS.test(trimmed) &&
    parsed.confidence < 0.85
  ) {
    return 'workflow_target'
  }

  if (parsed.intent === 'form' && parsed.confidence < LOW_CONFIDENCE_THRESHOLD) {
    return 'missing_param'
  }

  return null
}

export function buildClarificationFromCommand(
  parsed: ParsedCommand,
  text: string,
  pageContext: PageContext,
): ClarificationSession | null {
  const kind = detectCommandAmbiguity(parsed, text, pageContext)
  if (!kind) return null

  switch (kind) {
    case 'settings_section':
      return {
        originalRequest: text,
        question: 'Which settings section do you need - agents, risk, telegram, or account?',
        attemptCount: 0,
        kind,
        options: ['agents', 'risk', 'telegram', 'account'],
        missingFields: ['settingsSection'],
      }
    case 'workflow_target':
      return {
        originalRequest: text,
        question: 'Which workflow should I use - the one on your canvas, or a saved workflow?',
        attemptCount: 0,
        kind,
        options: ['canvas workflow', 'saved workflow'],
        missingFields: ['workflowTarget'],
      }
    case 'missing_param':
      return {
        originalRequest: text,
        question: buildMissingParamQuestion(parsed),
        attemptCount: 0,
        kind,
        missingFields: inferMissingFields(parsed),
      }
    case 'vague_intent':
      return {
        originalRequest: text,
        question: buildVagueIntentQuestion(pageContext),
        attemptCount: 0,
        kind,
        options: buildContextualOptions(pageContext),
      }
    case 'low_confidence':
      return {
        originalRequest: text,
        question: `I think you want to ${humanizeAction(parsed.action)}. Is that right?`,
        attemptCount: 0,
        kind,
        options: ['yes', 'no, something else'],
      }
    default:
      return null
  }
}

export function buildClarificationFromIntent(
  intent: ParsedIntent,
  originalRequest: string,
): ClarificationSession {
  return {
    originalRequest,
    question: extractClarificationQuestion(intent),
    attemptCount: 0,
    kind: 'low_confidence',
  }
}

export function resolveClarificationAnswer(
  session: ClarificationSession,
  answer: string,
): { resolved: string; matchedOption?: string } {
  const trimmed = answer.trim().toLowerCase()
  if (!session.options?.length) {
    return { resolved: mergeClarificationAnswer(session.originalRequest, answer) }
  }

  const matched = session.options.find((opt) => trimmed.includes(opt.toLowerCase()))
  if (matched) {
    return {
      resolved: `${session.originalRequest}. User chose: ${matched}`,
      matchedOption: matched,
    }
  }

  if (/\b(?:yes|yeah|yep|correct|right)\b/i.test(trimmed) && session.kind === 'low_confidence') {
    return { resolved: session.originalRequest, matchedOption: 'confirmed' }
  }

  if (/\b(?:no|nope|wrong|different)\b/i.test(trimmed) && session.kind === 'low_confidence') {
    return {
      resolved: `${session.originalRequest}. User said that was not correct. ${answer}`,
      matchedOption: 'rejected',
    }
  }

  return { resolved: mergeClarificationAnswer(session.originalRequest, answer) }
}

function buildMissingParamQuestion(parsed: ParsedCommand): string {
  switch (parsed.action) {
    case 'set_risk_tolerance':
      return 'What risk tolerance should I set - a number from 0 to 100?'
    case 'fund_agent':
    case 'prepare_fund_agent':
      return 'How much ALGO should I use to fund the agent?'
    case 'prepare_send_payment':
      return 'Who should receive the payment, and how much?'
    case 'go_market_asset':
      return 'Which asset should I look up on the market?'
    default:
      return 'What value should I use?'
  }
}

function inferMissingFields(parsed: ParsedCommand): string[] {
  switch (parsed.action) {
    case 'set_risk_tolerance':
      return ['riskTolerance']
    case 'fund_agent':
    case 'prepare_fund_agent':
      return ['amount']
    case 'prepare_send_payment':
      return ['recipient', 'amount']
    case 'go_market_asset':
      return ['asset']
    default:
      return ['value']
  }
}

function buildVagueIntentQuestion(pageContext: PageContext): string {
  switch (pageContext.pathname) {
    case '/builder':
      return 'I can help with workflows on the builder. Do you want to create, run, or modify something?'
    case '/settings':
      return 'Which settings area should we open - agents, risk, telegram, or account?'
    case '/dashboard':
      return 'Would you like stats, execution history, or to open the builder?'
    default:
      return 'What would you like to do - navigate, check your balance, or build a workflow?'
  }
}

function buildContextualOptions(pageContext: PageContext): string[] {
  switch (pageContext.pathname) {
    case '/builder':
      return ['create a workflow', 'run workflow', 'open AI assistant']
    case '/settings':
      return ['agent settings', 'risk settings', 'fund agent']
    case '/dashboard':
      return ['show stats', 'execution history', 'open builder']
    default:
      return ['open builder', 'check balance', 'go to settings']
  }
}

function humanizeAction(action: string): string {
  return action.replace(/_/g, ' ')
}
