export interface AgentControlsProps {
  status: 'idle' | 'running' | 'paused' | 'error' | 'stopped'
  onStart: () => void
  onStop: () => void
  onPause: () => void
  onResume: () => void
  onClear: () => void
}

function PlayIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="6 3 20 12 6 21 6 3" /></svg> }
function PauseIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="4" height="16" x="6" y="4" /><rect width="4" height="16" x="14" y="4" /></svg> }
function SquareIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" /></svg> }
function TrashIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg> }

function getStatusColor(status: AgentControlsProps['status']): string {
  switch (status) {
    case 'running': return 'var(--z-success)'
    case 'paused': return 'var(--z-warning)'
    case 'error': return 'var(--z-error)'
    default: return 'var(--z-text-dim)'
  }
}

export default function AgentControls({ status, onStart, onStop, onPause, onResume, onClear }: AgentControlsProps) {
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
        <button type="button" onClick={onStart} className="z-btn z-btn-primary z-btn-sm" title="Start agent - continuously monitor and auto-execute triggers">
          <PlayIcon /> Run
        </button>
      )}
      {showPause && (
        <button type="button" onClick={onPause} className="z-btn z-btn-ghost z-btn-sm" title="Pause" style={{ color: 'var(--z-warning)' }}>
          <PauseIcon /> Pause
        </button>
      )}
      {showResume && (
        <button type="button" onClick={onResume} className="z-btn z-btn-primary z-btn-sm" title="Resume">
          <PlayIcon /> Resume
        </button>
      )}
      {showStop && (
        <button type="button" onClick={onStop} className="z-btn z-btn-ghost z-btn-sm" title="Stop" style={{ color: 'var(--z-error)' }}>
          <SquareIcon /> Stop
        </button>
      )}

      <button type="button" onClick={onClear} className="z-btn z-btn-ghost z-btn-sm" title="Clear Canvas" style={{ color: 'var(--z-error)' }}>
        <TrashIcon /> Clear
      </button>
    </div>
  )
}
