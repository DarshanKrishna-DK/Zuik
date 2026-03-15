import { useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  ChevronDown,
  MessageSquare,
  GitBranch,
  Zap,
  LayoutGrid,
  Sparkles,
  Lock,
  Code2,
  Layers,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react'
import zuikLogo from '../assets/zuik-logo.png'

const scrollToSection = (ref: React.RefObject<HTMLDivElement>) => {
  ref.current?.scrollIntoView({ behavior: 'smooth' })
}

export default function Landing() {
  const howItWorksRef = useRef<HTMLDivElement>(null)

  return (
    <div
      className="zuik-page"
      style={{
        overflow: 'auto',
        overflowX: 'hidden',
        flex: 1,
        display: 'block',
        alignItems: 'stretch',
        justifyContent: 'flex-start',
      }}
    >
      {/* 1. Hero Section */}
      <section
        style={{
          minHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '80px 24px 120px',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'min(600px, 90vw)',
            height: 'min(400px, 60vw)',
            background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(249,115,22,0.15) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 32,
            maxWidth: 720,
            textAlign: 'center',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <img
            src={zuikLogo}
            alt="Zuik"
            style={{
              height: 96,
              width: 'auto',
              filter: 'drop-shadow(0 0 40px rgba(249,115,22,0.3))',
            }}
          />
          <div>
            <h1
              style={{
                fontSize: 'clamp(2.25rem, 5vw, 3.5rem)',
                fontWeight: 800,
                color: 'var(--zuik-text)',
                lineHeight: 1.1,
                margin: 0,
                letterSpacing: '-0.03em',
              }}
            >
              DeFi Automation,{' '}
              <span style={{ color: 'var(--zuik-orange)', background: 'linear-gradient(135deg, var(--zuik-orange-light), var(--zuik-orange))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                Simplified
              </span>
            </h1>
            <p
              style={{
                fontSize: '1.125rem',
                color: 'var(--zuik-text-muted)',
                marginTop: 20,
                lineHeight: 1.65,
                maxWidth: 520,
                marginLeft: 'auto',
                marginRight: 'auto',
              }}
            >
              Describe your intent in plain language or drag visual blocks. Zuik builds the workflow and executes it atomically on Algorand.
            </p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
            <Link
              to="/builder"
              className="zuik-btn zuik-btn-primary"
              style={{ fontSize: '1rem', padding: '14px 28px' }}
            >
              Open Builder <ArrowRight size={18} />
            </Link>
            <button
              type="button"
              className="zuik-btn zuik-btn-ghost"
              style={{ fontSize: '1rem', padding: '14px 28px' }}
              onClick={() => scrollToSection(howItWorksRef)}
            >
              Learn More <ChevronDown size={18} />
            </button>
          </div>
        </div>
      </section>

      {/* 2. How It Works */}
      <section
        ref={howItWorksRef}
        style={{
          padding: '100px 24px 120px',
          background: 'linear-gradient(180deg, transparent 0%, var(--zuik-surface) 15%, var(--zuik-surface) 85%, transparent 100%)',
        }}
      >
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <h2
            style={{
              fontSize: 'clamp(1.75rem, 4vw, 2.25rem)',
              fontWeight: 700,
              color: 'var(--zuik-text)',
              textAlign: 'center',
              marginBottom: 16,
              letterSpacing: '-0.02em',
            }}
          >
            How It Works
          </h2>
          <p
            style={{
              fontSize: '1rem',
              color: 'var(--zuik-text-muted)',
              textAlign: 'center',
              marginBottom: 56,
              maxWidth: 480,
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
          >
            Three simple steps from intent to execution.
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 24,
            }}
          >
            {[
              {
                num: '1',
                icon: MessageSquare,
                title: 'Describe your intent',
                desc: 'Use voice, text, or drag blocks. Say "Swap 50 USDC to ALGO" or build visually — Zuik understands both.',
              },
              {
                num: '2',
                icon: GitBranch,
                title: 'Review the workflow',
                desc: 'Visual cards show exactly what will happen. Simulate, tweak parameters, and verify before signing.',
              },
              {
                num: '3',
                icon: Zap,
                title: 'Execute on Algorand',
                desc: 'Atomic, all-or-nothing execution. One signature, multiple transactions. Fast finality, minimal fees.',
              },
            ].map((step) => {
              const Icon = step.icon
              return (
                <div
                  key={step.num}
                  style={{
                    background: 'var(--zuik-surface-2)',
                    border: '1px solid var(--zuik-border)',
                    borderRadius: 16,
                    padding: 28,
                    position: 'relative',
                    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--zuik-text-dim)'
                    e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.2)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--zuik-border)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: 20,
                      right: 20,
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: 'var(--zuik-orange)',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.875rem',
                      fontWeight: 700,
                    }}
                  >
                    {step.num}
                  </div>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      background: 'rgba(249,115,22,0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 20,
                    }}
                  >
                    <Icon size={24} style={{ color: 'var(--zuik-orange)' }} />
                  </div>
                  <h3
                    style={{
                      fontSize: '1.125rem',
                      fontWeight: 600,
                      color: 'var(--zuik-text)',
                      marginBottom: 8,
                    }}
                  >
                    {step.title}
                  </h3>
                  <p
                    style={{
                      fontSize: '0.9375rem',
                      color: 'var(--zuik-text-muted)',
                      lineHeight: 1.6,
                    }}
                  >
                    {step.desc}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* 3. Features Grid */}
      <section
        style={{
          padding: '100px 24px 120px',
        }}
      >
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <h2
            style={{
              fontSize: 'clamp(1.75rem, 4vw, 2.25rem)',
              fontWeight: 700,
              color: 'var(--zuik-text)',
              textAlign: 'center',
              marginBottom: 16,
              letterSpacing: '-0.02em',
            }}
          >
            Built for DeFi Automation
          </h2>
          <p
            style={{
              fontSize: '1rem',
              color: 'var(--zuik-text-muted)',
              textAlign: 'center',
              marginBottom: 56,
              maxWidth: 480,
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
          >
            Everything you need to automate DeFi workflows on Algorand.
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: 20,
            }}
          >
            {[
              { icon: LayoutGrid, title: 'Visual Flow Builder', desc: 'Drag blocks, connect workflows. No code required.' },
              { icon: Sparkles, title: 'Intent Engine', desc: 'Describe in natural language. Zuik translates to actions.' },
              { icon: Zap, title: 'Atomic Transactions', desc: 'All-or-nothing execution on Algorand.' },
              { icon: GitBranch, title: 'DEX Aggregation', desc: 'Best swap routes via Folks Router.' },
              { icon: Lock, title: 'Non-Custodial', desc: 'Your keys, your tokens, always.' },
              { icon: Code2, title: 'API Access', desc: 'Headless automation for agents and bots.' },
            ].map((f) => {
              const Icon = f.icon
              return (
                <div
                  key={f.title}
                  style={{
                    background: 'var(--zuik-surface)',
                    border: '1px solid var(--zuik-border)',
                    borderRadius: 12,
                    padding: 24,
                    display: 'flex',
                    gap: 16,
                    alignItems: 'flex-start',
                    transition: 'border-color 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--zuik-text-dim)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--zuik-border)'
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: 'rgba(249,115,22,0.12)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={20} style={{ color: 'var(--zuik-orange)' }} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--zuik-text)', marginBottom: 4 }}>
                      {f.title}
                    </h3>
                    <p style={{ fontSize: '0.875rem', color: 'var(--zuik-text-muted)', lineHeight: 1.5 }}>
                      {f.desc}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* 4. Built on Algorand */}
      <section
        style={{
          padding: '100px 24px 120px',
          background: 'var(--zuik-surface)',
          borderTop: '1px solid var(--zuik-border)',
          borderBottom: '1px solid var(--zuik-border)',
        }}
      >
        <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
          <h2
            style={{
              fontSize: 'clamp(1.5rem, 3vw, 2rem)',
              fontWeight: 700,
              color: 'var(--zuik-text)',
              marginBottom: 16,
              letterSpacing: '-0.02em',
            }}
          >
            Built on Algorand
          </h2>
          <p
            style={{
              fontSize: '1rem',
              color: 'var(--zuik-text-muted)',
              lineHeight: 1.7,
              marginBottom: 32,
            }}
          >
            Fast finality, low fees, and native atomic transaction groups. Zuik leverages Algorand's architecture for reliable, composable DeFi automation.
          </p>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                padding: '8px 16px',
                background: 'var(--zuik-surface-2)',
                border: '1px solid var(--zuik-border)',
                borderRadius: 8,
                fontSize: '0.875rem',
                fontWeight: 600,
                color: 'var(--zuik-text)',
              }}
            >
              Algorand
            </span>
            <span
              style={{
                padding: '8px 16px',
                background: 'var(--zuik-surface-2)',
                border: '1px solid var(--zuik-border)',
                borderRadius: 8,
                fontSize: '0.875rem',
                fontWeight: 600,
                color: 'var(--zuik-text)',
              }}
            >
              Atomic Groups
            </span>
            <span
              style={{
                padding: '8px 16px',
                background: 'rgba(34,197,94,0.15)',
                border: '1px solid rgba(34,197,94,0.4)',
                borderRadius: 8,
                fontSize: '0.875rem',
                fontWeight: 600,
                color: 'var(--zuik-success)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <CheckCircle2 size={16} /> Testnet Ready
            </span>
          </div>
        </div>
      </section>

      {/* 5. Pricing */}
      <section
        style={{
          padding: '100px 24px 120px',
        }}
      >
        <div style={{ maxWidth: 480, margin: '0 auto', textAlign: 'center' }}>
          <h2
            style={{
              fontSize: 'clamp(1.5rem, 3vw, 2rem)',
              fontWeight: 700,
              color: 'var(--zuik-text)',
              marginBottom: 16,
              letterSpacing: '-0.02em',
            }}
          >
            Free During Testnet
          </h2>
          <p
            style={{
              fontSize: '0.9375rem',
              color: 'var(--zuik-text-muted)',
              marginBottom: 32,
            }}
          >
            Mainnet pricing coming after hackathon.
          </p>
          <div
            style={{
              background: 'var(--zuik-surface)',
              border: '1px solid var(--zuik-border)',
              borderRadius: 16,
              padding: 40,
              textAlign: 'center',
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 16,
                padding: '6px 14px',
                background: 'rgba(249,115,22,0.15)',
                borderRadius: 20,
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: 'var(--zuik-orange)',
              }}
            >
              <Layers size={16} /> Testnet Pioneer
            </div>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--zuik-text)', marginBottom: 8 }}>
              Free Forever
            </h3>
            <p style={{ fontSize: '0.9375rem', color: 'var(--zuik-text-muted)', marginBottom: 24 }}>
              Unlimited workflows on Algorand Testnet. No credit card required.
            </p>
            <Link to="/builder" className="zuik-btn zuik-btn-primary" style={{ padding: '12px 24px' }}>
              Get Started
            </Link>
          </div>
        </div>
      </section>

      {/* 6. Footer */}
      <footer
        style={{
          padding: '48px 24px 32px',
          borderTop: '1px solid var(--zuik-border)',
          background: 'var(--zuik-surface)',
        }}
      >
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 32,
              textAlign: 'center',
            }}
          >
            <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'var(--zuik-text)' }}>
              <img src={zuikLogo} alt="Zuik" style={{ height: 32, width: 'auto' }} />
              <span style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em' }}>Zuik</span>
            </Link>
            <p style={{ fontSize: '0.875rem', color: 'var(--zuik-text-muted)', maxWidth: 400 }}>
              DeFi automation, simplified. Describe your intent. Build workflows. Execute on Algorand.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              <Link to="/builder" className="zuik-nav-link" style={{ textDecoration: 'none' }}>
                Builder
              </Link>
              <Link to="/dashboard" className="zuik-nav-link" style={{ textDecoration: 'none' }}>
                Dashboard
              </Link>
              <a
                href="https://github.com/DarshanKrishna-DK/Zuik"
                target="_blank"
                rel="noopener noreferrer"
                className="zuik-nav-link"
                style={{ textDecoration: 'none' }}
              >
                GitHub <ExternalLink size={14} />
              </a>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--zuik-text-dim)' }}>
              Built for AlgoHackSeries 3.0
            </p>
            <p style={{ fontSize: '0.75rem', color: 'var(--zuik-text-dim)' }}>
              © {new Date().getFullYear()} Zuik. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
