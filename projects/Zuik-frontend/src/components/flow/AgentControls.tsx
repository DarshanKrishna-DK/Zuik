export interface AgentControlsProps {
  status: 'idle' | 'running' | 'paused' | 'error' | 'stopped'
  onStart: () => void
  onStop: () => void
  onPause: () => void
  onResume: () => void
  onToggleLog: () => void
  logCount: number
}

function PlayIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="6 3 20 12 6 21 6 3" /></svg> }
function PauseIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="4" height="16" x="6" y="4" /><rect width="4" height="16" x="14" y="4" /></svg> }
function SquareIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" /></svg> }
function ScrollTextIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 12h-5" /><path d="M15 8h-5" /><path d="M19 17V5a2 2 0 0 0-2-2H4" /><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2" /></svg> }

function getStatusColor(status: AgentControlsProps['status']): string {
  switch (status) {
    case 'running': return 'var(--z-success)'
    case 'paused': return 'var(--z-warning)'
    case 'error': return 'var(--z-error)'
    default: return 'var(--z-text-dim)'
  }
}

export default function AgentControls({ status, onStart, onStop, onPause, onResume, onToggleLog, logCount }: AgentControlsProps) {
  const showRun = status === 'idle' || status === 'stopped' || status === 'error'
  const showPause = status === 'running'
  const showResume = status === 'paused'
  const showStop = status === 'running' || status === 'paused'

  return (
    <div className="zuik-agent-controls">
      <div className="zuik-agent-status">
        <span className={`zuik-agent-dot ${status}`} style={{ background: getStatusColor(status) }} />
        <span>{status}</span>
      </div>

      {showRun && (
        <button type="button" onClick={onStart} className="zuik-btn zuik-btn-primary zuik-btn-sm" title="Run Workflow">
          <PlayIcon /> Run
        </button>
      )}
      {showPause && (
        <button type="button" onClick={onPause} className="zuik-btn zuik-btn-ghost zuik-btn-sm" title="Pause" style={{ color: 'var(--z-warning)' }}>
          <PauseIcon /> Pause
        </button>
      )}
      {showResume && (
        <button type="button" onClick={onResume} className="zuik-btn zuik-btn-primary zuik-btn-sm" title="Resume">
          <PlayIcon /> Resume
        </button>
      )}
      {showStop && (
        <button type="button" onClick={onStop} className="zuik-btn zuik-btn-ghost zuik-btn-sm" title="Stop" style={{ color: 'var(--z-error)' }}>
          <SquareIcon /> Stop
        </button>
      )}

      <button type="button" onClick={onToggleLog} className="zuik-btn zuik-btn-ghost zuik-btn-sm" title="Execution Log" style={{ position: 'relative' }}>
        <ScrollTextIcon /> Log
        {logCount > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16,
            padding: '0 4px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--z-accent)', color: '#0C0C0E', fontSize: '0.625rem', fontWeight: 700, borderRadius: 8,
          }}>
            {logCount > 99 ? '99+' : logCount}
          </span>
        )}
      </button>
    </div>
  )
}
