import { useState, useMemo, useDeferredValue } from 'react'
import { createPortal } from 'react-dom'
import {
  getAllTemplates, searchTemplates, TEMPLATE_CATEGORIES,
  type WorkflowTemplate, type TemplateCategory, type TemplateNode, type TemplateEdge,
} from '../../services/templateService'

interface Props {
  isOpen: boolean
  onClose: () => void
  onUseTemplate: (nodes: TemplateNode[], edges: TemplateEdge[], name: string) => void
}

function SearchIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg> }
function XIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg> }
function LayoutGridIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" /></svg> }
function ArrowRightIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg> }
function ZapIcon() { return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" /></svg> }
function TagIcon() { return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" /><circle cx="7.5" cy="7.5" r=".5" fill="currentColor" /></svg> }

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: 'var(--z-success)',
  intermediate: 'var(--z-warning)',
  advanced: 'var(--z-error)',
}

const BLOCK_CATEGORY_COLOR: Record<string, string> = {
  trigger: '#A78BFA',
  action: '#38BDF8',
  logic: '#FBBF24',
  notification: '#34D399',
  defi: '#E8913A',
}

function getCatColor(blockId: string): string {
  const cat = blockId.match(/timer|webhook|wallet/) ? 'trigger'
    : blockId.match(/comparator|filter|delay|calculator|variable/) ? 'logic'
    : blockId.match(/telegram|discord|browser-notify/) ? 'notification'
    : blockId.match(/swap|quote|liquidity|portfolio|price|fiat/) ? 'defi'
    : 'action'
  return BLOCK_CATEGORY_COLOR[cat] ?? '#38BDF8'
}

function TemplateDetailModal({ template, onClose, onUse }: { template: WorkflowTemplate; onClose: () => void; onUse: () => void }) {
  return (
    <>
      <div className="tpl-overlay" onClick={onClose} />
      <div className="tpl-detail-modal">
        <div className="tpl-detail-header">
          <h3>{template.name}</h3>
          <button className="zuik-btn zuik-btn-ghost zuik-btn-sm" onClick={onClose} style={{ padding: 4 }}><XIcon /></button>
        </div>
        <div className="tpl-detail-body">
          <p className="tpl-detail-desc">{template.description}</p>

          <div className="tpl-detail-meta">
            <span className="tpl-meta-chip" style={{ color: DIFFICULTY_COLORS[template.difficulty] }}>{template.difficulty}</span>
            <span className="tpl-meta-chip"><ZapIcon /> {template.estimatedFee}</span>
            <span className="tpl-meta-chip"><LayoutGridIcon /> {template.nodes.length} blocks</span>
          </div>

          <div className="tpl-detail-nodes">
            <span className="tpl-detail-label">Workflow steps:</span>
            {template.nodes.map((n, i) => (
              <div key={n.id} className="tpl-detail-node-row">
                <span className="tpl-detail-node-num">{i + 1}</span>
                <span className="tpl-detail-node-dot" style={{ background: getCatColor(n.data.blockId) }} />
                <span>{n.data.label}</span>
              </div>
            ))}
          </div>

          <div className="tpl-detail-tags">
            {template.tags.map((t) => (<span key={t} className="tpl-tag"><TagIcon /> {t}</span>))}
          </div>
        </div>
        <div className="tpl-detail-footer">
          <button className="zuik-btn zuik-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="zuik-btn zuik-btn-primary" onClick={onUse}>Use Template <ArrowRightIcon /></button>
        </div>
      </div>
    </>
  )
}

export default function TemplateGallery({ isOpen, onClose, onUseTemplate }: Props) {
  const [query, setQuery] = useState('')
  const [catFilter, setCatFilter] = useState<TemplateCategory | 'all'>('all')
  const [selectedTemplate, setSelectedTemplate] = useState<WorkflowTemplate | null>(null)
  const deferredQuery = useDeferredValue(query)

  const filtered = useMemo(() => {
    let results = deferredQuery ? searchTemplates(deferredQuery) : getAllTemplates()
    if (catFilter !== 'all') results = results.filter((t) => t.category === catFilter)
    return results
  }, [deferredQuery, catFilter])

  const handleUseTemplate = (template: WorkflowTemplate) => {
    onUseTemplate(template.nodes, template.edges, template.name)
    setSelectedTemplate(null)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="tpl-gallery-panel">
      <div className="tpl-gallery-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <LayoutGridIcon />
          <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--z-text)' }}>Starter Workflows</span>
        </div>
        <button className="zuik-btn zuik-btn-ghost zuik-btn-sm" onClick={onClose} style={{ padding: 4 }}><XIcon /></button>
      </div>

      <div className="tpl-gallery-filters">
        <div className="tpl-search-wrap">
          <SearchIcon />
          <input placeholder="Search templates..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="tpl-cat-chips">
          <button className={`tpl-cat-chip${catFilter === 'all' ? ' active' : ''}`} onClick={() => setCatFilter('all')}>All</button>
          {TEMPLATE_CATEGORIES.map((c) => (
            <button key={c.id} className={`tpl-cat-chip${catFilter === c.id ? ' active' : ''}`}
              onClick={() => setCatFilter(c.id)} style={catFilter === c.id ? { borderColor: c.color, color: c.color } : undefined}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="tpl-gallery-grid">
        {filtered.length === 0 ? (
          <div className="tpl-empty">No templates match your search.</div>
        ) : (
          filtered.map((t) => (
            <div key={t.id} className="tpl-card" onClick={() => setSelectedTemplate(t)}>
              <div className="tpl-card-body">
                <div className="tpl-card-top">
                  <div className="tpl-card-name">{t.name}</div>
                  <div className="tpl-card-meta">
                    <span style={{ color: DIFFICULTY_COLORS[t.difficulty] }}>{t.difficulty}</span>
                    <span>{t.nodes.length} blocks</span>
                  </div>
                </div>
                <div className="tpl-card-desc">{t.description}</div>
                <div className="tpl-card-preview-row">
                  {t.nodes.map((n) => (
                    <span key={n.id} className="tpl-node-dot" style={{ background: getCatColor(n.data.blockId) }} title={n.data.label} />
                  ))}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {selectedTemplate && createPortal(
        <TemplateDetailModal template={selectedTemplate} onClose={() => setSelectedTemplate(null)} onUse={() => handleUseTemplate(selectedTemplate)} />,
        document.body
      )}
    </div>
  )
}
