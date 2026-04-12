import { useEffect, useRef, useState } from 'react'
import type { LogEntry } from '../../lib/runAgent'

export interface ExecutionLogProps {
  isOpen: boolean
  onClose: () => void
  logs: LogEntry[]
  onClear: () => void
}

function XIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg> }
function TrashIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg> }
function CheckCircleIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></svg> }
function XCircleIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" /></svg> }
function PlayIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="6 3 20 12 6 21 6 3" /></svg> }
function SkipIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 4 15 12 5 20 5 4" /><line x1="19" x2="19" y1="5" y2="19" /></svg> }
function ZapIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" /></svg> }

function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${(ts % 1000).toString().padStart(3, '0')}`
}

function getTypeIcon(type: LogEntry['type']) {
  switch (type) {
    case 'success': return <span style={{ color: 'var(--z-success)', flexShrink: 0 }}><CheckCircleIcon /></span>
    case 'error': return <span style={{ color: 'var(--z-error)', flexShrink: 0 }}><XCircleIcon /></span>
    case 'start': return <span style={{ color: 'var(--z-info)', flexShrink: 0 }}><PlayIcon /></span>
    case 'skip': return <span style={{ color: 'var(--z-warning)', flexShrink: 0 }}><SkipIcon /></span>
    case 'trigger-fire': return <span style={{ color: '#A78BFA', flexShrink: 0 }}><ZapIcon /></span>
    default: return <span style={{ color: 'var(--z-text-muted)', flexShrink: 0 }}><PlayIcon /></span>
  }
}

function LogRow({ entry }: { entry: LogEntry }) {
  const [expanded, setExpanded] = useState(false)
  const hasData = entry.data !== undefined && entry.data !== null

  return (
    <div className="zuik-log-entry">
      <span className="zuik-log-time">{formatTimestamp(entry.timestamp)}</span>
      <span className="zuik-log-icon">{getTypeIcon(entry.type)}</span>
      <div className="zuik-log-msg">
        <span style={{ color: 'var(--z-text-muted)', fontWeight: 500 }}>{entry.blockName}</span>
        <span style={{ color: 'var(--z-text-dim)', margin: '0 6px' }}>-</span>
        <span style={{ color: 'var(--z-text)' }}>{entry.message}</span>
        {hasData && (
          <button type="button" onClick={() => setExpanded((e) => !e)} style={{
            marginLeft: 8, padding: '2px 6px', fontSize: '0.6875rem', background: 'var(--z-surface-2)',
            border: '1px solid var(--z-border)', borderRadius: 4, color: 'var(--z-text-muted)', cursor: 'pointer', fontFamily: 'var(--z-font)',
          }}>
            {expanded ? 'Hide data' : 'Show data'}
          </button>
        )}
        {hasData && expanded && (
          <pre style={{ marginTop: 8, padding: 10, background: 'var(--z-bg)', border: '1px solid var(--z-border)', borderRadius: 6, fontSize: '0.75rem', fontFamily: 'var(--z-mono)', color: 'var(--z-text-muted)', overflow: 'auto', maxHeight: 200 }}>
            {JSON.stringify(entry.data, null, 2)}
          </pre>
        )}
      </div>
    </div>
  )
}

export default function ExecutionLog({ isOpen, onClose, logs, onClear }: ExecutionLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (logs.length > 0 && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [logs.length])

  return (
    <>
      <div role="presentation" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(12,12,14,0.5)', zIndex: 40, opacity: isOpen ? 1 : 0, pointerEvents: isOpen ? 'auto' : 'none', transition: 'opacity 0.2s ease' }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, height: 300, background: 'var(--z-surface)',
        borderTop: '1px solid var(--z-border)', zIndex: 50, display: 'flex', flexDirection: 'column',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.3)', transform: isOpen ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 0.25s var(--z-ease)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--z-border)', background: 'var(--z-surface-2)', flexShrink: 0 }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--z-text)', fontFamily: 'var(--z-font)' }}>Execution Log</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" onClick={onClear} className="zuik-btn zuik-btn-ghost zuik-btn-sm" style={{ padding: 6 }} title="Clear log"><TrashIcon /></button>
            <button type="button" onClick={onClose} className="zuik-btn zuik-btn-ghost zuik-btn-sm" style={{ padding: 6 }} aria-label="Close"><XIcon /></button>
          </div>
        </div>
        <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', background: 'var(--z-bg)' }}>
          {logs.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--z-text-dim)', fontSize: '0.875rem' }}>
              No log entries yet. Run the agent to see execution logs.
            </div>
          ) : (
            logs.map((entry, i) => <LogRow key={`${entry.timestamp}-${entry.nodeId}-${i}`} entry={entry} />)
          )}
        </div>
      </div>
    </>
  )
}
