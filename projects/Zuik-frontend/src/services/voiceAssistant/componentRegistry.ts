/**
 * Voice assistant reads page and component state from here.
 */

export type VoicePageId = '/' | '/builder' | '/dashboard' | '/settings' | '/market'

export interface VoicePageState {
  pageId: VoicePageId
  /** Short human-readable summary for TTS and AI context. */
  summary?: string
  data?: Record<string, unknown>
  updatedAt: number
}

export interface VoiceComponentHandle {
  testId: string
  focus?: () => void
  click?: () => void
  setValue?: (value: string | number) => void
  getValue?: () => string | number | null
}

export interface VoiceShellState {
  walletConnected: boolean
  walletAddress: string | null
  walletSummary: string | null
  balances: Array<{ label: string; amount: number }>
  updatedAt: number
}

const pageStates = new Map<VoicePageId, VoicePageState>()
const componentHandles = new Map<string, VoiceComponentHandle>()
let shellState: VoiceShellState | null = null
const stateListeners = new Set<() => void>()

function notifyListeners(): void {
  stateListeners.forEach((listener) => listener())
}

export function subscribeVoiceRegistry(listener: () => void): () => void {
  stateListeners.add(listener)
  return () => stateListeners.delete(listener)
}

export function registerPageState(
  pageId: VoicePageId,
  state: Omit<VoicePageState, 'pageId' | 'updatedAt'>,
): void {
  pageStates.set(pageId, {
    pageId,
    summary: state.summary,
    data: state.data,
    updatedAt: Date.now(),
  })
  notifyListeners()
}

export function unregisterPageState(pageId: VoicePageId): void {
  pageStates.delete(pageId)
  notifyListeners()
}

export function getPageState(pageId: VoicePageId): VoicePageState | null {
  return pageStates.get(pageId) ?? null
}

export function getActivePageState(pathname: string): VoicePageState | null {
  const id = pathname as VoicePageId
  if (pageStates.has(id)) {
    return pageStates.get(id) ?? null
  }
  return null
}

export function registerShellState(state: Omit<VoiceShellState, 'updatedAt'>): void {
  shellState = { ...state, updatedAt: Date.now() }
  notifyListeners()
}

export function unregisterShellState(): void {
  shellState = null
  notifyListeners()
}

export function getShellState(): VoiceShellState | null {
  return shellState
}

export function registerComponentHandle(handle: VoiceComponentHandle): void {
  componentHandles.set(handle.testId, handle)
}

export function unregisterComponentHandle(testId: string): void {
  componentHandles.delete(testId)
}

export function getComponentHandle(testId: string): VoiceComponentHandle | null {
  return componentHandles.get(testId) ?? null
}

export function invokeComponentClick(testId: string): boolean {
  const handle = componentHandles.get(testId)
  if (handle?.click) {
    handle.click()
    return true
  }
  return false
}

export function invokeComponentSetValue(testId: string, value: string | number): boolean {
  const handle = componentHandles.get(testId)
  if (handle?.setValue) {
    handle.setValue(value)
    return true
  }
  return false
}

export function describeRegisteredContext(pathname: string): string | null {
  const pageState = getActivePageState(pathname)
  const parts: string[] = []

  if (shellState?.walletConnected && shellState.walletSummary) {
    parts.push(`Wallet: ${shellState.walletSummary}`)
  } else if (shellState && !shellState.walletConnected) {
    parts.push('Wallet not connected')
  }

  if (pageState?.summary) {
    parts.push(pageState.summary)
  }

  return parts.length > 0 ? parts.join('. ') : null
}
