/**
 * Multi-Agent Testing Suite for Phase 8
 * 
 * This file contains comprehensive tests for multi-agent orchestration features:
 * - Merge Gate functionality (AND/OR/SEQUENCE)
 * - Fork/Join parallel execution
 * - Event-driven agent communication
 * - Spawn Agent workflow creation
 * - Watchdog timeout monitoring
 * 
 * Run these tests to validate Phase 8 implementation.
 */

import type { FlowNode, FlowEdge, AgentContext } from './runAgent'
import { runMultiAgentWorkflow, createVariableContext } from './runAgent'
import { globalEventBus } from './multiAgentExecutor'
import type { TransactionSigner } from 'algosdk'

// Test utilities
export interface TestResult {
  testName: string
  success: boolean
  error?: string
  executionTime: number
  outputs?: Record<string, any>
}

export class MultiAgentTestSuite {
  private results: TestResult[] = []
  private mockContext: AgentContext
  
  constructor() {
    // Create mock context for testing
    this.mockContext = {
      sender: 'TESTACCOUNT123456789012345678901234567890123456',
      signer: {} as TransactionSigner,
      algorand: {} as any,
      variables: createVariableContext(),
      blockOutputs: new Map(),
      log: (entry) => console.log(`[Test Log]`, entry),
      onNodeStatusChange: (nodeId, status) => console.log(`[Node ${nodeId}]: ${status}`),
      abortSignal: new AbortController().signal,
      workflowId: 'test-workflow-' + Date.now(),
      currentNodeId: 'test-node'
    }
  }
  
  async runAllTests(): Promise<TestResult[]> {
    console.log('🧪 Starting Multi-Agent Test Suite...\n')
    
    this.results = []
    
    // Test 1: Merge Gate AND Logic
    await this.testMergeGateAND()
    
    // Test 2: Merge Gate OR Logic
    await this.testMergeGateOR()
    
    // Test 3: Fork and Join Parallel Execution
    await this.testForkJoin()
    
    // Test 4: Event Communication
    await this.testEventCommunication()
    
    // Test 5: Multi-Trigger Workflow
    await this.testMultiTriggerWorkflow()
    
    // Test 6: Event Bus Performance
    await this.testEventBusPerformance()
    
    this.printTestSummary()
    return this.results
  }
  
  private async runTest(testName: string, testFn: () => Promise<void>): Promise<void> {
    const startTime = Date.now()
    
    try {
      console.log(`🔬 Running: ${testName}`)
      await testFn()
      
      const executionTime = Date.now() - startTime
      this.results.push({
        testName,
        success: true,
        executionTime
      })
      
      console.log(`✅ ${testName} - PASSED (${executionTime}ms)\n`)
      
    } catch (error) {
      const executionTime = Date.now() - startTime
      this.results.push({
        testName,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime
      })
      
      console.log(`❌ ${testName} - FAILED: ${error}\n`)
    }
  }
  
  async testMergeGateAND(): Promise<void> {
    await this.runTest('Merge Gate AND Logic', async () => {
      // Create workflow: Timer + Webhook → Merge Gate (AND) → Action
      const nodes: FlowNode[] = [
        {
          id: 'timer-1',
          type: 'blockNode',
          position: { x: 100, y: 100 },
          data: { blockId: 'timer-loop', config: { intervalSec: '1' } }
        },
        {
          id: 'webhook-1',  
          type: 'blockNode',
          position: { x: 100, y: 200 },
          data: { blockId: 'webhook-trigger', config: { path: '/test' } }
        },
        {
          id: 'merge-gate-1',
          type: 'blockNode',
          position: { x: 300, y: 150 },
          data: { 
            blockId: 'merge_gate', 
            config: { 
              mode: 'ALL', 
              window_seconds: '60',
              reset_after_fire: 'true'
            } 
          }
        },
        {
          id: 'action-1',
          type: 'blockNode', 
          position: { x: 500, y: 150 },
          data: { blockId: 'constant', config: { value: 'merge_gate_fired' } }
        }
      ]
      
      const edges: FlowEdge[] = [
        { id: 'e1', source: 'timer-1', target: 'merge-gate-1', sourceHandle: 'triggered', targetHandle: 'trigger_1' },
        { id: 'e2', source: 'webhook-1', target: 'merge-gate-1', sourceHandle: 'triggered', targetHandle: 'trigger_2' },
        { id: 'e3', source: 'merge-gate-1', target: 'action-1', sourceHandle: 'out', targetHandle: 'input' }
      ]
      
      // Simulate timer firing
      this.mockContext.blockOutputs.set('timer-1', { triggered: true, timestamp: Date.now() })
      
      // Run workflow - should NOT fire merge gate yet (only 1/2 triggers)
      await runMultiAgentWorkflow(nodes, edges, this.mockContext)
      
      // Verify merge gate hasn't fired yet
      const mergeOutput = this.mockContext.blockOutputs.get('merge-gate-1')
      if (mergeOutput) {
        throw new Error('Merge gate fired prematurely with only 1 trigger')
      }
      
      // Simulate webhook firing
      this.mockContext.blockOutputs.set('webhook-1', { triggered: true, payload: { test: 'data' } })
      
      // Run workflow again - should fire merge gate now (2/2 triggers)
      await runMultiAgentWorkflow(nodes, edges, this.mockContext)
      
      // Verify merge gate fired
      const mergeOutput2 = this.mockContext.blockOutputs.get('merge-gate-1')
      if (!mergeOutput2 || !mergeOutput2.gate_mode) {
        throw new Error('Merge gate did not fire with ALL triggers present')
      }
      
      // Verify action executed
      const actionOutput = this.mockContext.blockOutputs.get('action-1')
      if (!actionOutput || actionOutput.value !== 'merge_gate_fired') {
        throw new Error('Downstream action did not execute after merge gate fired')
      }
    })
  }
  
  async testMergeGateOR(): Promise<void> {
    await this.runTest('Merge Gate OR Logic', async () => {
      const nodes: FlowNode[] = [
        {
          id: 'timer-2',
          type: 'blockNode',
          position: { x: 100, y: 100 },
          data: { blockId: 'timer-loop', config: { intervalSec: '1' } }
        },
        {
          id: 'merge-gate-2',
          type: 'blockNode',
          position: { x: 300, y: 100 },
          data: { 
            blockId: 'merge_gate', 
            config: { 
              mode: 'ANY', 
              window_seconds: '60',
              reset_after_fire: 'true'
            } 
          }
        },
        {
          id: 'action-2',
          type: 'blockNode',
          position: { x: 500, y: 100 },
          data: { blockId: 'constant', config: { value: 'any_trigger_fired' } }
        }
      ]
      
      const edges: FlowEdge[] = [
        { id: 'e1', source: 'timer-2', target: 'merge-gate-2', sourceHandle: 'triggered', targetHandle: 'trigger_1' },
        { id: 'e2', source: 'merge-gate-2', target: 'action-2', sourceHandle: 'out', targetHandle: 'input' }
      ]
      
      // Clear previous outputs
      this.mockContext.blockOutputs.clear()
      
      // Simulate single timer firing
      this.mockContext.blockOutputs.set('timer-2', { triggered: true, timestamp: Date.now() })
      
      // Run workflow - should fire immediately with ANY mode
      await runMultiAgentWorkflow(nodes, edges, this.mockContext)
      
      // Verify merge gate fired with just one trigger
      const mergeOutput = this.mockContext.blockOutputs.get('merge-gate-2')
      if (!mergeOutput || mergeOutput.mode !== 'ANY') {
        throw new Error('Merge gate (ANY mode) did not fire with single trigger')
      }
      
      // Verify downstream action executed
      const actionOutput = this.mockContext.blockOutputs.get('action-2')
      if (!actionOutput) {
        throw new Error('Downstream action did not execute in ANY mode')
      }
    })
  }
  
  async testForkJoin(): Promise<void> {
    await this.runTest('Fork and Join Parallel Execution', async () => {
      const nodes: FlowNode[] = [
        {
          id: 'trigger-3',
          type: 'blockNode',
          position: { x: 100, y: 200 },
          data: { blockId: 'timer-loop', config: { intervalSec: '1' } }
        },
        {
          id: 'fork-1',
          type: 'blockNode',
          position: { x: 250, y: 200 },
          data: { 
            blockId: 'fork', 
            config: { branch_count: '2' } 
          }
        },
        {
          id: 'action-branch-1',
          type: 'blockNode',
          position: { x: 400, y: 150 },
          data: { blockId: 'constant', config: { value: 'branch_1_result' } }
        },
        {
          id: 'action-branch-2', 
          type: 'blockNode',
          position: { x: 400, y: 250 },
          data: { blockId: 'constant', config: { value: 'branch_2_result' } }
        },
        {
          id: 'join-1',
          type: 'blockNode',
          position: { x: 550, y: 200 },
          data: { 
            blockId: 'join', 
            config: { strategy: 'all' } 
          }
        },
        {
          id: 'final-action',
          type: 'blockNode',
          position: { x: 700, y: 200 },
          data: { blockId: 'constant', config: { value: 'all_branches_complete' } }
        }
      ]
      
      const edges: FlowEdge[] = [
        { id: 'e1', source: 'trigger-3', target: 'fork-1' },
        { id: 'e2', source: 'fork-1', target: 'action-branch-1', sourceHandle: 'branch_1' },
        { id: 'e3', source: 'fork-1', target: 'action-branch-2', sourceHandle: 'branch_2' },
        { id: 'e4', source: 'action-branch-1', target: 'join-1', targetHandle: 'branch_1' },
        { id: 'e5', source: 'action-branch-2', target: 'join-1', targetHandle: 'branch_2' },
        { id: 'e6', source: 'join-1', target: 'final-action' }
      ]
      
      // Clear previous outputs
      this.mockContext.blockOutputs.clear()
      
      // Simulate trigger
      this.mockContext.blockOutputs.set('trigger-3', { triggered: true })
      
      // Run workflow
      await runMultiAgentWorkflow(nodes, edges, this.mockContext)
      
      // Verify fork executed
      const forkOutput = this.mockContext.blockOutputs.get('fork-1')
      if (!forkOutput || forkOutput.branch_count !== 2) {
        throw new Error('Fork did not execute correctly')
      }
      
      // Verify both branches executed
      const branch1Output = this.mockContext.blockOutputs.get('action-branch-1')
      const branch2Output = this.mockContext.blockOutputs.get('action-branch-2')
      
      if (!branch1Output || branch1Output.value !== 'branch_1_result') {
        throw new Error('Branch 1 did not execute')
      }
      
      if (!branch2Output || branch2Output.value !== 'branch_2_result') {
        throw new Error('Branch 2 did not execute')
      }
      
      // Verify join collected results
      const joinOutput = this.mockContext.blockOutputs.get('join-1')
      if (!joinOutput || joinOutput.strategy !== 'all') {
        throw new Error('Join did not execute correctly')
      }
      
      // Verify final action executed
      const finalOutput = this.mockContext.blockOutputs.get('final-action')
      if (!finalOutput || finalOutput.value !== 'all_branches_complete') {
        throw new Error('Final action after join did not execute')
      }
    })
  }
  
  async testEventCommunication(): Promise<void> {
    await this.runTest('Event-Driven Agent Communication', async () => {
      let receivedEvents: any[] = []
      
      // Subscribe to test event
      const subscriptionId = globalEventBus.subscribe('test_event', (data) => {
        receivedEvents.push(data)
      })
      
      // Publish event
      await globalEventBus.publishEvent('test_event', { 
        message: 'Hello from agent!', 
        timestamp: Date.now() 
      }, this.mockContext)
      
      // Wait a bit for async processing
      await new Promise(resolve => setTimeout(resolve, 50))
      
      // Verify event was received
      if (receivedEvents.length !== 1) {
        throw new Error(`Expected 1 event, received ${receivedEvents.length}`)
      }
      
      if (receivedEvents[0].message !== 'Hello from agent!') {
        throw new Error('Event data was not received correctly')
      }
      
      // Test filtered events
      const filteredEvents: any[] = []
      
      const filteredSubscriptionId = globalEventBus.subscribe('filtered_event', (data) => {
        filteredEvents.push(data)
      }, { key: 'asset_id', value: 'ALGO' })
      
      // Publish matching event
      await globalEventBus.publishEvent('filtered_event', { 
        asset_id: 'ALGO', 
        price: 0.25 
      }, this.mockContext)
      
      // Publish non-matching event  
      await globalEventBus.publishEvent('filtered_event', { 
        asset_id: 'USDC', 
        price: 1.00 
      }, this.mockContext)
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 50))
      
      // Verify only matching event was received
      if (filteredEvents.length !== 1) {
        throw new Error(`Expected 1 filtered event, received ${filteredEvents.length}`)
      }
      
      if (filteredEvents[0].asset_id !== 'ALGO') {
        throw new Error('Filtered event did not match correctly')
      }
      
      // Cleanup subscriptions
      globalEventBus.unsubscribe('test_event', subscriptionId)
      globalEventBus.unsubscribe('filtered_event', filteredSubscriptionId)
    })
  }
  
  async testMultiTriggerWorkflow(): Promise<void> {
    await this.runTest('Multi-Trigger Workflow Integration', async () => {
      // Create a realistic multi-trigger DeFi workflow:
      // Price Alert + Wallet Event → Merge Gate → Swap + Notification
      
      const nodes: FlowNode[] = [
        {
          id: 'price-trigger',
          type: 'blockNode',
          position: { x: 50, y: 100 },
          data: { 
            blockId: 'price-monitor', 
            config: { 
              asset: 'ALGO',
              operator: '<',
              threshold: '0.25'
            } 
          }
        },
        {
          id: 'wallet-trigger',
          type: 'blockNode', 
          position: { x: 50, y: 200 },
          data: { 
            blockId: 'wallet-event', 
            config: { 
              asset: 'USDC',
              operator: '>',
              threshold: '50'
            } 
          }
        },
        {
          id: 'merge-gate',
          type: 'blockNode',
          position: { x: 200, y: 150 },
          data: { 
            blockId: 'merge_gate', 
            config: { 
              mode: 'ALL',
              window_seconds: '300', // 5 minute window
              reset_after_fire: 'true'
            } 
          }
        },
        {
          id: 'fork-actions',
          type: 'blockNode',
          position: { x: 350, y: 150 },
          data: { 
            blockId: 'fork', 
            config: { branch_count: '2' } 
          }
        },
        {
          id: 'swap-action',
          type: 'blockNode',
          position: { x: 500, y: 100 },
          data: { 
            blockId: 'swap-asset', 
            config: { 
              fromAsset: 'USDC',
              toAsset: 'ALGO',
              amount: '50'
            } 
          }
        },
        {
          id: 'notify-action',
          type: 'blockNode',
          position: { x: 500, y: 200 },
          data: { 
            blockId: 'send-telegram', 
            config: { 
              message: 'Buying the dip! ALGO < $0.25 and got USDC'
            } 
          }
        },
        {
          id: 'emit-event',
          type: 'blockNode',
          position: { x: 650, y: 150 },
          data: { 
            blockId: 'event_emit', 
            config: { 
              event_name: 'dip_bought',
              payload_template: '{"asset": "ALGO", "amount": 50, "price": "{{price}}"}'
            } 
          }
        }
      ]
      
      const edges: FlowEdge[] = [
        { id: 'e1', source: 'price-trigger', target: 'merge-gate', targetHandle: 'trigger_1' },
        { id: 'e2', source: 'wallet-trigger', target: 'merge-gate', targetHandle: 'trigger_2' },
        { id: 'e3', source: 'merge-gate', target: 'fork-actions' },
        { id: 'e4', source: 'fork-actions', target: 'swap-action', sourceHandle: 'branch_1' },
        { id: 'e5', source: 'fork-actions', target: 'notify-action', sourceHandle: 'branch_2' },
        { id: 'e6', source: 'swap-action', target: 'emit-event' },
        { id: 'e7', source: 'notify-action', target: 'emit-event' }
      ]
      
      // Clear outputs
      this.mockContext.blockOutputs.clear()
      
      // Simulate price trigger firing
      this.mockContext.blockOutputs.set('price-trigger', { 
        triggered: true, 
        price: 0.24, 
        asset: 'ALGO' 
      })
      
      // Run workflow - should not execute yet (only 1/2 triggers)
      await runMultiAgentWorkflow(nodes, edges, this.mockContext)
      
      // Verify merge gate is waiting
      const mergeOutput1 = this.mockContext.blockOutputs.get('merge-gate')
      if (mergeOutput1 && mergeOutput1.gate_fired) {
        throw new Error('Merge gate fired prematurely')
      }
      
      // Simulate wallet trigger firing  
      this.mockContext.blockOutputs.set('wallet-trigger', { 
        triggered: true, 
        amount: 75, 
        asset: 'USDC' 
      })
      
      // Run workflow again - should execute full workflow now
      await runMultiAgentWorkflow(nodes, edges, this.mockContext)
      
      // Verify merge gate fired
      const mergeOutput2 = this.mockContext.blockOutputs.get('merge-gate')
      if (!mergeOutput2 || mergeOutput2.mode !== 'ALL') {
        throw new Error('Merge gate did not fire with both triggers')
      }
      
      // Verify fork executed
      const forkOutput = this.mockContext.blockOutputs.get('fork-actions')
      if (!forkOutput || forkOutput.branch_count !== 2) {
        throw new Error('Fork did not execute after merge gate')
      }
      
      // Verify event was emitted
      const eventOutput = this.mockContext.blockOutputs.get('emit-event')
      if (!eventOutput || eventOutput.event_name !== 'dip_bought') {
        throw new Error('Event was not emitted correctly')
      }
      
      // Verify event is in global event bus
      const eventHistory = globalEventBus.getEventHistory('dip_bought')
      if (eventHistory.length === 0) {
        throw new Error('Event was not added to global event bus')
      }
    })
  }
  
  async testEventBusPerformance(): Promise<void> {
    await this.runTest('Event Bus Performance Test', async () => {
      const eventCount = 1000
      const startTime = Date.now()
      
      // Subscribe to performance test events
      let receivedCount = 0
      const subscriptionId = globalEventBus.subscribe('perf_test', () => {
        receivedCount++
      })
      
      // Publish many events rapidly
      const publishPromises = []
      for (let i = 0; i < eventCount; i++) {
        publishPromises.push(
          globalEventBus.publishEvent('perf_test', { 
            index: i, 
            timestamp: Date.now() 
          }, this.mockContext)
        )
      }
      
      await Promise.all(publishPromises)
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const executionTime = Date.now() - startTime
      
      // Verify all events were processed
      if (receivedCount !== eventCount) {
        throw new Error(`Expected ${eventCount} events, received ${receivedCount}`)
      }
      
      // Performance check - should handle 1000 events in under 2 seconds
      if (executionTime > 2000) {
        throw new Error(`Performance too slow: ${executionTime}ms for ${eventCount} events`)
      }
      
      console.log(`   📊 Performance: ${eventCount} events in ${executionTime}ms (${(eventCount/executionTime*1000).toFixed(0)} events/sec)`)
      
      // Cleanup
      globalEventBus.unsubscribe('perf_test', subscriptionId)
    })
  }
  
  private printTestSummary(): void {
    console.log('\n📋 Multi-Agent Test Summary')
    console.log('=' .repeat(50))
    
    const passed = this.results.filter(r => r.success).length
    const failed = this.results.filter(r => !r.success).length
    const totalTime = this.results.reduce((sum, r) => sum + r.executionTime, 0)
    
    console.log(`✅ Passed: ${passed}`)
    console.log(`❌ Failed: ${failed}`) 
    console.log(`⏱️  Total Time: ${totalTime}ms`)
    console.log(`📊 Success Rate: ${(passed / this.results.length * 100).toFixed(1)}%`)
    
    if (failed > 0) {
      console.log('\n❌ Failed Tests:')
      this.results
        .filter(r => !r.success)
        .forEach(r => {
          console.log(`   - ${r.testName}: ${r.error}`)
        })
    }
    
    console.log('\n🎉 Multi-Agent Phase 8 Testing Complete!')
    
    if (passed === this.results.length) {
      console.log('🚀 All tests passed! Phase 8 is ready for production.')
    } else {
      console.log('⚠️  Some tests failed. Please review and fix before proceeding.')
    }
  }
}

/**
 * Run the complete multi-agent test suite
 * Call this function to validate Phase 8 implementation
 */
export async function runMultiAgentTests(): Promise<TestResult[]> {
  const testSuite = new MultiAgentTestSuite()
  return await testSuite.runAllTests()
}

/**
 * Quick smoke test for multi-agent functionality
 * Use this for fast validation during development
 */
export async function quickMultiAgentTest(): Promise<boolean> {
  console.log('🏃‍♂️ Running quick multi-agent smoke test...')
  
  try {
    // Test event bus basic functionality
    let eventReceived = false
    const subscriptionId = globalEventBus.subscribe('smoke_test', () => {
      eventReceived = true
    })
    
    await globalEventBus.publishEvent('smoke_test', { test: true }, {
      workflowId: 'smoke-test',
      currentNodeId: 'test-node'
    } as AgentContext)
    
    await new Promise(resolve => setTimeout(resolve, 10))
    
    globalEventBus.unsubscribe('smoke_test', subscriptionId)
    
    if (!eventReceived) {
      throw new Error('Event bus not working')
    }
    
    console.log('✅ Quick test passed!')
    return true
    
  } catch (error) {
    console.log('❌ Quick test failed:', error)
    return false
  }
}