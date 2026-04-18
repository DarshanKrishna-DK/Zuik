import { useState, useRef, useEffect, useCallback } from 'react'
import { parseIntent, isGroqConfigured } from '../../services/intentParser'
import type { ParsedIntent, CanvasBlock, UserContext } from '../../services/intentParser'
import { 
  useEnhancedSpeechRecognition, 
  synthesizeSpeech, 
  playAudio, 
  checkVoiceServiceHealth 
} from '../../services/voiceService'

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
  userContext?: UserContext
}

/* ── Inline SVG Icons ─────────────────────────────────── */
function MessageIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg> }
function SendIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/></svg> }
function MicIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg> }
function XIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg> }
function BrainCircuitIcon({ size = 16 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M19.938 10.5a4 4 0 0 1 .585.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M19.967 17.484A4 4 0 0 1 18 18"/></svg> }
function ChevronRightIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg> }
function AlertIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg> }
function LightbulbIcon({ size = 16 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg> }
function WrenchIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg> }
function TrendingUpIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg> }
function ShieldIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg> }
function ZapIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg> }
function FileSearchIcon({ size = 12 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M4.268 21a2 2 0 0 0 1.727 1H18a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v3"/><path d="m9 18-1.5-1.5"/><circle cx="5" cy="14" r="3"/></svg> }
function PhoneIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg> }

function GirlSupportAvatar() {
  return (
    <svg viewBox="0 0 100 100" role="img" aria-label="Zuik support" width="100%" height="100%">
      <defs>
        <linearGradient id="zuikCallSkin" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f3cbb8" />
          <stop offset="100%" stopColor="#e8b4a2" />
        </linearGradient>
        <linearGradient id="zuikCallHair" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#5c3d2e" />
          <stop offset="100%" stopColor="#3d2618" />
        </linearGradient>
      </defs>
      <ellipse cx="50" cy="62" rx="36" ry="34" fill="url(#zuikCallHair)" />
      <ellipse cx="50" cy="48" rx="24" ry="28" fill="url(#zuikCallSkin)" />
      <path
        d="M26 40 Q50 24 74 40 Q70 30 50 28 Q30 30 26 40"
        fill="url(#zuikCallHair)"
      />
      <ellipse cx="41" cy="46" rx="3.2" ry="2.4" fill="#2a1810" />
      <ellipse cx="59" cy="46" rx="3.2" ry="2.4" fill="#2a1810" />
      <path d="M41 58 Q50 65 59 58" stroke="#c97d6a" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <ellipse cx="50" cy="52" rx="5" ry="3" fill="rgba(200,120,100,0.12)" />
    </svg>
  )
}

const INTENT_TEMPLATES = [
  { label: 'Swap tokens', text: 'Swap 50 USDC to ALGO' },
  { label: 'Swap & send', text: 'Swap 10 USDC to ALGO and send to ' },
  { label: 'DCA buy', text: 'Every hour, buy 5 ALGO with USDC' },
  { label: 'Price alert', text: 'Alert me on Telegram if ALGO price drops below 0.15 USDC' },
  { label: 'Auto-swap on receive', text: 'When I receive USDC, swap it all to ALGO' },
  { label: 'Send payment', text: 'Send 10 ALGO to ' },
  { label: 'Buy crypto with fiat', text: 'Buy 1000 INR worth of USDT via Saber on-ramp' },
  { label: 'Describe workflow', text: 'Describe what my current workflow does' },
]

const ADVISOR_STARTERS = [
  { label: 'Suggest a strategy', text: 'I am new to crypto trading. What strategy would you recommend for a beginner with a small budget? Show me amounts in INR too.', Icon: LightbulbIcon },
  { label: 'Set up DCA', text: 'Help me set up a dollar cost averaging strategy to accumulate ALGO over the next month. Show fees in INR.', Icon: TrendingUpIcon },
  { label: 'Protect my portfolio', text: 'I hold ALGO and want to protect against a big price drop. What can I do?', Icon: ShieldIcon },
  { label: 'Explain my workflow', text: 'Describe and analyze my current workflow on the canvas', Icon: FileSearchIcon },
  { label: 'What is slippage?', text: 'Explain slippage in DeFi trading and how it affects my swaps', Icon: ZapIcon },
]

const RISK_COLORS: Record<string, string> = {
  conservative: 'var(--z-success)',
  moderate: 'var(--z-warning)',
  aggressive: 'var(--z-error)',
}

function useEnhancedSpeechSynthesis() {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [useServerTTS, setUseServerTTS] = useState(true) // Default to server-side TTS
  const currentAudioRef = useRef<HTMLAudioElement | null>(null)
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window

  const speak = useCallback(async (text: string, onEnd?: () => void) => {
    // Stop any current playback
    if (currentAudioRef.current) {
      currentAudioRef.current.pause()
      currentAudioRef.current = null
    }
    
    if (useServerTTS) {
      // Use server-side ElevenLabs TTS
      try {
        setIsSpeaking(true)
        const audioData = await synthesizeSpeech(text, { autoDetectLanguage: true })
        const audio = await playAudio(audioData)
        currentAudioRef.current = audio
        
        audio.addEventListener('ended', () => {
          setIsSpeaking(false)
          currentAudioRef.current = null
          onEnd?.()
        }, { once: true })
        
        audio.addEventListener('error', () => {
          setIsSpeaking(false)
          currentAudioRef.current = null
          onEnd?.()
        }, { once: true })
        
      } catch (error) {
        console.error('[EnhancedTTS] Server TTS failed, falling back to browser:', error)
        setIsSpeaking(false)
        
        // Fallback to browser TTS
        if (supported) {
          fallbackToBrowserTTS(text, onEnd)
        } else {
          onEnd?.()
        }
      }
    } else {
      // Use browser TTS
      fallbackToBrowserTTS(text, onEnd)
    }
  }, [useServerTTS, supported])

  const fallbackToBrowserTTS = useCallback((text: string, onEnd?: () => void) => {
    if (!supported) {
      onEnd?.()
      return
    }
    
    window.speechSynthesis.cancel()
    const cleaned = text.replace(/[*_#`]/g, '').replace(/\n+/g, '. ')
    const utt = new SpeechSynthesisUtterance(cleaned)
    const voices = window.speechSynthesis.getVoices()
    const preferred = voices.find((v) => v.lang.startsWith('en') && v.name.includes('Google')) ??
      voices.find((v) => v.lang.startsWith('en') && v.localService) ??
      voices.find((v) => v.lang.startsWith('en'))
    if (preferred) utt.voice = preferred
    utt.rate = 1.0; utt.pitch = 1.05
    utt.onstart = () => setIsSpeaking(true)
    utt.onend = () => { setIsSpeaking(false); onEnd?.() }
    utt.onerror = () => { setIsSpeaking(false); onEnd?.() }
    window.speechSynthesis.speak(utt)
  }, [supported])

  const stop = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause()
      currentAudioRef.current = null
    }
    if (supported) {
      window.speechSynthesis.cancel()
    }
    setIsSpeaking(false)
  }, [supported])

  return { isSpeaking, speak, stop, supported: supported || true, useServerTTS, setUseServerTTS }
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
    utt.rate = 1.0; utt.pitch = 1.05
    utt.onstart = () => setIsSpeaking(true)
    utt.onend = () => { setIsSpeaking(false); onEnd?.() }
    utt.onerror = () => { setIsSpeaking(false); onEnd?.() }
    window.speechSynthesis.speak(utt)
  }, [supported])

  const stop = useCallback(() => { window.speechSynthesis.cancel(); setIsSpeaking(false) }, [])
  return { isSpeaking, speak, stop, supported }
}

const BUILDER_WELCOME = 'Describe what you want to do in plain language - or pick a template below. I will build the workflow for you.'
const ADVISOR_WELCOME = 'I am your Smart Trading Advisor. Tell me about your goals, risk tolerance, or what you want to achieve. I can also show amounts in INR or your preferred currency.'

export default function ChatPanel({ isOpen, onClose, onIntentParsed, canvasBlocks, userContext }: Props) {
  const [mode, setMode] = useState<'builder' | 'advisor'>('builder')
  const builderMsgs = useRef<ChatMessage[]>([
    { id: 'welcome_builder', role: 'system', content: BUILDER_WELCOME },
  ])
  const advisorMsgs = useRef<ChatMessage[]>([
    { id: 'welcome_advisor', role: 'system', content: ADVISOR_WELCOME },
  ])
  const [messages, setMessages] = useState<ChatMessage[]>(builderMsgs.current)
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [voiceMode, setVoiceMode] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const speech = useEnhancedSpeechRecognition()
  const synth = useEnhancedSpeechSynthesis()
  const [voiceServiceHealth, setVoiceServiceHealth] = useState({ available: false, services: { groq: false, elevenlabs: false } })
  const voiceModeRef = useRef(false)

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => { if (isOpen) inputRef.current?.focus() }, [isOpen])
  useEffect(() => { voiceModeRef.current = voiceMode }, [voiceMode])

  // Check voice service health on mount
  useEffect(() => {
    checkVoiceServiceHealth().then(setVoiceServiceHealth)
  }, [])

  const handleModeSwitch = (newMode: 'builder' | 'advisor') => {
    // Save current conversation to the appropriate ref
    if (mode === 'builder') builderMsgs.current = messages
    else advisorMsgs.current = messages

    setMode(newMode)
    const restored = newMode === 'builder' ? builderMsgs.current : advisorMsgs.current
    setMessages(restored)
  }

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isLoading) return

    const userMsg: ChatMessage = { id: `msg_${Date.now()}`, role: 'user', content: trimmed }
    setMessages((prev) => {
      const next = [...prev, userMsg]
      if (mode === 'builder') builderMsgs.current = next
      else advisorMsgs.current = next
      return next
    })
    setInput('')
    setIsLoading(true)

    try {
      const history = messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
      const intent = await parseIntent(trimmed, history, mode === 'advisor', canvasBlocks, userContext)
      const displayText = mode === 'advisor' && intent.advisor_message ? intent.advisor_message : intent.explanation

      const hasWorkflow = intent.steps.length > 0
      const hasModification = intent.intent === 'modify_block' && intent.modifications && intent.modifications.length > 0
      const assistantMsg: ChatMessage = {
        id: `msg_${Date.now()}_resp`,
        role: 'assistant',
        content: displayText,
        intent: (hasWorkflow || hasModification) ? intent : undefined,
      }
      setMessages((prev) => {
        const next = [...prev, assistantMsg]
        if (mode === 'builder') builderMsgs.current = next
        else advisorMsgs.current = next
        return next
      })

      if (hasWorkflow || hasModification) onIntentParsed(intent)

      if (voiceMode && synth.supported && displayText) {
        synth.speak(displayText, () => {
          if (voiceModeRef.current && speech.supported) setTimeout(() => speech.start(), 400)
        })
      }
    } catch (err) {
      const errMsg: ChatMessage = { id: `msg_${Date.now()}_err`, role: 'assistant', content: err instanceof Error ? err.message : 'Something went wrong. Please try again.', isError: true }
      setMessages((prev) => {
        const next = [...prev, errMsg]
        if (mode === 'builder') builderMsgs.current = next
        else advisorMsgs.current = next
        return next
      })
    } finally { setIsLoading(false) }
  }, [isLoading, messages, onIntentParsed, mode, canvasBlocks, voiceMode, synth, speech])

  useEffect(() => {
    if (!speech.isListening && !speech.isTranscribing && speech.transcript) {
      const text = speech.transcript
      speech.clearTranscript()
      if (voiceMode && text.trim()) {
        sendMessage(text)
      } else {
        setInput(text)
      }
    }
  }, [speech.isListening, speech.isTranscribing, speech.transcript, speech.clearTranscript, voiceMode, sendMessage])

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) } }
  const handleTemplate = (text: string) => { setInput(text); inputRef.current?.focus() }

  const [callDuration, setCallDuration] = useState(0)
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startVoiceCall = () => {
    setVoiceMode(true)
    setCallDuration(0)
    callTimerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000)
    speech.start()
  }

  const endVoiceCall = () => {
    setVoiceMode(false)
    speech.stop()
    synth.stop()
    if (callTimerRef.current) { clearInterval(callTimerRef.current); callTimerRef.current = null }
  }

  useEffect(() => {
    return () => { if (callTimerRef.current) clearInterval(callTimerRef.current) }
  }, [])

  const configured = isGroqConfigured()
  const showTemplates = messages.length <= 1

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  if (!isOpen) return null

  /* ── Voice Call Fullscreen ──────────────────────────────── */
  if (voiceMode) {
    return (
      <div className="zuik-call-screen">
        <div className="zuik-call-bg" />
        <div className="zuik-call-content">
          <div className="zuik-call-avatar">
            <GirlSupportAvatar />
            <div className={`zuik-call-ring ${speech.isListening ? 'listening' : synth.isSpeaking ? 'speaking' : ''}`} />
          </div>
          <div className="zuik-call-name">Zuik_Support</div>
          <div className="zuik-call-timer">{formatTime(callDuration)}</div>

          <div className="zuik-call-status">
            {speech.isListening && <span className="zuik-call-status-text listening">Listening...</span>}
            {speech.isTranscribing && <span className="zuik-call-status-text listening">Transcribing...</span>}
            {synth.isSpeaking && <span className="zuik-call-status-text speaking">Speaking...</span>}
            {isLoading && !synth.isSpeaking && <span className="zuik-call-status-text thinking">Thinking...</span>}
            {!speech.isListening && !speech.isTranscribing && !synth.isSpeaking && !isLoading && <span className="zuik-call-status-text">Connected</span>}
          </div>

          {/* Last spoken text */}
          {messages.length > 1 && (
            <div className="zuik-call-transcript">
              {messages[messages.length - 1]?.content?.slice(0, 120)}{messages[messages.length - 1]?.content?.length > 120 ? '...' : ''}
            </div>
          )}
        </div>

        <div className="zuik-call-controls">
          <button
            className={`zuik-call-btn mic ${speech.isListening ? 'active' : ''}`}
            onClick={speech.isListening ? speech.stop : speech.start}
            title={speech.isListening ? 'Mute' : 'Unmute'}
          >
            <MicIcon />
          </button>
          <button className="zuik-call-btn end" onClick={endVoiceCall} title="End call">
            <PhoneIcon />
          </button>
        </div>
      </div>
    )
  }

  /* ── Normal Chat Panel ─────────────────────────────────── */
  return (
    <div className="zuik-chat-panel">
      <div className="zuik-chat-header">
        <div className="zuik-chat-header-left">
          {mode === 'advisor' ? <LightbulbIcon /> : <BrainCircuitIcon />}
          <span>{mode === 'advisor' ? 'Smart Advisor' : 'AI Builder'}</span>
        </div>
        <div className="zuik-chat-mode-toggle">
          <button className={`zuik-chat-mode-btn${mode === 'builder' ? ' active' : ''}`} onClick={() => handleModeSwitch('builder')}><WrenchIcon /> Builder</button>
          <button className={`zuik-chat-mode-btn${mode === 'advisor' ? ' active' : ''}`} onClick={() => handleModeSwitch('advisor')}><LightbulbIcon size={12} /> Advisor</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {speech.supported && (
            <button
              className="zuik-chat-mode-btn"
              onClick={startVoiceCall}
              title="Start voice call"
              style={{ padding: '3px 6px' }}
            >
              <PhoneIcon />
            </button>
          )}
          <button className="zuik-chat-close" onClick={() => { synth.stop(); speech.stop(); setVoiceMode(false); onClose() }}><XIcon /></button>
        </div>
      </div>

      {canvasBlocks && canvasBlocks.length > 0 && (
        <div className="zuik-chat-canvas-badge"><FileSearchIcon /> <span>{canvasBlocks.length} block{canvasBlocks.length !== 1 ? 's' : ''} on canvas - AI can see your workflow</span></div>
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
                  {msg.intent && msg.intent.intent === 'modify_block' && msg.intent.modifications && (
                    <div className="zuik-chat-intent-badge" style={{ borderColor: 'var(--z-warning)' }}>
                      <WrenchIcon />
                      <span>{msg.intent.modifications.length} block{msg.intent.modifications.length !== 1 ? 's' : ''} updated</span>
                    </div>
                  )}
                  {msg.intent && msg.intent.steps.length > 0 && (
                    <div className="zuik-chat-intent-badge">
                      <BrainCircuitIcon size={12} />
                      <span>{msg.intent.steps.length} block{msg.intent.steps.length !== 1 ? 's' : ''} added to canvas</span>
                      {msg.intent.confidence > 0 && <span className="zuik-chat-confidence">{Math.round(msg.intent.confidence * 100)}%</span>}
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
          <button
            className={`zuik-chat-mic${speech.isListening ? ' active' : ''}`}
            onClick={speech.isListening ? speech.stop : speech.start}
            title={speech.isListening ? 'Stop recording' : 'Voice input'}
          >
            <MicIcon />
            {speech.isListening && <span className="zuik-mic-live-dot" />}
          </button>
        )}
        <input 
          ref={inputRef} 
          className="zuik-chat-input" 
          value={speech.isListening || speech.isTranscribing ? speech.transcript || input : input} 
          onChange={(e) => setInput(e.target.value)} 
          onKeyDown={handleKeyDown} 
          placeholder={
            speech.isListening ? 'Listening...' : 
            speech.isTranscribing ? 'Transcribing...' :
            mode === 'advisor' ? 'Ask for a strategy or advice...' : 'Describe your workflow...'
          } 
          disabled={isLoading || speech.isListening || speech.isTranscribing} 
        />
        <button className="zuik-chat-send" onClick={() => sendMessage(input)} disabled={!input.trim() || isLoading}><SendIcon /></button>
      </div>
    </div>
  )
}
