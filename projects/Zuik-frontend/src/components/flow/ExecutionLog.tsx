import { useEffect, useRef, useState } from 'react'
import { X, Trash2, CheckCircle, XCircle, Play, SkipForward, Zap } from 'lucide-react'
import type { LogEntry } from '../../lib/runAgent'

export interface ExecutionLogProps {
  isOpen: boolean
  onClose: () => void
  logs: LogEntry[]
  onClear: () => void
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  const s = d.getSeconds().toString().padStart(2, '0')
  const ms = (ts % 1000).toString().padStart(3, '0')
  return `${h}:${m}:${s}.${ms}`
}

function getTypeIcon(type: LogEntry['type']) {
  const size = 14
  switch (type) {
    case 'success':
      return <CheckCircle size={size} style={{ color: 'var(--zuik-success)', flexShrink: 0 }} />
    case 'error':
      return <XCircle size={size} style={{ color: 'var(--zuik-error)', flexShrink: 0 }} />
    case 'start':
      return <Play size={size} style={{ color: 'var(--zuik-info)', flexShrink: 0 }} />
    case 'skip':
      return <SkipForward size={size} style={{ color: 'var(--zuik-warning)', flexShrink: 0 }} />
    case 'trigger-fire':
      return <Zap size={size} style={{ color: '#8B5CF6', flexShrink: 0 }} />
    default:
      return <Play size={size} style={{ color: 'var(--zuik-text-muted)', flexShrink: 0 }} />
  }
}

function LogRow({ entry }: { entry: LogEntry }) {
  const [expanded, setExpanded] = useState(false)
  const hasData = entry.data !== undefined && entry.data !== null

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '8px 12px',
        borderBottom: '1px solid var(--zuik-border)',
        fontSize: '0.8125rem',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <span style={{ color: 'var(--zuik-text-dim)', flexShrink: 0, minWidth: 90 }}>
        {formatTimestamp(entry.timestamp)}
      </span>
      <div style={{ flexShrink: 0, marginTop: 1 }}>{getTypeIcon(entry.type)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ color: 'var(--zuik-text-muted)', fontWeight: 500 }}>{entry.blockName}</span>
        <span style={{ color: 'var(--zuik-text-dim)', margin: '0 6px' }}>—</span>
        <span style={{ color: 'var(--zuik-text)' }}>{entry.message}</span>
        {hasData && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            style={{
              marginLeft: 8,
              padding: '2px 6px',
              fontSize: '0.6875rem',
              background: 'var(--zuik-surface-2)',
              border: '1px solid var(--zuik-border)',
              borderRadius: 4,
              color: 'var(--zuik-text-muted)',
              cursor: 'pointer',
            }}
          >
            {expanded ? 'Hide data' : 'Show data'}
          </button>
        )}
        {hasData && expanded && (
          <pre
            style={{
              marginTop: 8,
              padding: 10,
              background: 'var(--zuik-bg)',
              border: '1px solid var(--zuik-border)',
              borderRadius: 6,
              fontSize: '0.75rem',
              color: 'var(--zuik-text-muted)',
              overflow: 'auto',
              maxHeight: 200,
            }}
          >
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
    if (logs.length > 0 && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs.length])

  return (
    <>
      <div
        role="presentation"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 40,
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 0.2s ease',
        }}
      />
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: 300,
          width: '100%',
          background: 'var(--zuik-surface)',
          borderTop: '1px solid var(--zuik-border)',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.3)',
          transform: isOpen ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.25s ease',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid var(--zuik-border)',
            background: 'var(--zuik-surface-2)',
            flexShrink: 0,
          }}
        >
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--zuik-text)' }}>
            Execution Log
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={onClear}
              className="zuik-btn zuik-btn-ghost zuik-btn-sm"
              style={{ padding: 6 }}
              title="Clear log"
            >
              <Trash2 size={16} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="zuik-btn zuik-btn-ghost zuik-btn-sm"
              style={{ padding: 6 }}
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflow: 'auto',
            background: 'var(--zuik-bg)',
          }}
        >
          {logs.length === 0 ? (
            <div
              style={{
                padding: 24,
                textAlign: 'center',
                color: 'var(--zuik-text-dim)',
                fontSize: '0.875rem',
              }}
            >
              No log entries yet. Run the agent to see execution logs.
            </div>
          ) : (
            logs.map((entry, i) => (
              <LogRow key={`${entry.timestamp}-${entry.nodeId}-${i}`} entry={entry} />
            ))
          )}
        </div>
      </div>
    </>
  )
}
