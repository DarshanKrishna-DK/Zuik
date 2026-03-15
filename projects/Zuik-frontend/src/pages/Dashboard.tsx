import { LayoutDashboard } from 'lucide-react'

export default function Dashboard() {
  return (
    <div className="zuik-page">
      <LayoutDashboard size={48} style={{ color: 'var(--zuik-orange)', opacity: 0.6 }} />
      <h2>Dashboard</h2>
      <p style={{ maxWidth: 400, textAlign: 'center', lineHeight: 1.6 }}>
        Workflow execution history, analytics, and monitoring will be available here in Phase 6.
      </p>
    </div>
  )
}
