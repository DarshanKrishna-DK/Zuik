import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWallet } from '@txnlab/use-wallet-react'
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  isSupabaseConfigured, getSupabase, listWorkflows, deleteWorkflow, duplicateWorkflow,
  updateWorkflow, getDashboardStats,
  type WorkflowRow, type ExecutionRow,
} from '../services/supabase'

const PIE_COLORS = ['#34D399', '#F87171', '#FBBF24', '#38BDF8']

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function PlusIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M12 5v14" /></svg> }
function WorkflowIcon({ size = 16 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="8" height="8" x="3" y="3" rx="2" /><path d="M7 11v4a2 2 0 0 0 2 2h4" /><rect width="8" height="8" x="13" y="13" rx="2" /></svg> }
function ClockIcon({ size = 12 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg> }
function SearchIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg> }
function PlayIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="6 3 20 12 6 21 6 3" /></svg> }
function PauseIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="4" height="16" x="6" y="4" /><rect width="4" height="16" x="14" y="4" /></svg> }
function CopyIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg> }
function TrashIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg> }
function BarChartIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v16a2 2 0 0 0 2 2h16" /><path d="M7 16h8" /><path d="M7 11h12" /><path d="M7 6h3" /></svg> }
function ExternalLinkIcon() { return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg> }
function CheckCircleIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></svg> }
function XCircleIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" /></svg> }
function DashboardIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></svg> }
function WalletIcon() { return <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" /></svg> }

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; Icon: () => JSX.Element; label: string }> = {
    success: { color: 'var(--z-success)', Icon: CheckCircleIcon, label: 'Success' },
    failed: { color: 'var(--z-error)', Icon: XCircleIcon, label: 'Failed' },
    running: { color: 'var(--z-info)', Icon: CheckCircleIcon, label: 'Running' },
    cancelled: { color: 'var(--z-text-dim)', Icon: XCircleIcon, label: 'Cancelled' },
  }
  const key = (status || '').toLowerCase().trim()
  const entry = map[key] ?? { ...map.cancelled, label: status || 'Unknown' }
  return (
    <span className="dash-status-badge" style={{ color: entry.color }}>
      <entry.Icon />
      {entry.label}
    </span>
  )
}

export default function Dashboard() {
  const { activeAddress } = useWallet()
  const navigate = useNavigate()
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([])
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getDashboardStats>> | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const configured = isSupabaseConfigured()

  const load = useCallback(async () => {
    if (!activeAddress || !configured) { setLoading(false); return }
    setLoading(true)
    try {
      const [wf, st] = await Promise.all([
        listWorkflows(activeAddress),
        getDashboardStats(activeAddress),
      ])
      setWorkflows(wf)
      setStats(st)
    } catch (err) {
      console.error('Dashboard load failed:', err)
    } finally {
      setLoading(false)
    }
  }, [activeAddress, configured])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!activeAddress || !configured) return
    const sb = getSupabase()
    const channel = sb
      .channel('dashboard-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workflows' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'executions' }, () => load())
      .subscribe()
    return () => { sb.removeChannel(channel) }
  }, [activeAddress, configured, load])

  const network = import.meta.env.VITE_ALGOD_NETWORK || 'testnet'
  const explorerBase = network === 'mainnet'
    ? 'https://lora.algokit.io/mainnet'
    : network === 'localnet'
      ? 'https://lora.algokit.io/localnet'
      : 'https://lora.algokit.io/testnet'

  const handleDelete = async (id: string) => {
    try { await deleteWorkflow(id); setWorkflows((prev) => prev.filter((w) => w.id !== id)) } catch (err) { console.error('Delete failed:', err) }
  }
  const handleDuplicate = async (id: string) => {
    if (!activeAddress) return
    try { const dup = await duplicateWorkflow(id, activeAddress); setWorkflows((prev) => [dup, ...prev]) } catch (err) { console.error('Duplicate failed:', err) }
  }
  const handleToggleActive = async (wf: WorkflowRow) => {
    try { await updateWorkflow(wf.id, { is_active: !wf.is_active }); setWorkflows((prev) => prev.map((w) => w.id === wf.id ? { ...w, is_active: !w.is_active } : w)) } catch (err) { console.error('Toggle failed:', err) }
  }

  const filtered = workflows.filter((w) => w.name.toLowerCase().includes(search.toLowerCase()))

  if (!activeAddress) {
    return (
      <div className="zuik-connect-prompt">
        <WalletIcon />
        <h2>Connect Wallet</h2>
        <p>Connect your Algorand wallet to view your workflows and execution history.</p>
      </div>
    )
  }

  if (!configured) {
    return (
      <div className="zuik-connect-prompt">
        <DashboardIcon />
        <h2>Supabase Not Configured</h2>
        <p>Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file to enable persistence. Workflows are currently saved to localStorage only.</p>
      </div>
    )
  }

  const pieData = stats ? [
    { name: 'Success', value: stats.successCount },
    { name: 'Failed', value: stats.failedCount },
    { name: 'Other', value: stats.totalExecutions - stats.successCount - stats.failedCount },
  ].filter((d) => d.value > 0) : []

  return (
    <div className="zuik-dashboard">
      <div className="zuik-dashboard-mesh" aria-hidden />
      <div className="zuik-dashboard-inner">
        <div className="zuik-dashboard-title">
          <DashboardIcon /> Dashboard
        </div>

        {stats && (
          <div className="zuik-stats-grid">
            <div className="zuik-stat-card">
              <div className="zuik-stat-label">Workflows</div>
              <div className="zuik-stat-value">{stats.totalWorkflows}</div>
            </div>
            <div className="zuik-stat-card">
              <div className="zuik-stat-label">Executions</div>
              <div className="zuik-stat-value">{stats.totalExecutions}</div>
            </div>
            <div className="zuik-stat-card">
              <div className="zuik-stat-label">Success Rate</div>
              <div className="zuik-stat-value" style={{ color: stats.successRate >= 80 ? 'var(--z-success)' : stats.successRate >= 50 ? 'var(--z-warning)' : 'var(--z-error)' }}>
                {stats.successRate}%
              </div>
            </div>
            <div className="zuik-stat-card">
              <div className="zuik-stat-label">Total Fees</div>
              <div className="zuik-stat-value">{stats.totalFeesAlgo.toFixed(4)} A</div>
            </div>
          </div>
        )}

        {stats && stats.totalExecutions > 0 && (
          <div className="dash-charts-row">
            <div className="dash-chart-card">
              <div className="dash-chart-title"><BarChartIcon /> Executions Over Time</div>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={stats.dailyData}>
                  <defs>
                    <linearGradient id="gradSuccess" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#34D399" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#34D399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#71717A' }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 10, fill: '#71717A' }} width={30} />
                  <Tooltip contentStyle={{ background: '#141416', border: '1px solid #2A2A30', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: '#A1A1AA' }} />
                  <Area type="monotone" dataKey="success" stroke="#34D399" fill="url(#gradSuccess)" />
                  <Area type="monotone" dataKey="failed" stroke="#F87171" fill="transparent" strokeDasharray="4 4" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="dash-chart-card dash-chart-small">
              <div className="dash-chart-title">Status Breakdown</div>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={3}>
                    {pieData.map((_entry, i) => (<Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />))}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#141416', border: '1px solid #2A2A30', borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="dash-pie-legend">
                {pieData.map((d, i) => (
                  <span key={d.name} className="dash-pie-legend-item">
                    <span className="dash-pie-dot" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    {d.name} ({d.value})
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="dash-section-header">
          <h3 className="zuik-dash-section-title"><WorkflowIcon /> Your Workflows</h3>
          <div className="zuik-sidebar-search">
            <SearchIcon />
            <input placeholder="Search workflows..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {loading ? (
          <div className="zuik-loading-fallback" style={{ padding: '40px 0' }}>
            <div className="z-spinner" />
            <span>Loading workflows...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="zuik-empty-state">
            <WorkflowIcon size={32} />
            <h3>{search ? 'No matching workflows' : 'No workflows yet'}</h3>
            <p>{search ? 'Try a different search term' : 'Create your first workflow to get started'}</p>
            {!search && (
              <button className="z-btn z-btn-primary" onClick={() => navigate('/builder')}><PlusIcon /> Create Your First Workflow</button>
            )}
          </div>
        ) : (
          <div className="zuik-workflow-list">
            {filtered.map((wf) => {
              const nodeCount = Array.isArray(wf.flow_json?.nodes) ? wf.flow_json.nodes.length : 0
              return (
                <div key={wf.id} className="zuik-workflow-row" onClick={() => navigate(`/builder?wf=${wf.id}`)}>
                  <div style={{ flex: 1 }}>
                    <div className="zuik-workflow-name">{wf.name}</div>
                    <div className="zuik-workflow-meta">
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><WorkflowIcon size={12} /> {nodeCount} block{nodeCount !== 1 ? 's' : ''}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><ClockIcon /> {timeAgo(wf.updated_at)}</span>
                    </div>
                  </div>
                  <div className={`zuik-agent-dot${wf.is_active ? ' running' : ''}`} title={wf.is_active ? 'Active' : 'Inactive'} />
                  <div className="zuik-workflow-actions" onClick={(e) => e.stopPropagation()}>
                    <button className="z-btn-icon sm zuik-btn zuik-btn-ghost" onClick={() => navigate(`/builder?wf=${wf.id}`)} title="Open"><PlayIcon /></button>
                    <button className="z-btn-icon sm zuik-btn zuik-btn-ghost" onClick={() => handleToggleActive(wf)} title={wf.is_active ? 'Deactivate' : 'Activate'}><PauseIcon /></button>
                    <button className="z-btn-icon sm zuik-btn zuik-btn-ghost" onClick={() => handleDuplicate(wf.id)} title="Duplicate"><CopyIcon /></button>
                    <button className="z-btn-icon sm zuik-btn zuik-btn-ghost" onClick={() => handleDelete(wf.id)} title="Delete" style={{ color: 'var(--z-error)' }}><TrashIcon /></button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {stats && stats.recentExecutions.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <h3 className="zuik-dash-section-title"><ClockIcon size={16} /> Recent Executions</h3>
            <div className="dash-exec-table">
              <div className="dash-exec-header-row">
                <span>Status</span><span>Started</span><span>Duration</span><span>Blocks</span><span>Fees</span><span>Txns</span>
              </div>
              {stats.recentExecutions.map((ex: ExecutionRow) => (
                <div key={ex.id} className="dash-exec-row">
                  <span><StatusBadge status={ex.status} /></span>
                  <span className="dash-exec-time">{timeAgo(ex.started_at)}</span>
                  <span>{ex.duration_ms > 0 ? `${(ex.duration_ms / 1000).toFixed(1)}s` : '-'}</span>
                  <span>{ex.block_count}</span>
                  <span>{ex.total_fees_microalgo > 0 ? `${(ex.total_fees_microalgo / 1_000_000).toFixed(4)}` : '-'}</span>
                  <span>
                    {ex.tx_ids.length > 0 ? (
                      <a href={`${explorerBase}/transaction/${ex.tx_ids[0]}`} target="_blank" rel="noreferrer" className="dash-tx-link" onClick={(e) => e.stopPropagation()}>
                        <ExternalLinkIcon /> {ex.tx_ids.length}
                      </a>
                    ) : '-'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
