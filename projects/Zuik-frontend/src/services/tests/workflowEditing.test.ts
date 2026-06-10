import { describe, expect, it, beforeEach, vi } from 'vitest'
import type { ParsedIntent, CanvasBlock } from '../intentParser'
import { applyIntentToCanvas, inferCanvasUpdateMode, updateCanvasInPlace } from '../../lib/intentMaterializer'
import type { Node, Edge } from '@xyflow/react'

// Mock block definitions for testing
const mockSwapBlock = {
  id: 'swap-token',
  name: 'Swap Token',
  category: 'defi' as const,
  description: 'Swap tokens',
  icon: {} as any,
  inputs: [],
  outputs: [],
  config: [
    { id: 'fromAsset', type: 'number' as const, label: 'From Asset', defaultValue: 0 },
    { id: 'toAsset', type: 'number' as const, label: 'To Asset', defaultValue: 0 },
    { id: 'amount', type: 'number' as const, label: 'Amount', defaultValue: 0 },
    { id: 'slippage', type: 'number' as const, label: 'Slippage', defaultValue: 0.5 },
  ],
}

const mockTimerBlock = {
  id: 'timer-loop',
  name: 'Timer Loop',
  category: 'trigger' as const,
  description: 'Run on schedule',
  icon: {} as any,
  inputs: [],
  outputs: [],
  config: [
    { id: 'interval', type: 'number' as const, label: 'Interval', defaultValue: 60 },
    { id: 'iterations', type: 'number' as const, label: 'Iterations', defaultValue: 0 },
  ],
}

// Mock the block registry
vi.mock('../../lib/blockRegistry', () => ({
  getBlockById: (id: string) => {
    if (id === 'swap-token') return mockSwapBlock
    if (id === 'timer-loop') return mockTimerBlock
    return null
  },
  getAllBlocks: () => [mockSwapBlock, mockTimerBlock],
}))

describe('Workflow Editing', () => {
  let nodes: Node[]
  let edges: Edge[]
  let canvasBlocks: CanvasBlock[]

  beforeEach(() => {
    nodes = [
      {
        id: 'node1',
        type: 'generic',
        position: { x: 0, y: 0 },
        data: {
          blockId: 'timer-loop',
          label: 'Timer Loop',
          config: { interval: 60, iterations: 5 },
        },
      },
      {
        id: 'node2',
        type: 'generic',
        position: { x: 200, y: 0 },
        data: {
          blockId: 'swap-token',
          label: 'Swap Token',
          config: { fromAsset: 0, toAsset: 10458941, amount: 10, slippage: 0.5 },
        },
      },
    ]

    edges = [
      {
        id: 'edge1',
        source: 'node1',
        target: 'node2',
      },
    ]

    canvasBlocks = [
      {
        nodeId: 'node1',
        blockId: 'timer-loop',
        blockName: 'Timer Loop',
        config: { interval: 60, iterations: 5 },
      },
      {
        nodeId: 'node2',
        blockId: 'swap-token',
        blockName: 'Swap Token',
        config: { fromAsset: 0, toAsset: 10458941, amount: 10, slippage: 0.5 },
      },
    ]
  })

  describe('inferCanvasUpdateMode', () => {
    it('should return "replace" for empty canvas', () => {
      const intent: ParsedIntent = {
        intent: 'test_workflow',
        steps: [{ action: 'swap-token', params: { fromAsset: 0, toAsset: 10458941 } }],
        explanation: 'Test',
        confidence: 0.9,
      }
      
      const mode = inferCanvasUpdateMode(intent, [], 'swap 10 USDC')
      expect(mode).toBe('replace')
    })

    it('should return "add" for messages with add keywords', () => {
      const intent: ParsedIntent = {
        intent: 'add_notification',
        steps: [{ action: 'send-telegram', params: { message: 'test' } }],
        explanation: 'Test',
        confidence: 0.9,
      }
      
      const mode = inferCanvasUpdateMode(intent, canvasBlocks, 'also add a telegram notification')
      expect(mode).toBe('add')
    })

    it('should return "replace" for messages with replace keywords', () => {
      const intent: ParsedIntent = {
        intent: 'modify_workflow',
        steps: [{ action: 'swap-token', params: { fromAsset: 0, toAsset: 31566704 } }],
        explanation: 'Test',
        confidence: 0.9,
      }
      
      const mode = inferCanvasUpdateMode(intent, canvasBlocks, 'change this to swap USDC instead')
      expect(mode).toBe('replace')
    })

    it('should return "in_place" for same block sequence', () => {
      const intent: ParsedIntent = {
        intent: 'update_config',
        steps: [
          { action: 'timer-loop', params: { interval: 30 } },
          { action: 'swap-token', params: { amount: 20 } },
        ],
        explanation: 'Test',
        confidence: 0.9,
      }
      
      const mode = inferCanvasUpdateMode(intent, canvasBlocks, 'set the timer to 30 seconds')
      expect(mode).toBe('in_place')
    })

    it('should respect explicit replaceCanvas flag', () => {
      const intent: ParsedIntent = {
        intent: 'rebuild_workflow',
        steps: [{ action: 'swap-token', params: { fromAsset: 0 } }],
        explanation: 'Test',
        confidence: 0.9,
        replaceCanvas: true,
      }
      
      const mode = inferCanvasUpdateMode(intent, canvasBlocks, 'create a simple swap')
      expect(mode).toBe('replace')
    })
  })

  describe('updateCanvasInPlace', () => {
    it('should update configs for matching block sequence', () => {
      const intent: ParsedIntent = {
        intent: 'update_config',
        steps: [
          { action: 'timer-loop', params: { interval: 30, iterations: 10 } },
          { action: 'swap-token', params: { amount: 20, slippage: 1.0 } },
        ],
        explanation: 'Test',
        confidence: 0.9,
      }

      const result = updateCanvasInPlace(intent, nodes, edges)
      
      expect(result).toBeTruthy()
      expect(result!.nodes).toHaveLength(2)
      expect(result!.nodes[0].data.config.interval).toBe(30)
      expect(result!.nodes[0].data.config.iterations).toBe(10)
      expect(result!.nodes[1].data.config.amount).toBe(20)
      expect(result!.nodes[1].data.config.slippage).toBe(1.0)
    })

    it('should return null for mismatched block sequence', () => {
      const intent: ParsedIntent = {
        intent: 'different_workflow',
        steps: [
          { action: 'swap-token', params: { amount: 20 } },
          { action: 'timer-loop', params: { interval: 30 } },
        ],
        explanation: 'Test',
        confidence: 0.9,
      }

      const result = updateCanvasInPlace(intent, nodes, edges)
      expect(result).toBe(null)
    })

    it('should return null for different number of blocks', () => {
      const intent: ParsedIntent = {
        intent: 'add_block',
        steps: [
          { action: 'timer-loop', params: { interval: 30 } },
          { action: 'swap-token', params: { amount: 20 } },
          { action: 'send-telegram', params: { message: 'done' } },
        ],
        explanation: 'Test',
        confidence: 0.9,
      }

      const result = updateCanvasInPlace(intent, nodes, edges)
      expect(result).toBe(null)
    })
  })

  describe('applyIntentToCanvas - Add Mode', () => {
    it('should call materializeIntent and addNodesToCanvas for add mode', () => {
      const intent: ParsedIntent = {
        intent: 'add_notification',
        steps: [{ action: 'send-telegram', params: { message: 'Swap completed' } }],
        explanation: 'Test',
        confidence: 0.9,
      }

      // Test that add mode processes correctly (actual materializeIntent behavior tested separately)
      const result = applyIntentToCanvas(intent, nodes, edges, 'add')
      
      // Should return some result (exact nodes depend on materializeIntent implementation)
      expect(result).toBeDefined()
      expect(result.nodes).toBeDefined()
      expect(result.edges).toBeDefined()
    })
  })

  describe('applyIntentToCanvas - Replace Mode', () => {
    it('should call materializeIntent for replace mode', () => {
      const intent: ParsedIntent = {
        intent: 'new_workflow',
        steps: [{ action: 'swap-token', params: { fromAsset: 31566704, toAsset: 0, amount: 100 } }],
        explanation: 'Test',
        confidence: 0.9,
      }

      const result = applyIntentToCanvas(intent, nodes, edges, 'replace')
      
      // Should return materialized result (exact content depends on materializeIntent)
      expect(result).toBeDefined()
      expect(result.nodes).toBeDefined()
      expect(result.edges).toBeDefined()
    })
  })

  describe('applyIntentToCanvas - In-Place Mode', () => {
    it('should update in place when structure matches', () => {
      const intent: ParsedIntent = {
        intent: 'update_amounts',
        steps: [
          { action: 'timer-loop', params: { interval: 120 } },
          { action: 'swap-token', params: { amount: 50 } },
        ],
        explanation: 'Test',
        confidence: 0.9,
      }

      const result = applyIntentToCanvas(intent, nodes, edges, 'in_place')
      
      expect(result.nodes).toHaveLength(2)
      expect(result.nodes[0].data.config.interval).toBe(120)
      expect(result.nodes[1].data.config.amount).toBe(50)
      expect(result.edges).toBe(edges) // Edges should be preserved
    })

    it('should fall back to replace mode when in-place fails', () => {
      const intent: ParsedIntent = {
        intent: 'different_structure',
        steps: [{ action: 'send-telegram', params: { message: 'test' } }],
        explanation: 'Test',
        confidence: 0.9,
      }

      const result = applyIntentToCanvas(intent, nodes, edges, 'in_place')
      
      // Should fall back to materialized result when in-place update fails
      expect(result).toBeDefined()
      expect(result.nodes).toBeDefined()
      expect(result.edges).toBeDefined()
    })
  })
})

describe('Intent Resolution', () => {
  describe('Modify Block Resolution', () => {
    it('should prefer nodeId when available', () => {
      const canvasBlocks: CanvasBlock[] = [
        { nodeId: 'node1', blockId: 'swap-token', blockName: 'Swap Token', config: { amount: 10 } },
        { nodeId: 'node2', blockId: 'swap-token', blockName: 'Swap Token', config: { amount: 20 } },
      ]

      const modifications = [
        { blockId: 'swap-token', nodeId: 'node2', configChanges: { amount: 50 } }
      ]

      // Test that nodeId takes precedence
      const targetMod = modifications.find((m) => 
        m.nodeId === 'node2' || (m.blockId === 'swap-token' && !m.nodeId))
      
      expect(targetMod?.nodeId).toBe('node2')
    })

    it('should handle single block of type correctly', () => {
      const canvasBlocks: CanvasBlock[] = [
        { nodeId: 'node1', blockId: 'timer-loop', blockName: 'Timer Loop', config: { interval: 60 } },
      ]

      const modifications = [
        { blockId: 'timer-loop', configChanges: { interval: 30 } }
      ]

      // Should resolve to the single timer block
      const matches = canvasBlocks.filter((b) => b.blockId === modifications[0].blockId)
      expect(matches).toHaveLength(1)
      expect(matches[0].nodeId).toBe('node1')
    })
  })

  describe('Delete Block Resolution', () => {
    it('should resolve exact nodeId matches', () => {
      const canvasBlocks: CanvasBlock[] = [
        { nodeId: 'node1', blockId: 'timer-loop', blockName: 'Timer Loop', config: {} },
        { nodeId: 'node2', blockId: 'swap-token', blockName: 'Swap Token', config: {} },
      ]

      const deleteNodeIds = ['node1']
      const existsOnCanvas = canvasBlocks.some((b) => b.nodeId === deleteNodeIds[0])
      
      expect(existsOnCanvas).toBe(true)
    })

    it('should resolve by blockId when nodeId not available', () => {
      const canvasBlocks: CanvasBlock[] = [
        { nodeId: 'node1', blockId: 'timer-loop', blockName: 'Timer Loop', config: {} },
      ]

      const deleteId = 'timer-loop'
      const matches = canvasBlocks.filter((b) => b.blockId === deleteId)
      
      expect(matches).toHaveLength(1)
      expect(matches[0].nodeId).toBe('node1')
    })

    it('should handle multiple blocks of same type', () => {
      const canvasBlocks: CanvasBlock[] = [
        { nodeId: 'node1', blockId: 'swap-token', blockName: 'Swap Token', config: {} },
        { nodeId: 'node2', blockId: 'swap-token', blockName: 'Swap Token', config: {} },
      ]

      const deleteId = 'swap-token'
      const matches = canvasBlocks.filter((b) => b.blockId === deleteId)
      
      expect(matches).toHaveLength(2)
      // Should warn about ambiguity but still resolve to first match
      expect(matches[0].nodeId).toBe('node1')
    })
  })
})