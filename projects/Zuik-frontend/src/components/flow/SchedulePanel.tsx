import { useEffect, useMemo, useState, useCallback } from 'react'
import type { ScheduleEntry } from '../../services/workflowScheduler'
import { getActiveSchedules } from '../../services/workflowScheduler'

interface SchedulePanelProps {
  isOpen: boolean
  onClose: () => void
  workflowId?: string | null
  workflowName?: string
  walletAddress?: string | null
  supabaseReady: boolean
  requiresSigner: boolean
  onSchedule: (runAtLocal: string) => Promise<{ ok: boolean; message: string }>
  onCancel: () => Promise<{ ok: boolean; message: string }>
}

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function formatLocalInput(date: Date): string {
  const pad = (v: number) => v.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function SchedulePanel({
  isOpen,
  onClose,
  workflowId,
  workflowName,
  walletAddress,
  supabaseReady,
  requiresSigner,
  onSchedule,
  onCancel,
}: SchedulePanelProps) {
  const [runAt, setRunAt] = useState(formatLocalInput(new Date(Date.now() + 10 * 60_000)))
  const [schedule, setSchedule] = useState<ScheduleEntry | null>(null)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [loading, setLoading] = useState(false)

  const scheduleLabel = useMemo(() => {
    if (!schedule) return 'None'
    return new Date(schedule.next_run_at).toLocaleString()
  }, [schedule])

  const refreshSchedule = useCallback(async () => {
    if (!supabaseReady || !walletAddress) return
    try {
      const rows = await getActiveSchedules(walletAddress)
      const active = rows.find((row) => row.workflow_id === workflowId && row.schedule_type === 'start_at') ?? null
      setSchedule(active)
    } catch {
      setSchedule(null)
    }
  }, [supabaseReady, walletAddress, workflowId])

  useEffect(() => {
    if (isOpen) {
      void refreshSchedule()
    }
  }, [isOpen, refreshSchedule])

  const handleSchedule = async () => {
    setLoading(true)
    const result = await onSchedule(runAt)
    setStatus({ type: result.ok ? 'success' : 'error', message: result.message })
    if (result.ok) {
      await refreshSchedule()
    }
    setLoading(false)
  }

  const handleCancel = async () => {
    setLoading(true)
    const result = await onCancel()
    setStatus({ type: result.ok ? 'success' : 'error', message: result.message })
    if (result.ok) {
      await refreshSchedule()
    }
    setLoading(false)
  }

  return (
    <>
      <div
        role="presentation"
        onClick={onClose}
        className={`zuik-schedule-overlay${isOpen ? ' open' : ''}`}
      />
      <div className={`zuik-schedule-panel${isOpen ? ' open' : ''}`}>
        <div className="zuik-schedule-header">
          <div>
            <div className="zuik-schedule-title"><ClockIcon /> Schedule Run</div>
            <div className="zuik-schedule-subtitle">{workflowName || 'Workflow'}</div>
          </div>
          <button type="button" className="zuik-schedule-close" onClick={onClose}><XIcon /></button>
        </div>

        {!supabaseReady && (
          <div className="zuik-schedule-warning">
            Cloud sync is required to schedule automated runs. Enable sync in Settings to use this feature.
          </div>
        )}

        {supabaseReady && (
          <>
            <div className="zuik-schedule-row">
              <label>Run at</label>
              <input
                type="datetime-local"
                value={runAt}
                onChange={(e) => setRunAt(e.target.value)}
              />
            </div>
            <div className="zuik-schedule-row">
              <label>Current schedule</label>
              <div className="zuik-schedule-value">{scheduleLabel}</div>
            </div>

            {requiresSigner && (
              <div className="zuik-schedule-warning">
                This workflow needs wallet signatures. It will only execute while your wallet is connected and the app is open.
              </div>
            )}

            {status && (
              <div className={`zuik-schedule-status ${status.type}`}>{status.message}</div>
            )}

            <div className="zuik-schedule-actions">
              <button type="button" className="z-btn z-btn-ghost z-btn-sm" onClick={onClose}>
                Close
              </button>
              {schedule && (
                <button type="button" className="z-btn z-btn-ghost z-btn-sm" onClick={handleCancel} disabled={loading}>
                  Cancel Schedule
                </button>
              )}
              <button
                type="button"
                className="z-btn z-btn-primary z-btn-sm"
                onClick={handleSchedule}
                disabled={loading || !walletAddress}
              >
                {loading ? 'Saving...' : 'Schedule Run'}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
