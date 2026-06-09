import type { CanvasBlock, ParsedIntent } from '../intentParser'

export const ZUIK_VOICE_INTENT_EVENT = 'zuik:voice-intent'

type CanvasProvider = () => CanvasBlock[]

let canvasProvider: CanvasProvider | null = null

export function registerCanvasProvider(provider: CanvasProvider): void {
  canvasProvider = provider
}

export function unregisterCanvasProvider(provider?: CanvasProvider): void {
  if (!provider || canvasProvider === provider) {
    canvasProvider = null
  }
}

export function getVoiceCanvasBlocks(): CanvasBlock[] {
  if (!canvasProvider) return []
  try {
    return canvasProvider()
  } catch {
    return []
  }
}

export function dispatchVoiceIntent(intent: ParsedIntent): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<ParsedIntent>(ZUIK_VOICE_INTENT_EVENT, { detail: intent }),
  )
}

export function subscribeVoiceIntent(handler: (intent: ParsedIntent) => void): () => void {
  if (typeof window === 'undefined') return () => {}

  const listener = (event: Event) => {
    const detail = (event as CustomEvent<ParsedIntent>).detail
    if (detail) handler(detail)
  }

  window.addEventListener(ZUIK_VOICE_INTENT_EVENT, listener)
  return () => window.removeEventListener(ZUIK_VOICE_INTENT_EVENT, listener)
}
