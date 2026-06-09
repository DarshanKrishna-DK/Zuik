import { describe, expect, it } from 'vitest'
import { transcriptContainsWakeWord } from '../voiceAssistant/wakeWordDetection'

describe('transcriptContainsWakeWord', () => {
  it('detects the primary wake phrase', () => {
    expect(transcriptContainsWakeWord('hey zuik open settings')).toBe(true)
  })

  it('detects common speech recognition aliases', () => {
    expect(transcriptContainsWakeWord('hey zuke what is my balance')).toBe(true)
    expect(transcriptContainsWakeWord('hey zoik go to builder')).toBe(true)
  })

  it('ignores unrelated speech', () => {
    expect(transcriptContainsWakeWord('open the settings page')).toBe(false)
    expect(transcriptContainsWakeWord('hey there')).toBe(false)
  })
})
