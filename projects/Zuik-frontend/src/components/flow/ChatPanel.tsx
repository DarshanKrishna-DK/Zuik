import { useState, useRef, useEffect, useCallback } from 'react'
import { parseIntent, isGroqConfigured } from '../../services/intentParser'
import type { ParsedIntent, CanvasBlock } from '../../services/intentParser'

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
  canvasBlocks?: CanvasBlock[]
}

/* ── Inline SVG Icons ─────────────────────────────────── */
function MessageIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /></svg> }
function SendIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" /><path d="m21.854 2.147-10.94 10.939" /></svg> }
function MicIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" x2="12" y1="19" y2="22" /></svg> }
function MicOffIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="2" x2="22" y1="2" y2="22" /><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" /><path d="M5 10v2a7 7 0 0 0 12 5" /><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" /><path d="M9 9v3a3 3 0 0 0 5.12 2.12" /><line x1="12" x2="12" y1="19" y2="22" /></svg> }
function XIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg> }
function SparklesIcon({ size = 16 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" /><path d="M20 3v4" /><path d="M22 5h-4" /></svg> }
function ChevronRightIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg> }
function AlertIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg> }
function LightbulbIcon({ size = 16 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" /><path d="M9 18h6" /><path d="M10 22h4" /></svg> }
function WrenchIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg> }
function TrendingUpIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></svg> }
function ShieldIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /></svg> }
function ZapIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" /></svg> }
function FileSearchIcon({ size = 12 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M4.268 21a2 2 0 0 0 1.727 1H18a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v3" /><path d="m9 18-1.5-1.5" /><circle cx="5" cy="14" r="3" /></svg> }
function VolumeIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" /><path d="M16 9a5 5 0 0 1 0 6" /><path d="M19.364 18.364a9 9 0 0 0 0-12.728" /></svg> }
function VolumeMuteIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" /><line x1="22" x2="16" y1="9" y2="15" /><line x1="16" x2="22" y1="9" y2="15" /></svg> }
function PhoneIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg> }
function PhoneOffIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" /><line x1="22" x2="2" y1="2" y2="22" /></svg> }

const INTENT_TEMPLATES = [
  { label: 'Swap tokens', text: 'Swap 50 USDC to ALGO' },
  { label: 'Swap & send', text: 'Swap 10 USDC to ALGO and send to ' },
  { label: 'DCA buy', text: 'Every hour, buy 5 ALGO with USDC' },
  { label: 'Price alert', text: 'Alert me on browser if ALGO price drops below 0.15 USDC' },
  { label: 'Auto-swap on receive', text: 'When I receive USDC, swap it all to ALGO' },
  { label: 'Send payment', text: 'Send 10 ALGO to ' },
  { label: 'Buy crypto with fiat', text: 'Buy 1000 INR worth of USDT via Saber on-ramp' },
  { label: 'Describe workflow', text: 'Describe what my current workflow does' },
]

const ADVISOR_STARTERS = [
  { label: 'Suggest a strategy', text: 'I am new to crypto trading. What strategy would you recommend for a beginner with a small budget?', Icon: LightbulbIcon },
  { label: 'Set up DCA', text: 'Help me set up a dollar cost averaging strategy to accumulate ALGO over the next month', Icon: TrendingUpIcon },
  { label: 'Protect my portfolio', text: 'I hold ALGO and want to protect against a big price drop. What can I do?', Icon: ShieldIcon },
  { label: 'Explain my workflow', text: 'Describe and analyze my current workflow on the canvas', Icon: FileSearchIcon },
  { label: 'What is slippage?', text: 'Explain slippage in DeFi trading and how it affects my swaps', Icon: ZapIcon },
]

const RISK_COLORS: Record<string, string> = {
  conservative: 'var(--z-success)',
  moderate: 'var(--z-warning)',
  aggressive: 'var(--z-error)',
}

function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const supported = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  const start = useCallback(() => {
    if (!supported) return
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SR()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let text = ''
      for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript
      setTranscript(text)
    }
    recognition.onend = () => setIsListening(false)
    recognition.onerror = () => setIsListening(false)
    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
    setTranscript('')
  }, [supported])

  const stop = useCallback(() => { recognitionRef.current?.stop(); setIsListening(false) }, [])
  return { isListening, transcript, start, stop, supported, clearTranscript: () => setTranscript('') }
}

function useSpeechSynthesis() {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window

  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (!supported) return
    window.speechSynthesis.cancel()
    const cleaned = text.replace(/[*_#`]/g, '').replace(/\n+/g, '. ')
    const utt = new SpeechSynthesisUtterance(cleaned)
    const voices = window.speechSynthesis.getVoices()
    const preferred = voices.find((v) => v.lang.startsWith('en') && v.name.includes('Google')) ??
      voices.find((v) => v.lang.startsWith('en') && v.localService) ??
      voices.find((v) => v.lang.startsWith('en'))
    if (preferred) utt.voice = preferred
    utt.rate = 1.05; utt.pitch = 1.0
    utt.onstart = () => setIsSpeaking(true)
    utt.onend = () => { setIsSpeaking(false); onEnd?.() }
    utt.onerror = () => { setIsSpeaking(false); onEnd?.() }
    window.speechSynthesis.speak(utt)
  }, [supported])

  const stop = useCallback(() => { window.speechSynthesis.cancel(); setIsSpeaking(false) }, [])
  return { isSpeaking, speak, stop, supported }
}

export default function ChatPanel({ isOpen, onClose, onIntentParsed, canvasBlocks }: Props) {
  const [mode, setMode] = useState<'builder' | 'advisor'>('builder')
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'welcome', role: 'system', content: 'Describe what you want to do in plain language - or pick a template below. I will build the workflow for you.' },
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [voiceMode, setVoiceMode] = useState(false)
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const speech = useSpeechRecognition()
  const synth = useSpeechSynthesis()
  const voiceModeRef = useRef(false)

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => { if (isOpen) inputRef.current?.focus() }, [isOpen])
  useEffect(() => { voiceModeRef.current = voiceMode }, [voiceMode])

  const handleModeSwitch = (newMode: 'builder' | 'advisor') => {
    setMode(newMode)
    const welcomeMsg = newMode === 'advisor'
      ? 'I am your Smart Trading Advisor. Tell me about your goals, risk tolerance, or what you want to achieve. You can also ask me to describe your current workflow.'
      : 'Describe what you want to do in plain language - or pick a template below. I will build the workflow for you.'
    setMessages([{ id: `welcome_${Date.now()}`, role: 'system', content: welcomeMsg }])
  }

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isLoading) return

    setMessages((prev) => [...prev, { id: `msg_${Date.now()}`, role: 'user', content: trimmed }])
    setInput('')
    setIsLoading(true)

    try {
      const history = messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
      const intent = await parseIntent(trimmed, history, mode === 'advisor', canvasBlocks)
      const displayText = mode === 'advisor' && intent.advisor_message ? intent.advisor_message : intent.explanation

      const assistantMsg: ChatMessage = { id: `msg_${Date.now()}_resp`, role: 'assistant', content: displayText, intent: intent.steps.length > 0 ? intent : undefined }
      setMessages((prev) => [...prev, assistantMsg])

      if (intent.steps.length > 0) onIntentParsed(intent)

      if (voiceEnabled && synth.supported && displayText) {
        synth.speak(displayText, () => {
          if (voiceModeRef.current && speech.supported) setTimeout(() => speech.start(), 300)
        })
      }
    } catch (err) {
      setMessages((prev) => [...prev, { id: `msg_${Date.now()}_err`, role: 'assistant', content: err instanceof Error ? err.message : 'Something went wrong. Please try again.', isError: true }])
    } finally { setIsLoading(false) }
  }, [isLoading, messages, onIntentParsed, mode, canvasBlocks, voiceEnabled, synth, speech])

  useEffect(() => {
    if (!speech.isListening && speech.transcript) {
      const text = speech.transcript
      speech.clearTranscript()
      if (voiceMode && text.trim()) sendMessage(text)
      else setInput(text)
    }
  }, [speech.isListening, speech.transcript, speech.clearTranscript, voiceMode, sendMessage])

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) } }
  const handleTemplate = (text: string) => { setInput(text); inputRef.current?.focus() }

  const configured = isGroqConfigured()
  const showTemplates = messages.length <= 1

  if (!isOpen) return null

  return (
    <div className="zuik-chat-panel">
      <div className="zuik-chat-header">
        <div className="zuik-chat-header-left">
          {mode === 'advisor' ? <LightbulbIcon /> : <SparklesIcon />}
          <span>{mode === 'advisor' ? 'Smart Advisor' : 'Intent Builder'}</span>
        </div>
        <div className="zuik-chat-mode-toggle">
          <button className={`zuik-chat-mode-btn${mode === 'builder' ? ' active' : ''}`} onClick={() => handleModeSwitch('builder')}><WrenchIcon /> Builder</button>
          <button className={`zuik-chat-mode-btn${mode === 'advisor' ? ' active' : ''}`} onClick={() => handleModeSwitch('advisor')}><LightbulbIcon size={12} /> Advisor</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {synth.supported && (
            <button className={`zuik-chat-mode-btn${voiceEnabled ? ' active' : ''}`} onClick={() => { setVoiceEnabled((v) => !v); if (synth.isSpeaking) synth.stop() }} title={voiceEnabled ? 'Mute AI voice' : 'Enable AI voice'} style={{ padding: '3px 6px' }}>
              {voiceEnabled ? <VolumeIcon /> : <VolumeMuteIcon />}
            </button>
          )}
          {speech.supported && (
            <button className={`zuik-chat-mode-btn${voiceMode ? ' active' : ''}`} onClick={() => { const next = !voiceMode; setVoiceMode(next); if (next) speech.start(); else { speech.stop(); synth.stop() } }} title={voiceMode ? 'Stop voice conversation' : 'Start voice conversation'} style={{ padding: '3px 6px' }}>
              {voiceMode ? <PhoneOffIcon /> : <PhoneIcon />}
            </button>
          )}
          <button className="zuik-chat-close" onClick={() => { synth.stop(); speech.stop(); setVoiceMode(false); onClose() }}><XIcon /></button>
        </div>
      </div>

      {canvasBlocks && canvasBlocks.length > 0 && (
        <div className="zuik-chat-canvas-badge"><FileSearchIcon /> <span>{canvasBlocks.length} block{canvasBlocks.length !== 1 ? 's' : ''} on canvas - AI can see your workflow</span></div>
      )}

      {voiceMode && (
        <div className="zuik-chat-voice-status">
          <div className={`zuik-voice-indicator ${speech.isListening ? 'listening' : synth.isSpeaking ? 'speaking' : 'idle'}`}>
            {speech.isListening ? <><MicIcon /> Listening...</> : synth.isSpeaking ? <><VolumeIcon /> Speaking...</> : isLoading ? <><SparklesIcon size={12} /> Thinking...</> : <><MicIcon /> Say something...</>}
          </div>
        </div>
      )}

      <div className="zuik-chat-messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`zuik-chat-msg zuik-chat-msg-${msg.role}${msg.isError ? ' zuik-chat-msg-error' : ''}`}>
            {msg.role === 'system' && <div className="zuik-chat-system"><MessageIcon /><span>{msg.content}</span></div>}
            {msg.role === 'user' && <div className="zuik-chat-bubble zuik-chat-bubble-user">{msg.content}</div>}
            {msg.role === 'assistant' && (
              <div className={`zuik-chat-bubble zuik-chat-bubble-assistant${msg.isError ? ' error' : ''}`}>
                {msg.isError && <AlertIcon />}
                <div>
                  <p style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</p>
                  {msg.intent && (
                    <div className="zuik-chat-intent-badge">
                      <SparklesIcon size={12} />
                      <span>{msg.intent.steps.length} block{msg.intent.steps.length !== 1 ? 's' : ''} added to canvas</span>
                      {msg.intent.confidence > 0 && <span className="zuik-chat-confidence">{Math.round(msg.intent.confidence * 100)}% confidence</span>}
                    </div>
                  )}
                  {msg.intent?.strategy_name && (
                    <div className="zuik-chat-strategy-badge">
                      <TrendingUpIcon />
                      <span className="zuik-chat-strategy-name">{msg.intent.strategy_name}</span>
                      {msg.intent.risk_level && <span className="zuik-chat-risk" style={{ color: RISK_COLORS[msg.intent.risk_level] ?? 'var(--z-text-muted)' }}>{msg.intent.risk_level}</span>}
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
              <div className="zuik-chat-typing"><span /><span /><span /></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {showTemplates && (
        <div className="zuik-chat-templates">
          {mode === 'advisor' ? ADVISOR_STARTERS.map((t) => (
            <button key={t.label} className="zuik-chat-template-btn" onClick={() => handleTemplate(t.text)}><t.Icon size={12} /> {t.label}</button>
          )) : INTENT_TEMPLATES.map((t) => (
            <button key={t.label} className="zuik-chat-template-btn" onClick={() => handleTemplate(t.text)}><ChevronRightIcon /> {t.label}</button>
          ))}
        </div>
      )}

      {!configured && (
        <div className="zuik-chat-warning"><AlertIcon /> <span>Set <code>VITE_GROQ_API_KEY</code> in your .env to enable AI intent parsing.</span></div>
      )}

      <div className="zuik-chat-input-area">
        {speech.supported && (
          <button className={`zuik-chat-mic${speech.isListening ? ' active' : ''}`} onClick={speech.isListening ? speech.stop : speech.start} title={speech.isListening ? 'Stop recording' : 'Voice input'}>
            {speech.isListening ? <MicOffIcon /> : <MicIcon />}
          </button>
        )}
        <input ref={inputRef} className="zuik-chat-input" value={speech.isListening ? speech.transcript || input : input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder={speech.isListening ? 'Listening...' : mode === 'advisor' ? 'Ask for a strategy or type "describe"...' : 'Describe your workflow or type "describe"...'} disabled={isLoading || speech.isListening} />
        <button className="zuik-chat-send" onClick={() => sendMessage(input)} disabled={!input.trim() || isLoading}><SendIcon /></button>
      </div>
    </div>
  )
}
