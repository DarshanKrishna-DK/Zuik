import type { AgentContext } from '../runAgent'

export type ExecutorFn = (
  config: Record<string, string | number | undefined>,
  context: AgentContext,
  upstreamOutputs?: Record<string, unknown>
) => Promise<Record<string, unknown> | null>

export const comparatorExecutor: ExecutorFn = async (config, _context, upstreamOutputs) => {
  const operator = (config.operator as string) || '=='
  const threshold = config.threshold as string | number
  const upstream = upstreamOutputs ?? {}
  const value = upstream.value ?? upstream.result ?? upstream.amount ?? Object.values(upstream)[0]

  let result = false
  const numVal = Number(value)
  const numThresh = Number(threshold)

  switch (operator) {
    case '>': result = numVal > numThresh; break
    case '<': result = numVal < numThresh; break
    case '>=': result = numVal >= numThresh; break
    case '<=': result = numVal <= numThresh; break
    case '==': result = String(value) === String(threshold); break
    case '!=': result = String(value) !== String(threshold); break
    case 'contains': result = String(value).includes(String(threshold)); break
  }

  const branch = result ? 'true' : 'false'
  return { result, branch, true: result ? value : undefined, false: result ? undefined : value }
}

export const delayExecutor: ExecutorFn = async (config, context, upstreamOutputs) => {
  const duration = Number(config.duration || 5) * 1000
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, duration)
    context.abortSignal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new Error('Delay aborted'))
    }, { once: true })
  })
  return { output: upstreamOutputs ?? {} }
}

export const mathOpExecutor: ExecutorFn = async (config, _context, upstreamOutputs) => {
  const upstream = upstreamOutputs ?? {}
  const a = Number(upstream.a ?? upstream.value ?? config.a ?? 0)
  const b = Number(upstream.b ?? config.b ?? 0)
  const operation = (config.operation as string) || 'add'

  let result: number
  switch (operation) {
    case 'add': result = a + b; break
    case 'subtract': result = a - b; break
    case 'multiply': result = a * b; break
    case 'divide': result = b !== 0 ? a / b : 0; break
    case 'percentage': result = a * (b / 100); break
    case 'modulo': result = b !== 0 ? a % b : 0; break
    default: result = a + b
  }

  return { result }
}

export const filterExecutor: ExecutorFn = async (config, _context, upstreamOutputs) => {
  const upstream = upstreamOutputs ?? {}
  const fieldPath = config.field as string
  const operator = (config.operator as string) || '=='
  const compareValue = config.value as string

  let fieldValue: unknown = upstream
  if (fieldPath) {
    const parts = fieldPath.split('.')
    let current: unknown = upstream
    for (const part of parts) {
      if (current && typeof current === 'object') {
        current = (current as Record<string, unknown>)[part]
      } else {
        current = undefined
        break
      }
    }
    fieldValue = current
  }

  let passes = false
  const numField = Number(fieldValue)
  const numCompare = Number(compareValue)

  switch (operator) {
    case '>': passes = numField > numCompare; break
    case '<': passes = numField < numCompare; break
    case '==': passes = String(fieldValue) === String(compareValue); break
    case '!=': passes = String(fieldValue) !== String(compareValue); break
    default: passes = String(fieldValue) === String(compareValue)
  }

  return passes ? { passed: upstream } : null
}

const rateLimiterState = new Map<string, { count: number; windowStart: number }>()

export const rateLimiterExecutor: ExecutorFn = async (config, _context, upstreamOutputs) => {
  const maxPerWindow = Number(config.maxPerWindow || 5)
  const windowSec = Number(config.windowSec || 60) * 1000
  const key = JSON.stringify(config)
  const now = Date.now()

  let state = rateLimiterState.get(key)
  if (!state || now - state.windowStart > windowSec) {
    state = { count: 0, windowStart: now }
    rateLimiterState.set(key, state)
  }

  if (state.count >= maxPerWindow) {
    return null
  }

  state.count++
  return { output: upstreamOutputs ?? {} }
}

export const variableSetExecutor: ExecutorFn = async (config, context, upstreamOutputs) => {
  const varName = config.varName as string
  const upstream = upstreamOutputs ?? {}
  const value = upstream.value ?? Object.values(upstream)[0] ?? ''
  if (varName) {
    context.variables.set(varName, value)
  }
  return { stored: value }
}

export const constantExecutor: ExecutorFn = async (config) => {
  const rawValue = config.value as string
  const dataType = (config.type as string) || 'string'

  let parsed: unknown = rawValue
  switch (dataType) {
    case 'number': parsed = Number(rawValue); break
    case 'boolean': parsed = rawValue === 'true' || rawValue === '1'; break
    case 'json':
      try { parsed = JSON.parse(rawValue) } catch { parsed = rawValue }
      break
  }
  return { value: parsed }
}

export const mergeExecutor: ExecutorFn = async (config, _context, upstreamOutputs) => {
  const mode = (config.mode as string) || 'first'
  const upstream = upstreamOutputs ?? {}

  switch (mode) {
    case 'first': {
      const first = Object.values(upstream).find((v) => v !== undefined && v !== null && v !== '')
      return { merged: first ?? null }
    }
    case 'concat': {
      const values = Object.values(upstream).filter((v) => v !== undefined)
      return { merged: values.map(String).join('') }
    }
    case 'object': {
      return { merged: upstream }
    }
    default:
      return { merged: upstream }
  }
}

export const transformDataExecutor: ExecutorFn = async (config, _context, upstreamOutputs) => {
  const upstream = upstreamOutputs ?? {}
  const input = upstream.input ?? upstream.value ?? Object.values(upstream)[0]
  const targetType = (config.targetType as string) || 'string'

  let output: unknown
  switch (targetType) {
    case 'number': output = Number(input); break
    case 'string': output = String(input ?? ''); break
    case 'boolean': output = Boolean(input); break
    case 'json':
      try { output = typeof input === 'string' ? JSON.parse(input) : input } catch { output = input }
      break
    default: output = input
  }
  return { output }
}

export const logicExecutors: Record<string, ExecutorFn> = {
  'comparator': comparatorExecutor,
  'delay': delayExecutor,
  'math-op': mathOpExecutor,
  'filter': filterExecutor,
  'rate-limiter': rateLimiterExecutor,
  'variable-set': variableSetExecutor,
  'constant': constantExecutor,
  'merge': mergeExecutor,
  'transform-data': transformDataExecutor,
}
