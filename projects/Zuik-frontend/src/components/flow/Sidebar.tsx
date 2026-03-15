import { useState } from 'react'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'
import { getBlocksByCategory, CATEGORY_META, type BlockCategory, type BlockDefinition } from '../../lib/blockRegistry'

const categoryOrder: BlockCategory[] = ['trigger', 'action', 'logic', 'notification', 'defi']

export default function Sidebar() {
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const grouped = getBlocksByCategory()

  const matchesSearch = (block: BlockDefinition) => {
    if (!search) return true
    const q = search.toLowerCase()
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
    <aside className="zuik-sidebar">
      <div className="zuik-sidebar-header">
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--zuik-text-dim)' }} />
          <input
            className="zuik-sidebar-search"
            style={{ paddingLeft: 30 }}
            placeholder="Search blocks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="zuik-sidebar-scroll">
        {categoryOrder.map(cat => {
          const meta = CATEGORY_META[cat]
          const items = grouped[cat].filter(matchesSearch)
          if (search && items.length === 0) return null
          const isCollapsed = collapsed[cat] && !search

          return (
            <div key={cat} className="zuik-category">
              <div className="zuik-category-header" onClick={() => toggleCategory(cat)}>
                <span className={meta.colorClass}>{meta.label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="zuik-category-badge">{items.length}</span>
                  {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </div>
              </div>
              {!isCollapsed && (
                <div className="zuik-category-items">
                  {items.map(block => {
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
              )}
            </div>
          )
        })}
      </div>
    </aside>
  )
}
