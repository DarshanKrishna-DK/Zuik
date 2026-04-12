import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react'
import { getBlockById, CATEGORY_META, PORT_COLORS, type BlockDefinition, type Port } from '../../lib/blockRegistry'
import BlockInputs from './BlockInputs'

export interface GenericNodeData {
  blockId: string
  config: Record<string, string | number>
  label?: string
  executionStatus?: 'running' | 'success' | 'error' | 'idle'
  [key: string]: unknown
}

function XIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
}

function PortHandle({ port, type, index, total }: { port: Port; type: 'source' | 'target'; index: number; total: number }) {
  const offset = total === 1 ? 50 : 20 + (index * 60) / Math.max(total - 1, 1)
  const position = type === 'source' ? Position.Right : Position.Left

  return (
    <Handle
      type={type}
      position={position}
      id={port.id}
      style={{
        top: `${offset}%`,
        background: PORT_COLORS[port.type],
        borderColor: PORT_COLORS[port.type],
      }}
      title={`${port.label} (${port.type})`}
    />
  )
}

export default function GenericNode({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as GenericNodeData
  const def: BlockDefinition | undefined = getBlockById(nodeData.blockId)
  const { setNodes, setEdges } = useReactFlow()
  if (!def) return <div className="zuik-node">Unknown block</div>

  const catMeta = CATEGORY_META[def.category]
  const Icon = def.icon

  const onConfigChange = (fieldId: string, value: string | number) => {
    nodeData.config = { ...nodeData.config, [fieldId]: value }
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    setNodes((nds) => nds.filter((n) => n.id !== id))
    setEdges((eds) => eds.filter((edge) => edge.source !== id && edge.target !== id))
  }

  const statusClass = nodeData.executionStatus && nodeData.executionStatus !== 'idle'
    ? nodeData.executionStatus : ''

  return (
    <div className={`zuik-node ${selected ? 'selected' : ''} ${statusClass}`}>
      {def.inputs.map((port, i) => (
        <PortHandle key={port.id} port={port} type="target" index={i} total={def.inputs.length} />
      ))}

      <button className="zuik-node-delete" onClick={handleDelete} title="Delete block">
        <XIcon />
      </button>

      <div className="zuik-node-header">
        <div className={`zuik-node-header-icon ${catMeta.bgClass}`}>
          <Icon size={14} className={catMeta.colorClass} />
        </div>
        <span className="zuik-node-title">{nodeData.label || def.name}</span>
      </div>

      {def.config.length > 0 && (
        <div className="zuik-node-body">
          <BlockInputs fields={def.config} values={nodeData.config} onChange={onConfigChange} />
        </div>
      )}

      {def.outputs.map((port, i) => (
        <PortHandle key={port.id} port={port} type="source" index={i} total={def.outputs.length} />
      ))}
    </div>
  )
}
