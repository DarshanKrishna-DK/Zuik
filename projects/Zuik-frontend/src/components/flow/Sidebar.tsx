import { useState, useDeferredValue } from 'react'
import { getBlocksByCategory, CATEGORY_META, type BlockCategory, type BlockDefinition } from '../../lib/blockRegistry'

function SearchIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
}
function ChevronDownIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
}
function ChevronRightIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
}
function CollapseIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
}
function ExpandIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
}

const categoryOrder: BlockCategory[] = ['trigger', 'action', 'logic', 'notification', 'defi']

export default function Sidebar() {
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [panelOpen, setPanelOpen] = useState(true)
  const grouped = getBlocksByCategory()

  const matchesSearch = (block: BlockDefinition) => {
    if (!deferredSearch) return true
    const q = deferredSearch.toLowerCase()
    return block.name.toLowerCase().includes(q) || block.description.toLowerCase().includes(q)
  }

  const onDragStart = (e: React.DragEvent, blockId: string) => {
    e.dataTransfer.setData('application/zuik-block', blockId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const toggleCategory = (cat: string) => {
    setCollapsed(prev => ({ ...prev, [cat]: !prev[cat] }))
  }

  return (
    <aside className={`zuik-sidebar${panelOpen ? '' : ' zuik-sidebar-collapsed'}`}>
      {panelOpen ? (
        <div className="zuik-sidebar-content-wrap">
          <div className="zuik-sidebar-content">
            <div className="zuik-sidebar-search">
              <SearchIcon />
              <input
                placeholder="Search blocks..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {categoryOrder.map(cat => {
                const meta = CATEGORY_META[cat]
                const items = grouped[cat].filter(matchesSearch)
                if (deferredSearch && items.length === 0) return null
                const isCollapsed = collapsed[cat] && !deferredSearch

                return (
                  <div key={cat}>
                    <div className="zuik-category-header" onClick={() => toggleCategory(cat)}>
                      <span className="zuik-category-title">{meta.label}</span>
                      <span className="zuik-category-count">
                        {items.length}
                        {isCollapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
                      </span>
                    </div>
                    {!isCollapsed && items.map(block => {
                      const Icon = block.icon
                      return (
                        <div
                          key={block.id}
                          className="zuik-block-item"
                          draggable
                          onDragStart={(e) => onDragStart(e, block.id)}
                          title={block.description}
                        >
                          <div className={`zuik-block-icon ${meta.bgClass}`}>
                            <Icon size={14} className={meta.colorClass} />
                          </div>
                          <span>{block.name}</span>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
          <button
            type="button"
            className="zuik-sidebar-edge-toggle"
            onClick={() => setPanelOpen(false)}
            title="Collapse blocks panel"
          >
            <CollapseIcon />
          </button>
        </div>
      ) : (
        <div className="zuik-sidebar-collapsed-strip">
          <button
            type="button"
            className="zuik-sidebar-expand-btn"
            onClick={() => setPanelOpen(true)}
            title="Open blocks panel"
          >
            <ExpandIcon />
          </button>
        </div>
      )}
    </aside>
  )
}
