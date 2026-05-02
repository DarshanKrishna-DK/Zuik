/**
 * Server-side materialization of ParsedIntent steps into React Flow JSON
 * (mirrors projects/Zuik-frontend/src/lib/intentMaterializer.ts without UI deps).
 */

export interface IntentStep {
  action: string
  params: Record<string, string | number>
}

export interface ParsedWorkflowIntent {
  intent: string
  workflowName?: string
  steps: IntentStep[]
  explanation: string
  confidence: number
}

const NODE_WIDTH = 280
const HORIZONTAL_GAP = 60
const START_X = 80
const START_Y = 80

let matCounter = 0
function nextMatId() {
  return `tg_${Date.now()}_${matCounter++}`
}

/** Defaults merged when params omit a field (aligned with blockRegistry defaults). */
const BLOCK_DEFAULTS: Record<string, Record<string, string | number>> = {
  'timer-loop': { interval: 60 },
  'wallet-event': { assetId: 0, pollInterval: 15, amountMode: 'received' },
  'swap-token': { slippage: 0.5 },
  'delay': { duration: 5 },
  'comparator': { operator: '<', threshold: 0 },
  'rate-limiter': { maxPerWindow: 5, windowSec: 60 },
  'create-asa': { decimals: 6 },
}

function mergeConfig(blockId: string, params: Record<string, string | number>): Record<string, string | number | undefined> {
  const defaults = BLOCK_DEFAULTS[blockId] ?? {}
  return { ...defaults, ...params }
}

export interface FlowNodeJson {
  id: string
  type: string
  position: { x: number; y: number }
  data: { blockId: string; config: Record<string, string | number | undefined>; label?: string }
}

export interface FlowEdgeJson {
  id: string
  source: string
  target: string
  sourceHandle?: string
}

export function materializeTelegramIntent(parsed: ParsedWorkflowIntent): { nodes: FlowNodeJson[]; edges: FlowEdgeJson[] } {
  const nodes: FlowNodeJson[] = []
  const edges: FlowEdgeJson[] = []

  let x = START_X
  const y = START_Y
  let prevNodeId: string | null = null
  let prevSourceHandle: string | null = null

  for (let i = 0; i < parsed.steps.length; i++) {
    const step = parsed.steps[i]
    const nodeId = nextMatId()
    const config = mergeConfig(step.action, step.params)

    nodes.push({
      id: nodeId,
      type: 'generic',
      position: { x, y },
      data: {
        blockId: step.action,
        config,
        label: humanLabel(step.action),
      },
    })

    if (prevNodeId) {
      edges.push({
        id: `e_${prevNodeId}_${nodeId}`,
        source: prevNodeId,
        target: nodeId,
        sourceHandle: prevSourceHandle ?? undefined,
      })
    }

    if (step.action === 'comparator') {
      prevSourceHandle = 'true'
    } else {
      prevSourceHandle = null
    }

    prevNodeId = nodeId
    x += NODE_WIDTH + HORIZONTAL_GAP
  }

  return { nodes, edges }
}

function humanLabel(blockId: string): string {
  const map: Record<string, string> = {
    'timer-loop': 'Timer Loop',
    'wallet-event': 'Wallet Event',
    'swap-token': 'Swap Token',
    'send-payment': 'Send Payment',
    'send-telegram': 'Send Telegram',
    'get-quote': 'Get Quote',
    'comparator': 'Comparator',
    'delay': 'Delay',
    'math-op': 'Math Operation',
  }
  return map[blockId] ?? blockId
}
