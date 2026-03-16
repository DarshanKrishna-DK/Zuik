import { Handle, Position, type NodeProps } from '@xyflow/react'
import { getBlockById, CATEGORY_META, PORT_COLORS, type BlockDefinition, type Port } from '../../lib/blockRegistry'
import BlockInputs from './BlockInputs'

export interface GenericNodeData {
  blockId: string
  config: Record<string, string | number>
  label?: string
  executionStatus?: 'running' | 'success' | 'error' | 'idle'
  [key: string]: unknown
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

export default function GenericNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as GenericNodeData
  const def: BlockDefinition | undefined = getBlockById(nodeData.blockId)
  if (!def) return <div className="zuik-node">Unknown block</div>

  const catMeta = CATEGORY_META[def.category]
  const Icon = def.icon

  const onConfigChange = (fieldId: string, value: string | number) => {
    nodeData.config = { ...nodeData.config, [fieldId]: value }
  }

  const statusClass = nodeData.executionStatus && nodeData.executionStatus !== 'idle'
    ? `node-${nodeData.executionStatus}` : ''

  return (
    <div className={`zuik-node ${selected ? 'selected' : ''} ${statusClass}`}>
      {def.inputs.map((port, i) => (
        <PortHandle key={port.id} port={port} type="target" index={i} total={def.inputs.length} />
      ))}

      <div className="zuik-node-header">
        <div className={`zuik-node-icon ${catMeta.bgClass}`}>
          <Icon size={14} className={catMeta.colorClass} />
        </div>
        <span className="zuik-node-title">{nodeData.label || def.name}</span>
        <span className={`zuik-node-category ${catMeta.bgClass} ${catMeta.colorClass}`}>
          {catMeta.label.slice(0, -1)}
        </span>
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
