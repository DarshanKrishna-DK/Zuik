import { useEffect, useRef } from 'react'
import {
  registerPageState,
  unregisterPageState,
  type VoicePageId,
} from '../../services/voiceAssistant/componentRegistry'

export interface VoicePageContextInput {
  summary?: string
  data?: Record<string, unknown>
}

/** Registers page context while mounted (voice commands use it for richer answers). */
export function useVoicePageContext(pageId: VoicePageId, context: VoicePageContextInput): void {
  const summaryRef = useRef(context.summary)
  const dataRef = useRef(context.data)
  summaryRef.current = context.summary
  dataRef.current = context.data

  useEffect(() => {
    registerPageState(pageId, {
      summary: summaryRef.current,
      data: dataRef.current,
    })
    return () => unregisterPageState(pageId)
  }, [pageId])

  useEffect(() => {
    registerPageState(pageId, {
      summary: context.summary,
      data: context.data,
    })
  }, [pageId, context.summary, context.data])
}
