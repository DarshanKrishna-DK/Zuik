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
      { threshold: 0.15 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return { ref, visible }
}

function ArrowRightIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
    </svg>
  )
}

function WalletIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
      <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
    </svg>
  )
}

function MicIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  )
}

function GitBranchIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" x2="6" y1="3" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  )
}

function ZapIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
    </svg>
  )
}

function LayoutGridIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" />
    </svg>
  )
}

function SparklesIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
      <path d="M20 3v4" /><path d="M22 5h-4" />
    </svg>
  )
}

function TrendingUpIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
    </svg>
  )
}

function LockIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function ShieldIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    </svg>
  )
}

function TimerIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="10" x2="14" y1="2" y2="2" /><line x1="12" x2="15" y1="14" y2="11" /><circle cx="12" cy="14" r="8" />
    </svg>
  )
}

function LeafIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 20A7 7 0 0 1 9.8 6.9C15.5 4.9 17 3.5 19 2c1 2 2 4.5 2 8 0 5.5-4.78 10-10 10Z" /><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
    </svg>
  )
}

function ExternalLinkIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  )
}

export default function Landing({ onConnectWallet, onStartBuilding }: LandingProps) {
  const howItWorksRef = useRef<HTMLDivElement>(null!)
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

  const stepsReveal = useReveal()
  const featuresReveal = useReveal()
  const algoReveal = useReveal()
  const ctaReveal = useReveal()

  return (
    <div className="landing-scroll">
      <div className="landing-grid-bg" />

      {/* Nav */}
      <nav className={`landing-nav${scrollY > 60 ? ' scrolled' : ''}`}>
        <Link to="/" className="landing-nav-brand">
          <img src={zuikLogo} alt="Zuik" />
          <span>Zuik</span>
        </Link>
        <div className="landing-nav-right">
          {shortAddr ? (
            <button className="landing-wallet-btn connected" onClick={onConnectWallet}>
              <WalletIcon />
              {shortAddr}
            </button>
          ) : (
            <button className="landing-wallet-btn" onClick={onConnectWallet}>
              <WalletIcon />
              Connect Wallet
            </button>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="landing-hero">
        <div className="landing-hero-glow" />

        <div className="landing-hero-split">
          <div className="landing-hero-left">
            <div className="landing-mockup">
              <div className="landing-mockup-toolbar">
                <div className="mockup-dot red" />
                <div className="mockup-dot yellow" />
                <div className="mockup-dot green" />
                <span className="mockup-title">Zuik - Flow Builder</span>
              </div>
              <div className="landing-mockup-canvas">
                <svg className="landing-mockup-lines" viewBox="0 0 440 220" fill="none">
                  <path d="M 100 55 C 155 55, 145 110, 200 110" stroke="url(#lineGrad)" strokeWidth="2" opacity="0.8" strokeDasharray="6 4">
                    <animate attributeName="stroke-dashoffset" from="20" to="0" dur="1.5s" repeatCount="indefinite" />
                  </path>
                  <path d="M 260 110 C 310 110, 300 55, 350 55" stroke="url(#lineGrad)" strokeWidth="2" opacity="0.8" strokeDasharray="6 4">
                    <animate attributeName="stroke-dashoffset" from="20" to="0" dur="1.5s" repeatCount="indefinite" />
                  </path>
                  <path d="M 260 110 C 310 110, 300 165, 350 165" stroke="url(#lineGrad)" strokeWidth="2" opacity="0.8" strokeDasharray="6 4">
                    <animate attributeName="stroke-dashoffset" from="20" to="0" dur="1.5s" repeatCount="indefinite" />
                  </path>
                  <defs>
                    <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#E8913A" stopOpacity="0.3" />
                      <stop offset="50%" stopColor="#E8913A" stopOpacity="1" />
                      <stop offset="100%" stopColor="#F5C07A" stopOpacity="0.3" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="mockup-node mockup-node-enter" style={{ left: 16, top: 30 }}>
                  <div className="mockup-node-dot trigger" />
                  <span>Price Trigger</span>
                </div>
                <div className="mockup-node mockup-node-enter delay-1" style={{ left: 166, top: 85 }}>
                  <div className="mockup-node-dot action" />
                  <span>Swap USDC to ALGO</span>
                </div>
                <div className="mockup-node mockup-node-enter delay-2" style={{ left: 316, top: 30 }}>
                  <div className="mockup-node-dot action" />
                  <span>Send Payment</span>
                </div>
                <div className="mockup-node mockup-node-enter delay-3" style={{ left: 316, top: 140 }}>
                  <div className="mockup-node-dot notification" />
                  <span>Notify</span>
                </div>
              </div>
            </div>
          </div>

          <div className="landing-hero-right">
            <h1 className="landing-hero-title">
              DeFi Automation,{' '}
              <span className="landing-gradient-text">Reimagined</span>
            </h1>
            <p className="landing-hero-subtitle">
              Describe your intent in plain English or drag visual blocks.
              Zuik builds, simulates, and executes workflows atomically on Algorand.
            </p>
            <div className="landing-hero-ctas">
              <button className="landing-cta-primary" onClick={onStartBuilding}>
                Start Building <ArrowRightIcon />
              </button>
              <button
                className="landing-cta-ghost"
                onClick={() => howItWorksRef.current?.scrollIntoView({ behavior: 'smooth' })}
              >
                See How It Works
              </button>
            </div>

            <div className="landing-hero-stats">
              <div className="landing-hero-stat">
                <span className="landing-hero-stat-value">&lt; 4.5s</span>
                <span className="landing-hero-stat-label">Finality</span>
              </div>
              <div className="landing-hero-stat-divider" />
              <div className="landing-hero-stat">
                <span className="landing-hero-stat-value">30+</span>
                <span className="landing-hero-stat-label">Block Types</span>
              </div>
              <div className="landing-hero-stat-divider" />
              <div className="landing-hero-stat">
                <span className="landing-hero-stat-value">0.001</span>
                <span className="landing-hero-stat-label">ALGO / Txn</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section ref={howItWorksRef} className="landing-section">
        <div
          ref={stepsReveal.ref}
          className={`landing-section-inner${stepsReveal.visible ? ' revealed' : ''}`}
        >
          <p className="landing-section-label">WORKFLOW</p>
          <h2 className="landing-section-title">Three steps. That's it.</h2>
          <div className="landing-steps">
            {[
              { num: '01', Icon: MicIcon, title: 'Describe Your Intent', desc: 'Use voice, text, or drag blocks onto the canvas. Say "Swap 50 USDC to ALGO" and the AI builds it.' },
              { num: '02', Icon: GitBranchIcon, title: 'Review & Simulate', desc: 'Visual cards show every step. Simulate the transaction, check fees, and verify safety guards before signing.' },
              { num: '03', Icon: ZapIcon, title: 'Execute Atomically', desc: 'One signature, multiple transactions. All-or-nothing execution on Algorand with fast finality.' },
            ].map((step) => (
              <div key={step.num} className="landing-step-card">
                <div className="landing-step-top" />
                <div className="landing-step-num">{step.num}</div>
                <div className="landing-step-icon">
                  <step.Icon />
                </div>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="landing-section landing-section-alt">
        <div
          ref={featuresReveal.ref}
          className={`landing-section-inner${featuresReveal.visible ? ' revealed' : ''}`}
        >
          <p className="landing-section-label">CAPABILITIES</p>
          <h2 className="landing-section-title">Everything you need</h2>
          <div className="landing-features-grid">
            {[
              { Icon: LayoutGridIcon, title: 'Visual Flow Builder', desc: 'Drag-and-drop blocks. Connect actions, triggers, and logic nodes to build complex workflows without code.' },
              { Icon: SparklesIcon, title: 'AI Intent Engine', desc: 'Describe what you want in plain language. Zuik translates your intent into a fully connected workflow graph.' },
              { Icon: ZapIcon, title: 'Atomic Execution', desc: 'All transactions execute as an atomic group. If any step fails, everything rolls back safely.' },
              { Icon: TrendingUpIcon, title: 'DEX Aggregation', desc: 'Best swap routes via Folks Router. Multi-hop routing finds the optimal path for your token swaps.' },
              { Icon: LockIcon, title: 'Non-Custodial', desc: 'Your keys, your tokens, always. Zuik never holds your funds - every transaction requires your wallet signature.' },
              { Icon: ShieldIcon, title: 'Smart Advisor', desc: 'AI-powered proactive suggestions. Get strategy recommendations, risk assessments, and portfolio guidance.' },
            ].map((f) => (
              <div key={f.title} className="landing-feature-card">
                <div className="landing-feature-icon">
                  <f.Icon />
                </div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Algorand stats */}
      <section className="landing-section landing-algorand">
        <div
          ref={algoReveal.ref}
          className={`landing-section-inner${algoReveal.visible ? ' revealed' : ''}`}
        >
          <p className="landing-section-label" style={{ color: '#38BDF8' }}>INFRASTRUCTURE</p>
          <h2 className="landing-section-title">Powered by Algorand</h2>
          <p className="landing-section-subtitle">
            Fast finality, low fees, and native atomic transaction groups
            for reliable, composable DeFi automation.
          </p>
          <div className="landing-algo-stats">
            {[
              { Icon: TimerIcon, label: 'Fast Finality', value: '< 4.5s' },
              { Icon: WalletIcon, label: 'Low Fees', value: '~0.001 ALGO' },
              { Icon: GitBranchIcon, label: 'Atomic Groups', value: 'Native' },
              { Icon: LeafIcon, label: 'Carbon Negative', value: 'Green' },
            ].map((stat) => (
              <div key={stat.label} className="landing-algo-stat">
                <stat.Icon />
                <div>
                  <span className="landing-algo-value">{stat.value}</span>
                  <span className="landing-algo-label">{stat.label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="landing-cta-section">
        <div className="landing-cta-glow" />
        <div
          ref={ctaReveal.ref}
          className={`landing-cta-inner${ctaReveal.visible ? ' revealed' : ''}`}
        >
          <h2>Ready to automate your DeFi?</h2>
          <p>Start building workflows for free on Algorand Testnet.</p>
          <button className="landing-cta-primary large" onClick={onStartBuilding}>
            Start Building - It's Free <ArrowRightIcon />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="landing-footer-brand">
            <Link to="/" className="landing-nav-brand">
              <img src={zuikLogo} alt="Zuik" />
              <span>Zuik</span>
            </Link>
            <p>Intent-based DeFi automation on Algorand.</p>
          </div>
          <div className="landing-footer-links">
            <div className="landing-footer-col">
              <h4>Product</h4>
              <Link to="/builder">Builder</Link>
              <Link to="/dashboard">Dashboard</Link>
              <Link to="/settings">Settings</Link>
            </div>
            <div className="landing-footer-col">
              <h4>Resources</h4>
              <a href="https://github.com/DarshanKrishna-DK/Zuik" target="_blank" rel="noopener noreferrer">
                GitHub <ExternalLinkIcon />
              </a>
              <a href="https://developer.algorand.org" target="_blank" rel="noopener noreferrer">
                Algorand Docs <ExternalLinkIcon />
              </a>
            </div>
          </div>
        </div>
        <div className="landing-footer-bottom">
          <span>&copy; {new Date().getFullYear()} Zuik</span>
        </div>
      </footer>
    </div>
  )
}
