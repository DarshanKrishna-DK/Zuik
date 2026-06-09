import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VoiceAssistantUI, getVoiceStateLabel } from './VoiceAssistantUI'

const defaultProps = {
  state: 'idle' as const,
  expanded: true,
  wakeWordEnabled: true,
  messages: [],
  interimTranscript: '',
  serviceHealth: { available: true, groq: true, elevenlabs: true },
  onToggleExpanded: vi.fn(),
  onActivate: vi.fn(),
  onEndSession: vi.fn(),
  onToggleWakeWord: vi.fn(),
}

describe('VoiceAssistantUI accessibility', () => {
  it('exposes conversation region with aria-live', () => {
    render(<VoiceAssistantUI {...defaultProps} />)
    const panel = screen.getByTestId('voice-assistant-panel')
    expect(panel.getAttribute('aria-live')).toBe('polite')
    expect(panel.getAttribute('aria-label')).toContain('Voice assistant')
  })

  it('labels the mic bubble for screen readers', () => {
    render(<VoiceAssistantUI {...defaultProps} expanded={false} />)
    expect(screen.getByTestId('voice-assistant-bubble').getAttribute('aria-label')).toContain(
      'Open voice assistant',
    )
  })

  it('shows wake word status in expanded panel', () => {
    render(<VoiceAssistantUI {...defaultProps} />)
    expect(screen.getByTestId('voice-assistant-status').textContent).toBe('Ready')
    expect(screen.getByText(/Wake word on/i)).toBeTruthy()
  })

  it('maps states to human-readable labels', () => {
    expect(getVoiceStateLabel('wake_listening')).toContain('Hey Zuik')
    expect(getVoiceStateLabel('processing')).toBe('Processing...')
  })
})
