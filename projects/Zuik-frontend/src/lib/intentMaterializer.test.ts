/**
 * Run: npx tsx src/lib/intentMaterializer.test.ts
 */
import type { Node, Edge } from '@xyflow/react'
import {
  applyIntentToCanvas,
  inferCanvasUpdateMode,
  materializeIntent,
  nodesToCanvasBlocks,
  updateCanvasInPlace,
} from './intentMaterializer'
import type { ParsedIntent } from '../services/intentParser'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function makeNode(id: string, blockId: string, x: number): Node {
  return {
    id,
    type: 'generic',
    position: { x, y: 80 },
    data: { blockId, config: { amount: 50 }, label: blockId },
  }
}

const existingNodes: Node[] = [
  makeNode('n1', 'wallet-event', 80),
  makeNode('n2', 'swap-token', 420),
]
const existingEdges: Edge[] = [{ id: 'e1', source: 'n1', target: 'n2' }]

// Second prompt without "add" language should replace, not stack
const reviseIntent: ParsedIntent = {
  intent: 'revise_partial_swap',
  steps: [
    { action: 'wallet-event', params: { assetId: 10458941, address: 'ADDR', pollInterval: 15, amountMode: 'received' } },
    { action: 'math-op', params: { operation: 'percentage', b: 20 } },
    { action: 'swap-token', params: { fromAsset: 10458941, toAsset: 0, amount: '{{math-op.result}}', slippage: 0.5 } },
  ],
  explanation: 'revise',
  confidence: 0.9,
  replaceCanvas: false,
  userMessage: 'Change it to swap 20% instead of all',
}

const mode = inferCanvasUpdateMode(reviseIntent, nodesToCanvasBlocks(existingNodes), reviseIntent.userMessage!)
assert(mode === 'replace', `expected replace for revision, got ${mode}`)

const applied = applyIntentToCanvas(reviseIntent, existingNodes, existingEdges, mode)
assert(applied.nodes.length === 3, `expected 3 nodes after replace, got ${applied.nodes.length}`)
assert(!applied.nodes.some((n) => n.id === 'n1'), 'old nodes should be gone after structural replace')

// Same structure, config-only change should update in place
const configIntent: ParsedIntent = {
  intent: 'tweak_swap',
  steps: [
    { action: 'wallet-event', params: { assetId: 10458941, address: 'ADDR', pollInterval: 30, amountMode: 'received' } },
    { action: 'swap-token', params: { fromAsset: 10458941, toAsset: 0, amount: '{{wallet-event.amount}}', slippage: 1 } },
  ],
  explanation: 'tweak',
  confidence: 0.9,
  userMessage: 'Poll every 30 seconds and use 1% slippage',
}

const inPlace = updateCanvasInPlace(configIntent, existingNodes, existingEdges)
assert(inPlace !== null, 'should update in place when block sequence matches')
assert(inPlace!.nodes[0].id === 'n1', 'node ids should be preserved')
const cfg = (inPlace!.nodes[1].data as { config: Record<string, unknown> }).config
assert(cfg.slippage === 1, 'swap slippage should be updated in place')

// Explicit extend should append
const addIntent: ParsedIntent = {
  intent: 'add_telegram_alert',
  steps: [{ action: 'send-telegram', params: { chatId: '123', message: 'done' } }],
  explanation: 'add alert',
  confidence: 0.9,
  replaceCanvas: false,
  userMessage: 'Also add a Telegram alert when done',
}

const addMode = inferCanvasUpdateMode(addIntent, nodesToCanvasBlocks(existingNodes), addIntent.userMessage!)
assert(addMode === 'add', `expected add for explicit extend, got ${addMode}`)

const added = applyIntentToCanvas(addIntent, existingNodes, existingEdges, addMode)
assert(added.nodes.length === 3, `expected 3 nodes after add, got ${added.nodes.length}`)
assert(added.nodes.some((n) => n.id === 'n1'), 'existing nodes should remain when adding')
assert(added.edges.some((e) => e.source === 'n2'), 'new block should connect from last flow node')

// First workflow on empty canvas
const fresh = materializeIntent({
  intent: 'swap',
  steps: [{ action: 'swap-token', params: { fromAsset: 0, toAsset: 10458941, amount: 10, slippage: 0.5 } }],
  explanation: 'swap',
  confidence: 0.95,
})
assert(fresh.nodes.length === 1, 'materialize should create one node')

console.log('intentMaterializer tests passed')
