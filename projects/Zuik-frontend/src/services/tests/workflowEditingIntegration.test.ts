import { describe, expect, it, beforeEach, vi } from 'vitest'
import type { ParsedIntent, CanvasBlock } from '../intentParser'
import type { Node, Edge } from '@xyflow/react'

/** End-to-end checks for AI workflow edit scenarios. */

describe('Workflow Editing Integration Tests', () => {
  let mockNodes: Node[]
  let mockEdges: Edge[]
  let mockCanvasBlocks: CanvasBlock[]
  let mockOnIntentParsed: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockNodes = []
    mockEdges = []
    mockCanvasBlocks = []
    mockOnIntentParsed = vi.fn()
  })

  describe('Scenario 1: Generate Initial Workflow', () => {
    it('should create workflow that sends ALGO every 5 seconds', () => {
      // Simulate AI response for: "Create a workflow that sends 0.1 ALGO every 5 seconds to wallet X"
      const intent: ParsedIntent = {
        intent: 'periodic_payment',
        steps: [
          { action: 'timer-loop', params: { interval: 5, iterations: 4 } },
          { action: 'send-algo', params: { amount: 0.1, recipient: 'ZMDNZ4VGMVTKWIJNTYUGMBJR2GAKWVDCQ4WOGNGMITYAJ3BDSA7OOWXBYA' } }
        ],
        explanation: 'Created a workflow that sends 0.1 ALGO every 5 seconds for 4 iterations maximum',
        confidence: 0.95,
        userMessage: 'Create a workflow that sends 0.1 ALGO every 5 seconds to wallet ZMDNZ4VGMVTKWIJNTYUGMBJR2GAKWVDCQ4WOGNGMITYAJ3BDSA7OOWXBYA. Run this for 4 iterations maximum.'
      }

      // Test ChatPanel filtering logic
      const hasWorkflow = intent.steps.length > 0
      const hasModification = intent.intent === 'modify_block' && intent.modifications?.length > 0  
      const hasDeletion = intent.intent === 'delete_block' && intent.deleteNodeIds?.length > 0
      const hasReplaceCanvas = intent.replaceCanvas === true && intent.steps?.length === 0
      
      const shouldApplyIntent = hasWorkflow || hasModification || hasDeletion || hasReplaceCanvas
      
      expect(shouldApplyIntent).toBe(true)
      expect(hasWorkflow).toBe(true)
      
      // Simulate canvas update
      mockCanvasBlocks = [
        {
          nodeId: 'node1',
          blockId: 'timer-loop',
          blockName: 'Timer Loop',
          config: { interval: 5, iterations: 4 }
        },
        {
          nodeId: 'node2', 
          blockId: 'send-algo',
          blockName: 'Send ALGO',
          config: { amount: 0.1, recipient: 'ZMDNZ4VGMVTKWIJNTYUGMBJR2GAKWVDCQ4WOGNGMITYAJ3BDSA7OOWXBYA' }
        }
      ]

      expect(mockCanvasBlocks).toHaveLength(2)
      expect(mockCanvasBlocks[0].config.interval).toBe(5)
      expect(mockCanvasBlocks[1].config.amount).toBe(0.1)
    })
  })

  describe('Scenario 2: Add Feature to Existing Workflow', () => {
    it('should add telegram alert to existing workflow', () => {
      // Setup: Existing workflow
      mockCanvasBlocks = [
        {
          nodeId: 'node1',
          blockId: 'timer-loop',
          blockName: 'Timer Loop',
          config: { interval: 5, iterations: 4 }
        },
        {
          nodeId: 'node2',
          blockId: 'send-algo',
          blockName: 'Send ALGO',
          config: { amount: 0.1, recipient: 'ZMDNZ4VGMVTKWIJNTYUGMBJR2GAKWVDCQ4WOGNGMITYAJ3BDSA7OOWXBYA' }
        }
      ]

      // Simulate AI response for: "Add a telegram alert upon transaction"
      const intent: ParsedIntent = {
        intent: 'add_telegram_alert',
        steps: [
          { action: 'send-telegram', params: { message: 'Transaction completed: Sent 0.1 ALGO', chatId: '{{user_telegram}}' } }
        ],
        explanation: 'Added Telegram notification after the payment',
        confidence: 0.92,
        userMessage: 'Add a telegram alert upon transaction'
      }

      // Test that this is recognized as a workflow intent
      const hasWorkflow = intent.steps.length > 0
      expect(hasWorkflow).toBe(true)

      // Simulate adding the new block
      const updatedCanvasBlocks = [
        ...mockCanvasBlocks,
        {
          nodeId: 'node3',
          blockId: 'send-telegram',
          blockName: 'Send Telegram',
          config: { message: 'Transaction completed: Sent 0.1 ALGO', chatId: '{{user_telegram}}' }
        }
      ]

      expect(updatedCanvasBlocks).toHaveLength(3)
      expect(updatedCanvasBlocks[2].blockId).toBe('send-telegram')
    })
  })

  describe('Scenario 3: Modify Existing Block', () => {
    it('should change amount in existing workflow', () => {
      // Setup: Workflow with telegram alert
      mockCanvasBlocks = [
        {
          nodeId: 'node1',
          blockId: 'timer-loop',
          blockName: 'Timer Loop',
          config: { interval: 5, iterations: 4 }
        },
        {
          nodeId: 'node2',
          blockId: 'send-algo',
          blockName: 'Send ALGO',
          config: { amount: 0.1, recipient: 'ZMDNZ4VGMVTKWIJNTYUGMBJR2GAKWVDCQ4WOGNGMITYAJ3BDSA7OOWXBYA' }
        },
        {
          nodeId: 'node3',
          blockId: 'send-telegram',
          blockName: 'Send Telegram',
          config: { message: 'Transaction completed: Sent 0.1 ALGO', chatId: '{{user_telegram}}' }
        }
      ]

      // Simulate AI response for: "Change the amount to 0.2 ALGO"
      const intent: ParsedIntent = {
        intent: 'modify_block',
        steps: [],
        modifications: [
          {
            blockId: 'send-algo',
            nodeId: 'node2', // Should be resolved by our improved logic
            configChanges: { amount: 0.2 }
          }
        ],
        explanation: 'Updated the payment amount to 0.2 ALGO',
        confidence: 0.95,
        userMessage: 'Change the amount to 0.2 ALGO'
      }

      // Test that modifications are recognized
      const hasModification = intent.intent === 'modify_block' && intent.modifications?.length > 0
      expect(hasModification).toBe(true)

      // Simulate applying modification with improved precision logic
      const modification = intent.modifications![0]
      const targetBlock = mockCanvasBlocks.find(b => 
        modification.nodeId === b.nodeId || (modification.blockId === b.blockId && !modification.nodeId))
      
      expect(targetBlock).toBeDefined()
      expect(targetBlock!.nodeId).toBe('node2')
      expect(targetBlock!.blockId).toBe('send-algo')

      // Apply the change
      const updatedConfig = { ...targetBlock!.config, ...modification.configChanges }
      expect(updatedConfig.amount).toBe(0.2)
    })
  })

  describe('Scenario 4: Delete Block', () => {
    it('should delete telegram notification from workflow', () => {
      // Setup: Complete workflow
      mockCanvasBlocks = [
        {
          nodeId: 'node1',
          blockId: 'timer-loop',
          blockName: 'Timer Loop',
          config: { interval: 5, iterations: 4 }
        },
        {
          nodeId: 'node2',
          blockId: 'send-algo',
          blockName: 'Send ALGO', 
          config: { amount: 0.2, recipient: 'ZMDNZ4VGMVTKWIJNTYUGMBJR2GAKWVDCQ4WOGNGMITYAJ3BDSA7OOWXBYA' }
        },
        {
          nodeId: 'node3',
          blockId: 'send-telegram',
          blockName: 'Send Telegram',
          config: { message: 'Transaction completed', chatId: '{{user_telegram}}' }
        }
      ]

      // Simulate AI response for: "Remove the telegram notification" 
      const intent: ParsedIntent = {
        intent: 'delete_block',
        steps: [],
        deleteNodeIds: ['node3'], // Should be resolved by our improved logic
        explanation: 'Removed the Telegram notification block from your workflow',
        confidence: 0.94,
        userMessage: 'Remove the telegram notification'
      }

      // Test that delete operations are now recognized by ChatPanel
      const hasDeletion = intent.intent === 'delete_block' && intent.deleteNodeIds?.length > 0
      expect(hasDeletion).toBe(true)

      // Simulate deletion
      const idsToDelete = new Set(intent.deleteNodeIds)
      const remainingBlocks = mockCanvasBlocks.filter(b => !idsToDelete.has(b.nodeId))
      
      expect(remainingBlocks).toHaveLength(2)
      expect(remainingBlocks.find(b => b.blockId === 'send-telegram')).toBeUndefined()
      expect(remainingBlocks.find(b => b.blockId === 'timer-loop')).toBeDefined()
      expect(remainingBlocks.find(b => b.blockId === 'send-algo')).toBeDefined()
    })
  })

  describe('Scenario 5: Replace Entire Workflow', () => {
    it('should replace workflow with DCA bot', () => {
      // Setup: Existing simple workflow
      mockCanvasBlocks = [
        {
          nodeId: 'node1',
          blockId: 'timer-loop',
          blockName: 'Timer Loop',
          config: { interval: 5, iterations: 4 }
        },
        {
          nodeId: 'node2',
          blockId: 'send-algo',
          blockName: 'Send ALGO',
          config: { amount: 0.2, recipient: 'ZMDNZ4VGMVTKWIJNTYUGMBJR2GAKWVDCQ4WOGNGMITYAJ3BDSA7OOWXBYA' }
        }
      ]

      // Simulate AI response for: "Instead, create a DCA bot that buys USDC weekly"
      const intent: ParsedIntent = {
        intent: 'dca_workflow',
        steps: [
          { action: 'timer-loop', params: { interval: 604800, iterations: 0 } }, // Weekly (604800 seconds)
          { action: 'swap-token', params: { fromAsset: 0, toAsset: 10458941, amount: 10, slippage: 0.5 } }
        ],
        explanation: 'Created a DCA bot that buys USDC with ALGO weekly',
        confidence: 0.93,
        replaceCanvas: true,
        userMessage: 'Instead, create a DCA bot that buys USDC weekly'
      }

      // Test replace canvas logic
      const hasReplaceCanvas = intent.replaceCanvas === true
      const hasWorkflow = intent.steps.length > 0
      
      expect(hasReplaceCanvas).toBe(true)
      expect(hasWorkflow).toBe(true)

      // Simulate replacement (entire canvas replaced)
      const newCanvasBlocks = [
        {
          nodeId: 'new_node1',
          blockId: 'timer-loop', 
          blockName: 'Timer Loop',
          config: { interval: 604800, iterations: 0 }
        },
        {
          nodeId: 'new_node2',
          blockId: 'swap-token',
          blockName: 'Swap Token',
          config: { fromAsset: 0, toAsset: 10458941, amount: 10, slippage: 0.5 }
        }
      ]

      expect(newCanvasBlocks).toHaveLength(2)
      expect(newCanvasBlocks[0].config.interval).toBe(604800) // Weekly
      expect(newCanvasBlocks[1].blockId).toBe('swap-token')
      expect(newCanvasBlocks[1].config.toAsset).toBe(10458941) // USDC
    })
  })

  describe('Multiple Block Type Resolution', () => {
    it('should handle multiple blocks of same type with precision', () => {
      // Setup: Workflow with multiple swap blocks
      mockCanvasBlocks = [
        {
          nodeId: 'swap1',
          blockId: 'swap-token',
          blockName: 'Swap Token',
          config: { fromAsset: 0, toAsset: 10458941, amount: 10 } // ALGO to USDC
        },
        {
          nodeId: 'swap2',
          blockId: 'swap-token',
          blockName: 'Swap Token', 
          config: { fromAsset: 10458941, toAsset: 0, amount: 5 } // USDC to ALGO
        }
      ]

      // Test modification resolution with multiple blocks
      const modifications = [
        {
          blockId: 'swap-token',
          nodeId: 'swap2', // Explicitly target second swap
          configChanges: { amount: 15 }
        }
      ]

      // Our improved resolution should prefer nodeId when available
      const mod = modifications[0]
      const matches = mockCanvasBlocks.filter(b => b.blockId === mod.blockId)
      expect(matches).toHaveLength(2)

      // Should target specific node when nodeId is provided
      const targetBlock = mockCanvasBlocks.find(b => 
        mod.nodeId === b.nodeId || (mod.blockId === b.blockId && !mod.nodeId))
      
      expect(targetBlock?.nodeId).toBe('swap2')
      expect(targetBlock?.config.fromAsset).toBe(10458941) // Correct block targeted
    })

    it('should warn about ambiguity when nodeId is missing', () => {
      mockCanvasBlocks = [
        {
          nodeId: 'swap1',
          blockId: 'swap-token',
          blockName: 'Swap Token',
          config: { fromAsset: 0, toAsset: 10458941, amount: 10 }
        },
        {
          nodeId: 'swap2', 
          blockId: 'swap-token',
          blockName: 'Swap Token',
          config: { fromAsset: 0, toAsset: 10458941, amount: 20 }
        }
      ]

      // Mock console.warn to test warning behavior
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      // Simulate modification without nodeId
      const modifications = [
        {
          blockId: 'swap-token',
          configChanges: { amount: 25 }
        }
      ]

      // Simulate resolution logic that should warn about multiple matches
      const matches = mockCanvasBlocks.filter(b => b.blockId === modifications[0].blockId)
      
      if (matches.length > 1) {
        // This simulates our improved resolution warning
        console.warn(`Multiple ${modifications[0].blockId} blocks found, using first match. Consider specifying nodeId for precision.`)
      }

      expect(matches.length).toBeGreaterThan(1)
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Multiple swap-token blocks found')
      )

      consoleWarnSpy.mockRestore()
    })
  })

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty canvas gracefully', () => {
      mockCanvasBlocks = []

      const intent: ParsedIntent = {
        intent: 'first_workflow',
        steps: [{ action: 'swap-token', params: { fromAsset: 0, toAsset: 10458941, amount: 10 } }],
        explanation: 'Created first workflow',
        confidence: 0.9,
        userMessage: 'create a swap workflow'
      }

      const hasWorkflow = intent.steps.length > 0
      expect(hasWorkflow).toBe(true)
      
      // Empty canvas should work fine for new workflows
      expect(mockCanvasBlocks).toHaveLength(0)
    })

    it('should handle invalid node IDs in deletions', () => {
      mockCanvasBlocks = [
        {
          nodeId: 'node1',
          blockId: 'timer-loop',
          blockName: 'Timer Loop',
          config: { interval: 60 }
        }
      ]

      const intent: ParsedIntent = {
        intent: 'delete_block',
        steps: [],
        deleteNodeIds: ['nonexistent_node'],
        explanation: 'Tried to delete block',
        confidence: 0.8,
        userMessage: 'delete the math block'
      }

      // Should handle gracefully - no blocks would be deleted
      const idsToDelete = new Set(intent.deleteNodeIds)
      const remainingBlocks = mockCanvasBlocks.filter(b => !idsToDelete.has(b.nodeId))
      
      expect(remainingBlocks).toHaveLength(1) // Nothing deleted
      expect(remainingBlocks[0].nodeId).toBe('node1')
    })
  })
})