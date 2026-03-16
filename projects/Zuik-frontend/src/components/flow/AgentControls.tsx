import { Play, Pause, Square, ScrollText, Circle } from 'lucide-react'

export interface AgentControlsProps {
  status: 'idle' | 'running' | 'paused' | 'error' | 'stopped'
  onStart: () => void
  onStop: () => void
  onPause: () => void
  onResume: () => void
  onToggleLog: () => void
  logCount: number
}

function getStatusColor(status: AgentControlsProps['status']): string {
  switch (status) {
    case 'running':
      return 'var(--zuik-success)'
    case 'paused':
      return 'var(--zuik-warning)'
    case 'error':
      return 'var(--zuik-error)'
    default:
      return 'var(--zuik-text-dim)'
  }
}

export default function AgentControls({
  status,
  onStart,
  onStop,
  onPause,
  onResume,
  onToggleLog,
  logCount,
}: AgentControlsProps) {
  const showRun = status === 'idle' || status === 'stopped' || status === 'error'
  const showPause = status === 'running'
  const showResume = status === 'paused'
  const showStop = status === 'running' || status === 'paused'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          paddingRight: 8,
          borderRight: '1px solid var(--zuik-border)',
        }}
      >
        <Circle
          size={8}
          fill={getStatusColor(status)}
          style={{ color: getStatusColor(status), flexShrink: 0 }}
        />
        <span
          style={{
            fontSize: '0.6875rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--zuik-text-muted)',
          }}
        >
          {status}
        </span>
      </div>

      {showRun && (
        <button
          type="button"
          onClick={onStart}
          className="zuik-btn zuik-btn-primary zuik-btn-sm"
          title="Run Agent"
        >
          <Play size={14} /> Run Agent
        </button>
      )}

      {showPause && (
        <button
          type="button"
          onClick={onPause}
          className="zuik-btn zuik-btn-ghost zuik-btn-sm"
          title="Pause"
          style={{ color: 'var(--zuik-warning)' }}
        >
          <Pause size={14} /> Pause
        </button>
      )}

      {showResume && (
        <button
          type="button"
          onClick={onResume}
          className="zuik-btn zuik-btn-primary zuik-btn-sm"
          title="Resume"
        >
          <Play size={14} /> Resume
        </button>
      )}

      {showStop && (
        <button
          type="button"
          onClick={onStop}
          className="zuik-btn zuik-btn-ghost zuik-btn-sm"
          title="Stop"
          style={{ color: 'var(--zuik-error)' }}
        >
          <Square size={14} /> Stop
        </button>
      )}

      <button
        type="button"
        onClick={onToggleLog}
        className="zuik-btn zuik-btn-ghost zuik-btn-sm"
        title="Execution Log"
        style={{ position: 'relative' }}
      >
        <ScrollText size={14} /> Log
        {logCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              minWidth: 16,
              height: 16,
              padding: '0 4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--zuik-orange)',
              color: 'white',
              fontSize: '0.625rem',
              fontWeight: 700,
              borderRadius: 8,
            }}
          >
            {logCount > 99 ? '99+' : logCount}
          </span>
        )}
      </button>
    </div>
  )
}
