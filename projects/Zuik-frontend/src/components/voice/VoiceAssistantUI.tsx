import type { ReactNode } from 'react'
import type { VoiceAssistantMessage, VoiceAssistantState } from '../../services/voiceAssistant/types'
import type { VoiceSuggestion } from '../../services/voiceAssistant/suggestionEngine'

const STATE_LABELS: Record<VoiceAssistantState, string> = {
  idle: 'Ready',
  wake_listening: 'Listening for "Hey Zuik"',
  listening: 'Listening...',
  processing: 'Processing...',
  speaking: 'Speaking...',
  error: 'Something went wrong',
  unavailable: 'Voice unavailable',
}

function MicIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  )
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={expanded ? 'va-chevron va-chevron--up' : 'va-chevron'}
    >
      <path d="m18 15-6-6-6 6" />
    </svg>
  )
}

function WaveBars() {
  return (
    <span className="va-wave" aria-hidden="true">
      <span /><span /><span /><span />
    </span>
  )
}

export interface VoiceAssistantUIProps {
  state: VoiceAssistantState
  expanded: boolean
  wakeWordEnabled: boolean
  messages: VoiceAssistantMessage[]
  interimTranscript: string
  serviceHealth: { available: boolean; groq: boolean; elevenlabs: boolean }
  suggestions?: VoiceSuggestion[]
  proactiveSuggestion?: VoiceSuggestion | null
  onToggleExpanded: () => void
  onActivate: () => void
  onEndSession: () => void
  onToggleWakeWord: () => void
  transactionPanel?: ReactNode
}

export function VoiceAssistantUI({
  state,
  expanded,
  wakeWordEnabled,
  messages,
  interimTranscript,
  serviceHealth,
  suggestions = [],
  proactiveSuggestion,
  onToggleExpanded,
  onActivate,
  onEndSession,
  onToggleWakeWord,
  transactionPanel,
}: VoiceAssistantUIProps) {
  const statusLabel = STATE_LABELS[state]
  const isActive = state === 'listening' || state === 'processing' || state === 'speaking'
  const recentMessages = messages.slice(-4)
  const showInterim = interimTranscript && state === 'listening'

  return (
    <div
      className={`va-root ${expanded ? 'va-root--expanded' : ''} va-root--${state}`}
      data-testid="voice-assistant-root"
    >
      {transactionPanel}
      {expanded && (
        <section
          className="va-panel"
          data-testid="voice-assistant-panel"
          aria-live="polite"
          aria-label="Voice assistant conversation"
        >
          <header className="va-panel-header">
            <div>
              <p className="va-panel-title">ZUIK Assistant</p>
              <p className="va-panel-subtitle" data-testid="voice-assistant-status">
                {statusLabel}
              </p>
            </div>
            <button
              type="button"
              className="va-icon-btn"
              onClick={onToggleExpanded}
              aria-label="Collapse voice assistant"
            >
              <ChevronIcon expanded={expanded} />
            </button>
          </header>

          <div className="va-service-row">
            <span className={`va-pill ${serviceHealth.groq ? 'va-pill--ok' : 'va-pill--warn'}`}>STT</span>
            <span className={`va-pill ${serviceHealth.elevenlabs ? 'va-pill--ok' : 'va-pill--warn'}`}>TTS</span>
            <span className={`va-pill ${wakeWordEnabled ? 'va-pill--ok' : ''}`}>
              Wake word {wakeWordEnabled ? 'on' : 'off'}
            </span>
          </div>

          <div className="va-transcript" data-testid="voice-assistant-transcript">
            {recentMessages.length === 0 && !showInterim && (
              <p className="va-transcript-empty">
                {proactiveSuggestion
                  ? `Tip: ${proactiveSuggestion.label}. Or say "Hey Zuik" to start.`
                  : 'Say "Hey Zuik" or tap the mic to start.'}
              </p>
            )}
            {recentMessages.map((message) => (
              <div key={message.id} className={`va-message va-message--${message.role}`}>
                <span className="va-message-role">
                  {message.role === 'user' ? 'You' : message.role === 'assistant' ? 'ZUIK' : 'System'}
                </span>
                <p>{message.text}</p>
              </div>
            ))}
            {showInterim && (
              <div className="va-message va-message--user va-message--interim">
                <span className="va-message-role">You</span>
                <p>{interimTranscript}</p>
              </div>
            )}
          </div>

          {(proactiveSuggestion || suggestions.length > 0) && (
            <div className="va-suggestions" data-testid="voice-assistant-suggestions">
              {proactiveSuggestion && (
                <p className="va-suggestion-proactive">
                  <span className="va-suggestion-label">Tip</span>
                  {proactiveSuggestion.label}
                </p>
              )}
              {suggestions.length > 0 && (
                <ul className="va-suggestion-list">
                  {suggestions.slice(0, 3).map((item) => (
                    <li key={item.id} className="va-suggestion-item">
                      {item.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="va-panel-actions">
            <button type="button" className="va-btn va-btn--ghost" onClick={onToggleWakeWord}>
              {wakeWordEnabled ? 'Disable wake word' : 'Enable wake word'}
            </button>
            {isActive && (
              <button type="button" className="va-btn va-btn--ghost" onClick={onEndSession}>
                End session
              </button>
            )}
          </div>
        </section>
      )}

      <div className="va-bubble-wrap">
        {expanded && (
          <button
            type="button"
            className="va-expand-toggle"
            onClick={onToggleExpanded}
            aria-label="Collapse voice assistant"
          >
            <ChevronIcon expanded={expanded} />
          </button>
        )}

        <button
          type="button"
          className={`va-bubble va-bubble--${state}`}
          data-testid="voice-assistant-bubble"
          onClick={() => {
            if (expanded && (state === 'idle' || state === 'wake_listening')) {
              onActivate()
              return
            }
            if (!expanded) {
              onToggleExpanded()
              return
            }
            if (state === 'idle' || state === 'wake_listening') {
              onActivate()
            }
          }}
          aria-label={
            state === 'unavailable'
              ? 'Voice assistant unavailable'
              : isActive
                ? 'Voice assistant active'
                : 'Open voice assistant'
          }
        >
          <span className="va-bubble-ring va-bubble-ring--outer" aria-hidden="true" />
          <span className="va-bubble-ring va-bubble-ring--inner" aria-hidden="true" />
          <span className="va-bubble-core">
            {state === 'processing' ? <span className="va-spinner" aria-hidden="true" /> : null}
            {state === 'speaking' || state === 'listening' ? <WaveBars /> : <MicIcon />}
          </span>
        </button>
      </div>
    </div>
  )
}

export function getVoiceStateLabel(state: VoiceAssistantState): string {
  return STATE_LABELS[state]
}
