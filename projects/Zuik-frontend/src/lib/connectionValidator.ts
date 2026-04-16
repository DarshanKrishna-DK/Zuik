import type { Connection, Node } from '@xyflow/react'
import { getBlockById, type PortType } from './blockRegistry'

function areTypesCompatible(source: PortType, target: PortType): boolean {
  if (source === 'any' || target === 'any') return true
  return source === target
}

export function isValidConnection(connection: Connection, nodes: Node[]): boolean {
  if (!connection.source || !connection.target) return false
  if (connection.source === connection.target) return false

  const sourceNode = nodes.find(n => n.id === connection.source)
  const targetNode = nodes.find(n => n.id === connection.target)
  if (!sourceNode || !targetNode) return false

  const sourceBlockId = sourceNode.data?.blockId as string | undefined
  const targetBlockId = targetNode.data?.blockId as string | undefined
  if (!sourceBlockId || !targetBlockId) return false

  const sourceDef = getBlockById(sourceBlockId)
  const targetDef = getBlockById(targetBlockId)
  if (!sourceDef || !targetDef) return false

  const sourcePort = sourceDef.outputs.find(p => p.id === connection.sourceHandle)
  const targetPort = targetDef.inputs.find(p => p.id === connection.targetHandle)
  if (!sourcePort || !targetPort) return true

  return areTypesCompatible(sourcePort.type, targetPort.type)
}
