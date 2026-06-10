import { useEffect, useRef } from 'react'
import {
  registerComponentHandle,
  unregisterComponentHandle,
  type VoiceComponentHandle,
} from '../../services/voiceAssistant/componentRegistry'

/** Wire up imperative handles so voice can click/focus this component. */
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
