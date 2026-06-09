import { useEffect, useRef } from 'react'
import {
  registerComponentHandle,
  unregisterComponentHandle,
  type VoiceComponentHandle,
} from '../../services/voiceAssistant/componentRegistry'

/**
 * Registers imperative handles for voice-driven component control.
 * Prefer data-testid values documented in component-registry.md.
 */
export function useVoiceComponentRef(
  testId: string,
  handle: Omit<VoiceComponentHandle, 'testId'>,
): void {
  const handleRef = useRef(handle)
  handleRef.current = handle

  useEffect(() => {
    registerComponentHandle({
      testId,
      focus: () => handleRef.current.focus?.(),
      click: () => handleRef.current.click?.(),
      setValue: (value) => handleRef.current.setValue?.(value),
      getValue: () => handleRef.current.getValue?.() ?? null,
    })
    return () => unregisterComponentHandle(testId)
  }, [testId])
}
