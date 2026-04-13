import { useRef, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useWallet } from '@txnlab/use-wallet-react'
import zuikLogo from '../assets/zuik-logo.png'

interface LandingProps {
  onConnectWallet: () => void
  onStartBuilding: () => void
}

function useReveal() {
  const ref = useRef<HTMLDivElement>(null!)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect() } },
      { threshold: 0.12 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return { ref, visible }
}

function useCounter(target: number, duration = 2000, trigger = false) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!trigger) return
    let frame: number
    const start = performance.now()
    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      setCount(Math.round(target * progress))
      if (progress < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [target, duration, trigger])
  return count
}

/* ── SVG Icons ────────────────────────────────────────── */

function ArrowRight() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
}
function WalletIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/></svg>
}
function MicIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
}
function BranchIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>
}
function ZapIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>
}
function GridIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>
}
function BrainIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/></svg>
}
function TrendIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
}
function ShieldCheck() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>
}
function LockIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
}
function TimerIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/></svg>
}
function LeafIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.9C15.5 4.9 17 3.5 19 2c1 2 2 4.5 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>
}
function GithubIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
}
function TelegramIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0h-.056zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
}

const MARQUEE_ITEMS = [
  'VOICE TO WORKFLOW',
  'ATOMIC TRANSACTIONS',
  'AI INTENT ENGINE',
  'DEX AGGREGATION',
  'NON CUSTODIAL',
  'TELEGRAM ALERTS',
  'DCA AUTOMATION',
  'STOP LOSS',
  'PORTFOLIO REBALANCE',
  'PRICE MONITORING',
]

/* ── Laptop Display Visual ─────────────────────────────── */

function LaptopVisual() {
  return (
    <div className="z-laptop">
      <div className="z-laptop-tilt">
        <div className="z-laptop-bezel">
          <div className="z-laptop-camera" />
          <div className="z-laptop-screen">
            <div className="z-screen-toolbar">
              <div className="z-screen-dots"><span /><span /><span /></div>
              <span className="z-screen-title">Zuik Flow Builder</span>
            </div>
            <div className="z-screen-canvas z-screen-canvas-flow">
              <svg className="z-wf-edges" viewBox="0 0 100 100" preserveAspectRatio="none" fill="none" aria-hidden>
                <path d="M 31 50 L 36 50" stroke="rgba(0,229,255,0.4)" strokeWidth="0.5" strokeLinecap="round" />
                <path d="M 61 50 L 66 50" stroke="rgba(0,229,255,0.4)" strokeWidth="0.5" strokeLinecap="round" />
                <circle cx="33.5" cy="50" r="0.6" fill="rgba(0,229,255,0.5)" />
                <circle cx="63.5" cy="50" r="0.6" fill="rgba(0,229,255,0.5)" />
              </svg>

              <div className="z-wf-block z-wf-block-1">
                <div className="z-wf-block-h"><i style={{ background: '#A78BFA' }} />Wallet Event</div>
                <div className="z-wf-block-b">When USDC is received on your wallet.</div>
                <span className="z-wf-handle" />
              </div>
              <div className="z-wf-block z-wf-block-2">
                <div className="z-wf-block-h"><i style={{ background: '#00E5FF' }} />Swap Token</div>
                <div className="z-wf-block-b">USDC to ALGO on Tinyman.</div>
                <span className="z-wf-handle" />
              </div>
              <div className="z-wf-block z-wf-block-3">
                <div className="z-wf-block-h"><i style={{ background: '#34D399' }} />Telegram</div>
                <div className="z-wf-block-b">Send confirmation to your chat.</div>
                <span className="z-wf-handle" />
              </div>
            </div>
          </div>
        </div>
        <div className="z-laptop-base">
          <div className="z-laptop-notch" />
        </div>
      </div>
    </div>
  )
}

export default function Landing({ onConnectWallet, onStartBuilding }: LandingProps) {
  const { activeAddress } = useWallet()
  const [scrollY, setScrollY] = useState(0)

  const shortAddr = activeAddress
    ? `${activeAddress.slice(0, 4)}...${activeAddress.slice(-4)}`
    : null

  useEffect(() => {
    const container = document.querySelector('.landing-scroll') as HTMLElement | null
    if (!container) return
    const onScroll = () => setScrollY(container.scrollTop)
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => container.removeEventListener('scroll', onScroll)
  }, [])

  const problemReveal = useReveal()
  const stepsReveal = useReveal()
  const featReveal = useReveal()
  const statsReveal = useReveal()
  const ctaReveal = useReveal()

  const blockCount = useCounter(30, 1800, statsReveal.visible)
  const feeCount = useCounter(1, 1800, statsReveal.visible)

  return (
    <div className="landing-scroll">
      <div className="landing-mesh" aria-hidden />

      {/* ── Navbar ──────────────────────────────────────── */}
      <nav className={`landing-nav${scrollY > 40 ? ' scrolled' : ''}`}>
        <Link to="/" className="landing-nav-brand">
          <img src={zuikLogo} alt="Zuik" style={{ width: 40, height: 40 }} />
          <span>ZUIK</span>
        </Link>
        <div className="landing-nav-right">
          {shortAddr ? (
            <button className="landing-wallet-btn connected" onClick={onConnectWallet}>
              <WalletIcon /> {shortAddr}
            </button>
          ) : (
            <button className="landing-wallet-btn" onClick={onConnectWallet}>
              <WalletIcon /> Connect Wallet
            </button>
          )}
        </div>
      </nav>

      {/* ── Hero: Text Left, Animated Flow Right ────────── */}
      <section className="landing-hero">
        <div className="landing-hero-glow" />
        <div className="landing-hero-split">
          <div className="landing-hero-left">
            <h1 className="landing-hero-title">
              <span className="landing-hero-line-1">AUTOMATE</span>
              <span className="landing-hero-line-1">YOUR <span className="landing-gradient-text">DeFi</span></span>
            </h1>
            <p className="landing-hero-subtitle">
              Speak, type, or drag. Zuik translates your intent into
              atomic transactions on Algorand - no code, no complexity.
            </p>
            <div className="landing-hero-ctas">
              <button className="landing-cta-primary" onClick={onStartBuilding}>
                LAUNCH BUILDER <ArrowRight />
              </button>
            </div>
          </div>

          <div className="landing-hero-right">
            <LaptopVisual />
          </div>
        </div>
      </section>

      {/* ── Marquee Strip ───────────────────────────────── */}
      <div className="landing-marquee">
        <div className="landing-marquee-track">
          {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
            <span key={i} className="landing-marquee-item">
              {item}
              <span className="landing-marquee-sep">/</span>
            </span>
          ))}
        </div>
      </div>

      {/* Journey roadmap starts here */}
      <div className="z-journey-wrapper">
        <div className="z-journey-line" />

      {/* ── The Problem ─────────────────────────────────── */}
      <section className="landing-section">
        <div ref={problemReveal.ref} className={`landing-section-inner${problemReveal.visible ? ' revealed' : ''}`}>
          <div className="z-section-label">// THE PROBLEM</div>
          <h2 className="landing-section-title">DeFi is powerful but inaccessible</h2>
          <p className="landing-section-subtitle">
            Managing token swaps, setting price alerts, rebalancing portfolios -
            it all requires constant monitoring, multiple tools, and deep technical knowledge.
            Zuik changes that.
          </p>
        </div>
      </section>

      {/* ── How It Works ────────────────────────────────── */}
      <section className="landing-section">
        <div ref={stepsReveal.ref} className={`landing-section-inner${stepsReveal.visible ? ' revealed' : ''}`}>
          <div className="z-section-label">// HOW IT WORKS</div>
          <h2 className="landing-section-title">Three steps. That's it.</h2>
          <div className="landing-steps-row">
            {[
              { n: '01', Icon: MicIcon, title: 'Describe Your Intent', desc: 'Use voice, text, or drag blocks onto the canvas. Say "Swap 50 USDC to ALGO" and the AI builds it instantly.' },
              { n: '02', Icon: BranchIcon, title: 'Review & Simulate', desc: 'Visual cards show every step. Simulate the full transaction, check fees, and verify safety guards before signing.' },
              { n: '03', Icon: ZapIcon, title: 'Execute Atomically', desc: 'One signature, multiple transactions. All-or-nothing execution on Algorand with sub-5-second finality.' },
            ].map((step, i) => (
              <div key={step.n} className="z-step-card" style={{ animationDelay: `${i * 0.12}s` }}>
                <div className="z-step-number">{step.n}</div>
                <div className="z-step-icon"><step.Icon /></div>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────── */}
      <section className="landing-section">
        <div ref={featReveal.ref} className={`landing-section-inner${featReveal.visible ? ' revealed' : ''}`}>
          <div className="z-section-label">// CAPABILITIES</div>
          <h2 className="landing-section-title">Built for real DeFi users</h2>
          <div className="z-features-grid">
            {[
              { Icon: GridIcon, title: 'Visual Flow Builder', desc: 'Drag-and-drop blocks - connect triggers, actions, and logic without code.' },
              { Icon: BrainIcon, title: 'AI Intent Engine', desc: 'Describe what you want in plain English. The AI builds the entire workflow.' },
              { Icon: ZapIcon, title: 'Atomic Execution', desc: 'All-or-nothing. If any step fails, the entire workflow rolls back.' },
              { Icon: TrendIcon, title: 'DEX Aggregation', desc: 'Best swap routes via Folks Router and Tinyman with multi-hop routing.' },
              { Icon: LockIcon, title: 'Non-Custodial', desc: 'Your keys, your tokens. Every transaction requires your wallet signature.' },
              { Icon: ShieldCheck, title: 'Smart Advisor', desc: 'AI-powered strategy recommendations, risk assessments, and portfolio guidance.' },
            ].map((f) => (
              <div key={f.title} className="z-feature-card">
                <div className="z-feature-icon"><f.Icon /></div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Network Stats ───────────────────────────────── */}
      <section className="landing-section">
        <div ref={statsReveal.ref} className={`landing-section-inner${statsReveal.visible ? ' revealed' : ''}`}>
          <div className="z-section-label">// NETWORK</div>
          <h2 className="landing-section-title">Powered by Algorand</h2>
          <div className="z-stats-row">
            <div className="z-stat">
              <TimerIcon />
              <span className="z-stat-value">&lt; 4.5s</span>
              <span className="z-stat-label">Finality</span>
            </div>
            <div className="z-stat">
              <WalletIcon />
              <span className="z-stat-value">~0.00{feeCount}</span>
              <span className="z-stat-label">ALGO / Txn</span>
            </div>
            <div className="z-stat">
              <BranchIcon />
              <span className="z-stat-value">{blockCount}+</span>
              <span className="z-stat-label">Block Types</span>
            </div>
            <div className="z-stat">
              <LeafIcon />
              <span className="z-stat-value">Carbon -</span>
              <span className="z-stat-label">Green Chain</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────── */}
      <section className="landing-section" style={{ paddingBottom: 'clamp(100px, 14vh, 160px)' }}>
        <div ref={ctaReveal.ref} className={`landing-section-inner z-cta-block${ctaReveal.visible ? ' revealed' : ''}`}>
          <h2>Ready to automate your DeFi?</h2>
          <p>Start building workflows for free on Algorand TestNet.</p>
          <button className="landing-cta-primary large" onClick={onStartBuilding}>
            LAUNCH BUILDER <ArrowRight />
          </button>
        </div>
      </section>

      </div>{/* end z-journey-wrapper */}

      {/* ── Footer ──────────────────────────────────────── */}
      <footer className="landing-footer">
        <div className="z-footer-inner">
          <Link to="/" className="landing-nav-brand">
            <img src={zuikLogo} alt="Zuik" style={{ width: 28, height: 28 }} />
            <span>ZUIK</span>
          </Link>
          <span className="z-footer-sep">|</span>
          <span className="z-footer-tagline">DeFi Automation on Algorand</span>
          <div className="z-footer-links">
            <a href="https://github.com/DarshanKrishna-DK/Zuik" target="_blank" rel="noopener noreferrer"><GithubIcon /> GitHub</a>
            <a href={`https://t.me/${import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'ZuikDeFiBot'}`} target="_blank" rel="noopener noreferrer"><TelegramIcon /> Telegram</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
