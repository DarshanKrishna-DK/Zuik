import type { Node, Edge } from '@xyflow/react'
import type { ParsedIntent, IntentStep } from '../services/intentParser'
import { getBlockById } from './blockRegistry'

const NODE_WIDTH = 280
const NODE_HEIGHT_ESTIMATE = 180
const HORIZONTAL_GAP = 60
const VERTICAL_OFFSET = 240
const START_X = 80
const START_Y = 80

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

    if (prevNodeId) {
      const edge: Edge = {
        id: `e_${prevNodeId}_${nodeId}`,
        source: prevNodeId,
        target: nodeId,
        sourceHandle: prevSourceHandle ?? undefined,
      }
      edges.push(edge)
    }

    if (step.action === 'comparator') {
      prevSourceHandle = 'true'
      handleComparatorBranching(intent.steps, i, nodeId, x, y, nodes, edges)
    } else {
      prevSourceHandle = null
    }

    prevNodeId = nodeId
    x += NODE_WIDTH + HORIZONTAL_GAP
  }

  return { nodes, edges }
}

function handleComparatorBranching(
  steps: IntentStep[],
  comparatorIndex: number,
  comparatorNodeId: string,
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

    const falseEdge: Edge = {
      id: `e_${comparatorNodeId}_${falseNodeId}`,
      source: comparatorNodeId,
      target: falseNodeId,
      sourceHandle: 'false',
    }
    _edges.push(falseEdge)
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
        allEdges.push({
          id: `auto_${lastExisting.id}_${firstNewId}`,
          source: lastExisting.id,
          target: firstNewId,
        })
      }
    }
  }

  return {
    nodes: [...existingNodes, ...shifted],
    edges: allEdges,
  }
}
