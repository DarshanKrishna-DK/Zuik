import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createVoicePipeline } from '../voiceAssistant/voicePipeline'

vi.mock('../voiceService', () => ({
  checkVoiceServiceHealth: vi.fn().mockResolvedValue({
    available: true,
    services: { groq: true, elevenlabs: true },
  }),
  synthesizeSpeech: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
  playAudio: vi.fn().mockResolvedValue({
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    pause: vi.fn(),
  }),
  transcribeAudio: vi.fn(),
}))

describe('createVoicePipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports service health from voice backend', async () => {
    const pipeline = createVoicePipeline()
    const health = await pipeline.checkHealth()

    expect(health.available).toBe(true)
    expect(health.groq).toBe(true)
    expect(health.elevenlabs).toBe(true)
  })

  it('skips TTS for empty text', async () => {
    const { synthesizeSpeech } = await import('../voiceService')
    const pipeline = createVoicePipeline()

    await pipeline.speak('   ')
    expect(synthesizeSpeech).not.toHaveBeenCalled()
  })

  it('stops speaking and capture without throwing', () => {
    const pipeline = createVoicePipeline()
    expect(() => {
      pipeline.stopSpeaking()
      pipeline.stopCapture()
      pipeline.destroy()
    }).not.toThrow()
  })
})
