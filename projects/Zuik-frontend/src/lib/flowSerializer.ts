import type { Node, Edge } from '@xyflow/react'

const STORAGE_KEY = 'zuik-flow-autosave'

export interface SerializedFlow {
  nodes: Node[]
  edges: Edge[]
  version: number
  savedAt: string
}

export function serializeFlow(nodes: Node[], edges: Edge[]): SerializedFlow {
  return {
    nodes,
    edges,
    version: 1,
    savedAt: new Date().toISOString(),
  }
}

export function saveFlowToLocal(nodes: Node[], edges: Edge[]): void {
  const data = serializeFlow(nodes, edges)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function loadFlowFromLocal(): SerializedFlow | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as SerializedFlow
  } catch {
    return null
  }
}

export function clearFlowLocal(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export function exportFlowJSON(nodes: Node[], edges: Edge[]): string {
  return JSON.stringify(serializeFlow(nodes, edges), null, 2)
}

export function importFlowJSON(json: string): SerializedFlow | null {
  try {
    const data = JSON.parse(json)
    if (data.nodes && data.edges) return data as SerializedFlow
    return null
  } catch {
    return null
  }
}
