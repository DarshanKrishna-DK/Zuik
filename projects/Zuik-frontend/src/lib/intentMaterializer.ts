import type { Node, Edge } from '@xyflow/react'
import type { ParsedIntent, IntentStep, CanvasBlock } from '../services/intentParser'
import { getBlockById, type BlockDefinition } from './blockRegistry'

const NODE_WIDTH = 280
const NODE_HEIGHT_ESTIMATE = 180
const HORIZONTAL_GAP = 60
const VERTICAL_OFFSET = 240
const START_X = 80
const START_Y = 80

const SOURCE_HANDLE_PRIORITY = [
  'tick', 'txn', 'txId', 'amount', 'out', 'true', 'result', 'output',
  'passed', 'payload', 'triggered', 'value', 'quoteAmount', 'merged', 'passthrough',
]

function pickSourceHandle(def: BlockDefinition, override?: string | null): string | undefined {
  if (override && def.outputs.some((port) => port.id === override)) return override
  for (const id of SOURCE_HANDLE_PRIORITY) {
    if (def.outputs.some((port) => port.id === id)) return id
  }
  return def.outputs[0]?.id
}

function pickTargetHandle(
  targetDef: BlockDefinition,
  sourceDef: BlockDefinition,
  sourceHandle?: string,
): string | undefined {
  if (targetDef.inputs.length === 0) return undefined

  const sourcePort =
    sourceDef.outputs.find((port) => port.id === sourceHandle) ?? sourceDef.outputs[0]

  if (sourcePort) {
    const compatible = targetDef.inputs.find(
      (port) =>
        port.type === sourcePort.type ||
        port.type === 'any' ||
        sourcePort.type === 'any',
    )
    if (compatible) return compatible.id
  }

  for (const preferred of ['trigger', 'input', 'value', 'input1']) {
    const match = targetDef.inputs.find((port) => port.id === preferred)
    if (match) return match.id
  }

  return targetDef.inputs[0]?.id
}

function buildEdge(
  sourceId: string,
  targetId: string,
  sourceDef: BlockDefinition,
  targetDef: BlockDefinition,
  sourceHandleOverride?: string | null,
): Edge {
  const sourceHandle = pickSourceHandle(sourceDef, sourceHandleOverride)
  const targetHandle = pickTargetHandle(targetDef, sourceDef, sourceHandle)
  return {
    id: `e_${sourceId}_${targetId}`,
    source: sourceId,
    target: targetId,
    ...(sourceHandle ? { sourceHandle } : {}),
    ...(targetHandle ? { targetHandle } : {}),
  }
}

let matCounter = 0
function nextMatId() {
  return `intent_${Date.now()}_${matCounter++}`
}

interface MaterializedFlow {
  nodes: Node[]
  edges: Edge[]
}

export function materializeIntent(intent: ParsedIntent): MaterializedFlow {
  const nodes: Node[] = []
  const edges: Edge[] = []

  let x = START_X
  const y = START_Y
  let prevNodeId: string | null = null
  let prevDef: BlockDefinition | null = null
  let prevSourceHandle: string | null = null

  for (let i = 0; i < intent.steps.length; i++) {
    const step = intent.steps[i]
    const def = getBlockById(step.action)
    if (!def) continue

    const nodeId = nextMatId()

    const config: Record<string, string | number | undefined> = {}
    for (const field of def.config) {
      if (step.params[field.id] !== undefined) {
        config[field.id] = step.params[field.id]
      } else if (field.defaultValue !== undefined) {
        config[field.id] = field.defaultValue
      }
    }

    const node: Node = {
      id: nodeId,
      type: 'generic',
      position: { x, y },
      data: {
        blockId: def.id,
        config,
        label: def.name,
      },
    }
    nodes.push(node)

    if (prevNodeId && prevDef) {
      edges.push(buildEdge(prevNodeId, nodeId, prevDef, def, prevSourceHandle))
    }

    if (step.action === 'comparator') {
      prevSourceHandle = 'true'
      handleComparatorBranching(intent.steps, i, nodeId, def, x, y, nodes, edges)
    } else {
      prevSourceHandle = null
    }

    prevNodeId = nodeId
    prevDef = def
    x += NODE_WIDTH + HORIZONTAL_GAP
  }

  return { nodes, edges }
}

function handleComparatorBranching(
  steps: IntentStep[],
  comparatorIndex: number,
  comparatorNodeId: string,
  comparatorDef: BlockDefinition,
  baseX: number,
  baseY: number,
  _nodes: Node[],
  _edges: Edge[],
) {
  const nextStep = steps[comparatorIndex + 1]
  if (!nextStep) return

  const nextDef = getBlockById(nextStep.action)
  if (!nextDef) return

  const isBranchingAction =
    nextDef.category === 'notification' ||
    nextDef.category === 'action'

  if (isBranchingAction) {
    const falseNodeId = nextMatId()
    const falseDef = getBlockById('log-debug')
    if (!falseDef) return

    const falseNode: Node = {
      id: falseNodeId,
      type: 'generic',
      position: { x: baseX, y: baseY + VERTICAL_OFFSET },
      data: {
        blockId: 'log-debug',
        config: { label: 'Condition not met' },
        label: 'Log / Debug',
      },
    }
    _nodes.push(falseNode)

    _edges.push(buildEdge(comparatorNodeId, falseNodeId, comparatorDef, falseDef, 'false'))
  }
}

export function addNodesToCanvas(
  existingNodes: Node[],
  existingEdges: Edge[],
  newNodes: Node[],
  newEdges: Edge[],
): { nodes: Node[]; edges: Edge[] } {
  if (existingNodes.length === 0) {
    return { nodes: newNodes, edges: newEdges }
  }

  // Find the right-most edge of existing nodes
  let maxX = 0
  for (const n of existingNodes) {
    const right = n.position.x + NODE_WIDTH
    if (right > maxX) maxX = right
  }

  // Place new nodes to the right of existing ones, same Y row
  const baseY = existingNodes[0]?.position.y ?? START_Y
  const shifted = newNodes.map((n, i) => ({
    ...n,
    position: {
      x: maxX + HORIZONTAL_GAP + i * (NODE_WIDTH + HORIZONTAL_GAP),
      y: baseY,
    },
  }))

  const allEdges = [...existingEdges, ...newEdges]

  // Auto-connect: link last existing node to first new node
  if (shifted.length > 0) {
    const firstNewId = shifted[0].id
    const hasIncoming = allEdges.some((e) => e.target === firstNewId)
    if (!hasIncoming) {
      const lastExisting = existingNodes[existingNodes.length - 1]
      if (lastExisting) {
        const lastBlockId = (lastExisting.data as { blockId?: string }).blockId
        const firstNewBlockId = (shifted[0].data as { blockId?: string }).blockId
        const lastDef = lastBlockId ? getBlockById(lastBlockId) : undefined
        const firstDef = firstNewBlockId ? getBlockById(firstNewBlockId) : undefined
        if (lastDef && firstDef) {
          allEdges.push(buildEdge(lastExisting.id, firstNewId, lastDef, firstDef))
        } else {
          allEdges.push({
            id: `auto_${lastExisting.id}_${firstNewId}`,
            source: lastExisting.id,
            target: firstNewId,
          })
        }
      }
    }
  }

  return {
    nodes: [...existingNodes, ...shifted],
    edges: allEdges,
  }
}

export type CanvasUpdateMode = 'replace' | 'add' | 'in_place'

export function nodesToCanvasBlocks(nodes: Node[]): CanvasBlock[] {
  return nodes.map((n) => {
    const data = n.data as {
      blockId?: string
      config?: Record<string, string | number | undefined>
      label?: string
    }
    const blockId = data.blockId ?? ''
    const def = getBlockById(blockId)
    return {
      nodeId: n.id,
      blockId,
      blockName: def?.name ?? data.label ?? blockId,
      config: data.config ?? {},
    }
  })
}

export function inferCanvasUpdateMode(
  intent: ParsedIntent,
  canvasBlocks: CanvasBlock[],
  userMessage: string,
): CanvasUpdateMode {
  if (canvasBlocks.length === 0) return 'replace'

  const lower = userMessage.toLowerCase()
  if (/\b(add|also|extend|append|another|extra)\b/.test(lower)) return 'add'
  if (intent.replaceCanvas === true) return 'replace'
  if (/\b(change|instead|update|modify|revise|replace)\b/.test(lower)) return 'replace'
  if (intent.replaceCanvas === false) return 'add'

  const existingIds = canvasBlocks.map((b) => b.blockId)
  const newIds = intent.steps.map((s) => s.action)
  if (
    existingIds.length === newIds.length &&
    existingIds.every((id, i) => id === newIds[i])
  ) {
    return 'in_place'
  }

  return 'replace'
}

export function updateCanvasInPlace(
  intent: ParsedIntent,
  existingNodes: Node[],
  existingEdges: Edge[],
): { nodes: Node[]; edges: Edge[] } | null {
  const existingIds = existingNodes.map(
    (n) => (n.data as { blockId?: string }).blockId ?? '',
  )
  const newIds = intent.steps.map((s) => s.action)
  if (
    existingIds.length !== newIds.length ||
    !existingIds.every((id, i) => id === newIds[i])
  ) {
    return null
  }

  const nodes = existingNodes.map((node, i) => {
    const step = intent.steps[i]
    const def = getBlockById(step.action)
    if (!def) return node

    const config: Record<string, string | number | undefined> = {}
    for (const field of def.config) {
      if (step.params[field.id] !== undefined) {
        config[field.id] = step.params[field.id]
      } else if (field.defaultValue !== undefined) {
        config[field.id] = field.defaultValue
      }
    }

    return {
      ...node,
      data: {
        ...node.data,
        blockId: def.id,
        config,
        label: def.name,
      },
    }
  })

  return { nodes, edges: existingEdges }
}

export function applyIntentToCanvas(
  intent: ParsedIntent,
  existingNodes: Node[],
  existingEdges: Edge[],
  mode: CanvasUpdateMode,
): { nodes: Node[]; edges: Edge[] } {
  if (mode === 'in_place') {
    const updated = updateCanvasInPlace(intent, existingNodes, existingEdges)
    if (updated) return updated
  }

  const materialized = materializeIntent(intent)
  if (mode === 'add') {
    return addNodesToCanvas(existingNodes, existingEdges, materialized.nodes, materialized.edges)
  }

  return materialized
}
