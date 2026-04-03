import { useState, useRef, useEffect, useCallback } from 'react'
import {
  MessageSquare, Send, Mic, MicOff, X, Sparkles, ChevronRight, AlertCircle,
} from 'lucide-react'
import { parseIntent, isGroqConfigured } from '../../services/intentParser'
import type { ParsedIntent } from '../../services/intentParser'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  intent?: ParsedIntent
  isError?: boolean
}

interface Props {
  isOpen: boolean
  onClose: () => void
  onIntentParsed: (intent: ParsedIntent) => void
}

const INTENT_TEMPLATES = [
  { label: 'Swap tokens', text: 'Swap 50 USDC to ALGO' },
  { label: 'Swap & send', text: 'Swap 10 USDC to ALGO and send to ' },
  { label: 'DCA buy', text: 'Every hour, buy 5 ALGO with USDC' },
  { label: 'Price alert', text: 'Alert me on browser if ALGO price drops below 0.15 USDC' },
  { label: 'Auto-swap on receive', text: 'When I receive USDC, swap it all to ALGO' },
  { label: 'Send payment', text: 'Send 10 ALGO to ' },
  { label: 'Buy crypto with fiat', text: 'Buy 1000 INR worth of USDT via Saber on-ramp' },
]

function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const supported = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  const start = useCallback(() => {
    if (!supported) return
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let text = ''
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0].transcript
      }
      setTranscript(text)
    }

    recognition.onend = () => setIsListening(false)
    recognition.onerror = () => setIsListening(false)

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
    setTranscript('')
  }, [supported])

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
    setIsListening(false)
  }, [])

  return { isListening, transcript, start, stop, supported, clearTranscript: () => setTranscript('') }
}

export default function ChatPanel({ isOpen, onClose, onIntentParsed }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'system',
      content: 'Describe what you want to do in plain language — or pick a template below. I\'ll build the workflow for you.',
    },
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const speech = useSpeechRecognition()

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (isOpen) inputRef.current?.focus()
  }, [isOpen])

  useEffect(() => {
    if (!speech.isListening && speech.transcript) {
      setInput(speech.transcript)
      speech.clearTranscript()
    }
  }, [speech.isListening, speech.transcript, speech.clearTranscript])

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isLoading) return

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: trimmed,
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsLoading(true)

    try {
      const history = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

      const intent = await parseIntent(trimmed, history)

      const assistantMsg: ChatMessage = {
        id: `msg_${Date.now()}_resp`,
        role: 'assistant',
        content: intent.explanation,
        intent,
      }
      setMessages((prev) => [...prev, assistantMsg])
      onIntentParsed(intent)
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: `msg_${Date.now()}_err`,
        role: 'assistant',
        content: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
        isError: true,
      }
      setMessages((prev) => [...prev, errorMsg])
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, messages, onIntentParsed])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const handleTemplate = (text: string) => {
    setInput(text)
    inputRef.current?.focus()
  }

  const configured = isGroqConfigured()

  if (!isOpen) return null

  return (
    <div className="zuik-chat-panel">
      {/* Header */}
      <div className="zuik-chat-header">
        <div className="zuik-chat-header-left">
          <Sparkles size={16} style={{ color: 'var(--zuik-orange)' }} />
          <span>Intent Assistant</span>
        </div>
        <button className="zuik-chat-close" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      {/* Messages */}
      <div className="zuik-chat-messages">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`zuik-chat-msg zuik-chat-msg-${msg.role}${msg.isError ? ' zuik-chat-msg-error' : ''}`}
          >
            {msg.role === 'system' && (
              <div className="zuik-chat-system">
                <MessageSquare size={14} />
                <span>{msg.content}</span>
              </div>
            )}
            {msg.role === 'user' && (
              <div className="zuik-chat-bubble zuik-chat-bubble-user">{msg.content}</div>
            )}
            {msg.role === 'assistant' && (
              <div className={`zuik-chat-bubble zuik-chat-bubble-assistant${msg.isError ? ' error' : ''}`}>
                {msg.isError && <AlertCircle size={14} style={{ flexShrink: 0 }} />}
                <div>
                  <p>{msg.content}</p>
                  {msg.intent && (
                    <div className="zuik-chat-intent-badge">
                      <Sparkles size={12} />
                      <span>{msg.intent.steps.length} block{msg.intent.steps.length !== 1 ? 's' : ''} added to canvas</span>
                      <span className="zuik-chat-confidence">
                        {Math.round((msg.intent.confidence ?? 0) * 100)}% confidence
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="zuik-chat-msg zuik-chat-msg-assistant">
            <div className="zuik-chat-bubble zuik-chat-bubble-assistant">
              <div className="zuik-chat-typing">
                <span /><span /><span />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Templates */}
      {messages.length <= 1 && (
        <div className="zuik-chat-templates">
          {INTENT_TEMPLATES.map((t) => (
            <button
              key={t.label}
              className="zuik-chat-template-btn"
              onClick={() => handleTemplate(t.text)}
            >
              <ChevronRight size={12} />
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Not configured warning */}
      {!configured && (
        <div className="zuik-chat-warning">
          <AlertCircle size={14} />
          <span>Set <code>VITE_GROQ_API_KEY</code> in your .env to enable AI intent parsing.</span>
        </div>
      )}

      {/* Input */}
      <div className="zuik-chat-input-area">
        {speech.supported && (
          <button
            className={`zuik-chat-mic${speech.isListening ? ' active' : ''}`}
            onClick={speech.isListening ? speech.stop : speech.start}
            title={speech.isListening ? 'Stop recording' : 'Voice input'}
          >
            {speech.isListening ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
        )}
        <input
          ref={inputRef}
          className="zuik-chat-input"
          value={speech.isListening ? speech.transcript || input : input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={speech.isListening ? 'Listening...' : 'Describe your workflow...'}
          disabled={isLoading || speech.isListening}
        />
        <button
          className="zuik-chat-send"
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || isLoading}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}
