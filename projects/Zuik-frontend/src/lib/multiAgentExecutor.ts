import { getBlockById } from './blockRegistry'
import type { BlockDefinition } from './blockRegistry'
import { allExecutors } from './executors'
import { insertAgentEvent, listRecentAgentEvents } from '../services/agentEvents'
import { getWorkflow, isSupabaseConfigured } from '../services/supabase'
import type { FlowNode, FlowEdge, AgentContext } from './runAgent'
import { resolveConfig, getUpstreamOutputs } from './runAgent'

// Multi-Agent specific interfaces
export interface AgentState {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout'
  result?: any
  error?: string
  startTime: number
  parentId?: string
}

export interface ExecutionBranch {
  id: string
  nodes: FlowNode[]
  edges: FlowEdge[]
  context: AgentContext
}

export interface MergeGateState {
  gateId: string
  workflowId: string
  firedInputs: string[]
  windowStart: number
  mode: 'ALL' | 'ANY' | 'SEQUENCE'
  windowSeconds: number
  resetAfterFire: boolean
}

// Event Bus for inter-agent communication
export class EventBus {
  private subscribers = new Map<string, Array<{
    id: string
    callback: (data: any) => void
    filter?: { key: string; value: any }
  }>>()
  
  private eventHistory = new Map<string, any[]>()
  
  async publishEvent(eventName: string, data: Record<string, unknown>, context: AgentContext): Promise<void> {
    const payload = { ...data, timestamp: Date.now() }

    const history = this.eventHistory.get(eventName) || []
    history.push(payload)
    this.eventHistory.set(eventName, history.slice(-100))

    const subscribers = this.subscribers.get(eventName) || []
    for (const sub of subscribers) {
      if (sub.filter) {
        const filterValue = data[sub.filter.key]
        if (filterValue !== sub.filter.value) continue
      }

      try {
        sub.callback(payload)
      } catch (error) {
        console.error(`[EventBus] Subscriber callback error:`, error)
      }
    }

    if (context.workflowId) {
      await insertAgentEvent({
        workflowId: context.workflowId,
        eventName,
        data: payload,
        parentWorkflowId: context.parentWorkflowId ?? null,
      })
    }
  }
  
  subscribe(
    eventName: string, 
    callback: (data: any) => void,
    filter?: { key: string; value: any }
  ): string {
    const id = crypto.randomUUID()
    const subscribers = this.subscribers.get(eventName) || []
    subscribers.push({ id, callback, filter })
    this.subscribers.set(eventName, subscribers)
    
    console.log(`[EventBus] New subscriber for ${eventName}:`, id)
    return id
  }
  
  unsubscribe(eventName: string, subscriptionId: string): void {
    const subscribers = this.subscribers.get(eventName) || []
    const filtered = subscribers.filter(sub => sub.id !== subscriptionId)
    this.subscribers.set(eventName, filtered)
  }
  
  getEventHistory(eventName: string): any[] {
    return this.eventHistory.get(eventName) || []
  }
}

// Global event bus instance
const globalEventBus = new EventBus()

// Enhanced execution engine with multi-agent support
export async function runMultiAgentFlow(
  nodes: FlowNode[],
  edges: FlowEdge[],
  context: AgentContext,
  startFromNodeId?: string
): Promise<void> {
  console.log('[MultiAgent] Starting multi-agent execution')
  
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const agentStates = new Map<string, AgentState>()
  const mergeGates = new Map<string, MergeGateState>()
  const runningAgents = new Map<string, Promise<any>>()
  
  // Find trigger nodes to start execution
  const triggerNodes = findTriggerNodes(nodes)
  const queue: string[] = [...triggerNodes.map(n => n.id)]
  
  if (startFromNodeId) {
    queue.length = 0
    queue.push(startFromNodeId)
  }
  
  // Main execution loop with BFS + parallel support
  while (queue.length > 0 || runningAgents.size > 0) {
    if (context.abortSignal.aborted) break
    
    // Process immediate nodes
    while (queue.length > 0) {
      const nodeId = queue.shift()!
      const node = nodeMap.get(nodeId)
      if (!node) continue
      
      const blockId = node.data.blockId
      const def = getBlockById(blockId)
      if (!def) continue
      
      try {
        await executeNodeEnhanced(node, def, context, edges, nodes, queue, agentStates, mergeGates, runningAgents)
      } catch (error) {
        console.error(`[MultiAgent] Error executing node ${nodeId}:`, error)
        context.onNodeStatusChange(nodeId, 'error')
      }
    }
    
    // Check completed agents and process join conditions
    for (const [agentId, promise] of Array.from(runningAgents.entries())) {
      if (await isPromiseResolved(promise)) {
        try {
          const result = await promise
          runningAgents.delete(agentId)
          
          // Update agent state
          const state = agentStates.get(agentId)
          if (state) {
            state.status = 'completed'
            state.result = result
          }
          
          // Check for join conditions that might now be satisfied
          await checkJoinConditions(agentId, result, nodes, edges, queue, agentStates)
          
        } catch (error) {
          console.error(`[MultiAgent] Agent ${agentId} failed:`, error)
          const state = agentStates.get(agentId)
          if (state) {
            state.status = 'failed'
            state.error = error instanceof Error ? error.message : String(error)
          }
        }
      }
    }
    
    // Small delay for async coordination
    if (runningAgents.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  
  console.log('[MultiAgent] Execution completed')
}

async function executeNodeEnhanced(
  node: FlowNode,
  def: BlockDefinition,
  context: AgentContext,
  edges: FlowEdge[],
  nodes: FlowNode[],
  queue: string[],
  agentStates: Map<string, AgentState>,
  mergeGates: Map<string, MergeGateState>,
  runningAgents: Map<string, Promise<any>>,
): Promise<void> {
  const nodeId = node.id
  const blockId = node.data.blockId
  const ctx: AgentContext = { ...context, currentNodeId: nodeId }

  ctx.onNodeStatusChange(nodeId, 'running')
  ctx.log({
    nodeId,
    blockId,
    blockName: def.name,
    type: 'start',
    message: 'Executing...',
  })

  switch (blockId) {
    case 'merge_gate':
      await processMergeGate(node, def, ctx, edges, queue, mergeGates)
      break

    case 'fork':
      await processFork(node, def, ctx, edges, nodes, queue, agentStates)
      break

    case 'join':
      await processJoin(node, def, ctx, edges, queue, agentStates)
      break

    case 'spawn_agent':
      await processSpawnAgent(node, def, ctx, edges, queue, agentStates, runningAgents)
      break

    case 'event_trigger':
      await processEventTrigger(node, def, ctx, edges, queue)
      break

    case 'event_emit':
      await processEventEmit(node, def, ctx, edges, queue)
      break

    case 'watchdog':
      await processWatchdog(node, def, ctx, edges, nodes, queue, agentStates, runningAgents)
      break

    default:
      await executeStandardBlock(node, def, ctx, edges, queue)
      break
  }
}

async function processMergeGate(
  node: FlowNode,
  def: BlockDefinition,
  context: AgentContext,
  edges: FlowEdge[],
  queue: string[],
  mergeGates: Map<string, MergeGateState>
): Promise<void> {
  const nodeId = node.id
  const config = node.data.config
  
  // Get or create gate state
  let gateState = mergeGates.get(nodeId)
  if (!gateState) {
    gateState = {
      gateId: nodeId,
      workflowId: context.workflowId || 'unknown',
      firedInputs: [],
      windowStart: Date.now(),
      mode: config.mode as 'ALL' | 'ANY' | 'SEQUENCE',
      windowSeconds: Number(config.window_seconds) || 300,
      resetAfterFire: config.reset_after_fire === 'true' || config.reset_after_fire === true
    }
    mergeGates.set(nodeId, gateState)
  }
  
  // Check if window has expired
  const windowExpired = Date.now() - gateState.windowStart > (gateState.windowSeconds * 1000)
  if (windowExpired && gateState.firedInputs.length > 0) {
    // Reset gate
    gateState.firedInputs = []
    gateState.windowStart = Date.now()
  }
  
  // Record this trigger input (assuming we're being called because an upstream fired)
  const upstreamInputs = getUpstreamInputs(nodeId, edges)
  const firedInput = upstreamInputs.find(input => context.blockOutputs.has(input))
  
  if (firedInput && !gateState.firedInputs.includes(firedInput)) {
    gateState.firedInputs.push(firedInput)
  }
  
  // Check gate condition
  let shouldFire = false
  
  switch (gateState.mode) {
    case 'ANY':
      shouldFire = gateState.firedInputs.length > 0
      break
      
    case 'ALL':
      shouldFire = gateState.firedInputs.length === upstreamInputs.length
      break
      
    case 'SEQUENCE':
      // For sequence, inputs should fire in the order they're defined
      shouldFire = gateState.firedInputs.length === upstreamInputs.length &&
                   gateState.firedInputs.every((input, index) => input === upstreamInputs[index])
      break
  }
  
  if (shouldFire) {
    context.log({ 
      nodeId, 
      blockId: 'merge_gate', 
      blockName: def.name, 
      type: 'success', 
      message: `Gate fired (${gateState.mode}: ${gateState.firedInputs.length}/${upstreamInputs.length})` 
    })
    
    // Collect outputs from all fired inputs
    const mergedOutput = {
      gate_mode: gateState.mode,
      fired_inputs: gateState.firedInputs,
      input_outputs: gateState.firedInputs.map(input => context.blockOutputs.get(input))
    }
    
    context.blockOutputs.set(nodeId, mergedOutput)
    context.onNodeStatusChange(nodeId, 'success')
    
    // Reset gate if configured to do so
    if (gateState.resetAfterFire) {
      gateState.firedInputs = []
      gateState.windowStart = Date.now()
    }
    
    // Enqueue downstream nodes
    enqueueDownstreamNodes(nodeId, edges, queue)
  } else {
    context.log({ 
      nodeId, 
      blockId: 'merge_gate', 
      blockName: def.name, 
      type: 'waiting', 
      message: `Waiting for triggers (${gateState.firedInputs.length}/${upstreamInputs.length})` 
    })
    
    context.onNodeStatusChange(nodeId, 'idle')
  }
}

async function processFork(
  node: FlowNode,
  def: BlockDefinition,
  context: AgentContext,
  edges: FlowEdge[],
  nodes: FlowNode[],
  queue: string[],
  agentStates: Map<string, AgentState>,
): Promise<void> {
  const nodeId = node.id
  const config = node.data.config
  const branchCount = Math.min(5, Math.max(2, Number(config.branch_count) || 2))

  const joinNode = findDownstreamJoin(nodeId, nodes, edges)
  const joinId = joinNode?.id

  const branchTasks: Promise<void>[] = []
  for (let i = 0; i < branchCount; i++) {
    const handle = `branch_${i + 1}`
    const { nodes: subNodes, edges: subEdges } = extractBranchSubgraph(nodeId, handle, joinId, nodes, edges)
    if (subNodes.length === 0) continue

    const branchId = `${nodeId}_branch_${i}`
    agentStates.set(branchId, {
      id: branchId,
      status: 'running',
      startTime: Date.now(),
      parentId: nodeId,
    })

    branchTasks.push(
      import('./runAgent').then(({ runMultiAgentWorkflow }) =>
        runMultiAgentWorkflow(subNodes, subEdges, context),
      ).finally(() => {
        const st = agentStates.get(branchId)
        if (st) st.status = 'completed'
      }),
    )
  }

  try {
    await Promise.all(branchTasks)
  } catch (err) {
    context.log({
      nodeId,
      blockId: 'fork',
      blockName: def.name,
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    })
    context.onNodeStatusChange(nodeId, 'error')
    return
  }

  context.log({
    nodeId,
    blockId: 'fork',
    blockName: def.name,
    type: 'success',
    message: `Fork completed (${branchTasks.length} parallel branch(es))`,
  })

  context.blockOutputs.set(nodeId, {
    branch_count: branchCount,
    branches_ran: branchTasks.length,
    join_downstream_id: joinId ?? null,
  })
  context.onNodeStatusChange(nodeId, 'success')

  if (joinId && !queue.includes(joinId)) {
    queue.push(joinId)
  } else {
    enqueueDownstreamNodes(nodeId, edges, queue)
  }
}

async function processJoin(
  node: FlowNode,
  def: BlockDefinition,
  context: AgentContext,
  edges: FlowEdge[],
  queue: string[],
  agentStates: Map<string, AgentState>
): Promise<void> {
  const nodeId = node.id
  const config = node.data.config
  const strategy = config.strategy as 'all' | 'any' | 'n_of_m'
  const requiredN = Number(config.n) || 2
  
  // Get upstream inputs (branch results)
  const upstreamInputs = getUpstreamInputs(nodeId, edges)
  const completedInputs = upstreamInputs.filter(input => {
    const output = context.blockOutputs.get(input)
    return output !== undefined
  })
  
  let shouldProceed = false
  let joinOutput: any = {}
  
  switch (strategy) {
    case 'any':
      shouldProceed = completedInputs.length > 0
      joinOutput = {
        strategy: 'any',
        completed_first: completedInputs[0],
        result: context.blockOutputs.get(completedInputs[0])
      }
      break
      
    case 'all':
      shouldProceed = completedInputs.length === upstreamInputs.length
      joinOutput = {
        strategy: 'all',
        completed_count: completedInputs.length,
        results: completedInputs.map(input => context.blockOutputs.get(input))
      }
      break
      
    case 'n_of_m':
      shouldProceed = completedInputs.length >= requiredN
      joinOutput = {
        strategy: 'n_of_m',
        required: requiredN,
        completed_count: completedInputs.length,
        results: completedInputs.slice(0, requiredN).map(input => context.blockOutputs.get(input))
      }
      break
  }
  
  if (shouldProceed) {
    context.log({ 
      nodeId, 
      blockId: 'join', 
      blockName: def.name, 
      type: 'success', 
      message: `Join condition satisfied (${strategy}: ${completedInputs.length}/${upstreamInputs.length})` 
    })
    
    context.blockOutputs.set(nodeId, joinOutput)
    context.onNodeStatusChange(nodeId, 'success')
    enqueueDownstreamNodes(nodeId, edges, queue)
  } else {
    context.log({ 
      nodeId, 
      blockId: 'join', 
      blockName: def.name, 
      type: 'waiting', 
      message: `Waiting for branches (${completedInputs.length}/${upstreamInputs.length})` 
    })
    
    context.onNodeStatusChange(nodeId, 'idle')
  }
}

async function processEventTrigger(
  node: FlowNode,
  def: BlockDefinition,
  context: AgentContext,
  edges: FlowEdge[],
  queue: string[]
): Promise<void> {
  const nodeId = node.id
  const config = node.data.config
  const eventName = config.event_name as string
  const filterKey = config.filter_key as string
  const filterValue = config.filter_value as string
  
  if (!eventName) {
    context.log({ 
      nodeId, 
      blockId: 'event_trigger', 
      blockName: def.name, 
      type: 'error', 
      message: 'Event name is required' 
    })
    context.onNodeStatusChange(nodeId, 'error')
    return
  }
  
  let matchingEvent: Record<string, unknown> | null = null

  if (context.workflowId && isSupabaseConfigured()) {
    const remote = await listRecentAgentEvents(context.workflowId, eventName, 25)
    for (const row of remote) {
      const ev = (row.data ?? {}) as Record<string, unknown>
      if (filterKey && filterValue) {
        if (ev[filterKey] === filterValue) {
          matchingEvent = ev
          break
        }
      } else {
        matchingEvent = ev
        break
      }
    }
  }

  if (!matchingEvent) {
    const eventHistory = [...globalEventBus.getEventHistory(eventName)].reverse()
    for (const event of eventHistory) {
      if (filterKey && filterValue) {
        if (event[filterKey] === filterValue) {
          matchingEvent = event as Record<string, unknown>
          break
        }
      } else {
        matchingEvent = event as Record<string, unknown>
        break
      }
    }
  }
  
  if (matchingEvent) {
    // Event already occurred, fire immediately
    context.log({ 
      nodeId, 
      blockId: 'event_trigger', 
      blockName: def.name, 
      type: 'success', 
      message: `Event ${eventName} fired (from history)` 
    })
    
    context.blockOutputs.set(nodeId, matchingEvent)
    context.onNodeStatusChange(nodeId, 'success')
    enqueueDownstreamNodes(nodeId, edges, queue)
  } else {
    // Subscribe to future events
    const filter = filterKey && filterValue ? { key: filterKey, value: filterValue } : undefined
    
    globalEventBus.subscribe(eventName, (data) => {
      context.log({ 
        nodeId, 
        blockId: 'event_trigger', 
        blockName: def.name, 
        type: 'success', 
        message: `Event ${eventName} received` 
      })
      
      context.blockOutputs.set(nodeId, data)
      context.onNodeStatusChange(nodeId, 'success')
      enqueueDownstreamNodes(nodeId, edges, queue)
    }, filter)
    
    context.log({ 
      nodeId, 
      blockId: 'event_trigger', 
      blockName: def.name, 
      type: 'waiting', 
      message: `Listening for event: ${eventName}` 
    })
    
    context.onNodeStatusChange(nodeId, 'idle')
  }
}

async function processEventEmit(
  node: FlowNode,
  def: BlockDefinition,
  context: AgentContext,
  edges: FlowEdge[],
  queue: string[]
): Promise<void> {
  const nodeId = node.id
  const config = node.data.config
  const eventName = config.event_name as string
  const payloadTemplate = config.payload_template as string
  
  if (!eventName) {
    context.log({ 
      nodeId, 
      blockId: 'event_emit', 
      blockName: def.name, 
      type: 'error', 
      message: 'Event name is required' 
    })
    context.onNodeStatusChange(nodeId, 'error')
    return
  }
  
  // Get upstream data to include in event
  const upstreamOutputs = getUpstreamOutputs(nodeId, edges, context.blockOutputs)
  
  // Prepare event payload
  let eventData: any = upstreamOutputs
  
  if (payloadTemplate) {
    try {
      // Simple template replacement for {{variable}} syntax
      let processedTemplate = payloadTemplate
      for (const [key, value] of Object.entries(upstreamOutputs)) {
        processedTemplate = processedTemplate.replace(
          new RegExp(`{{${key}}}`, 'g'), 
          String(value)
        )
      }
      eventData = JSON.parse(processedTemplate)
    } catch (error) {
      context.log({ 
        nodeId, 
        blockId: 'event_emit', 
        blockName: def.name, 
        type: 'error', 
        message: `Payload template error: ${error}` 
      })
      context.onNodeStatusChange(nodeId, 'error')
      return
    }
  }
  
  // Publish event
  await globalEventBus.publishEvent(eventName, eventData, context)
  
  context.log({ 
    nodeId, 
    blockId: 'event_emit', 
    blockName: def.name, 
    type: 'success', 
    message: `Event ${eventName} published` 
  })
  
  const output = { event_name: eventName, payload: eventData, timestamp: Date.now() }
  context.blockOutputs.set(nodeId, output)
  context.onNodeStatusChange(nodeId, 'success')
  enqueueDownstreamNodes(nodeId, edges, queue)
}

// Helper functions

function findTriggerNodes(nodes: FlowNode[]): FlowNode[] {
  return nodes.filter(node => {
    const def = getBlockById(node.data.blockId)
    return def?.category === 'trigger'
  })
}

function getUpstreamInputs(nodeId: string, edges: FlowEdge[]): string[] {
  return edges.filter(e => e.target === nodeId).map(e => e.source)
}

function enqueueDownstreamNodes(nodeId: string, edges: FlowEdge[], queue: string[]): void {
  const downstreamNodes = edges.filter(e => e.source === nodeId).map(e => e.target)
  for (const downstream of downstreamNodes) {
    if (!queue.includes(downstream)) {
      queue.push(downstream)
    }
  }
}

function findDownstreamJoin(forkId: string, nodes: FlowNode[], edges: FlowEdge[]): FlowNode | undefined {
  const seen = new Set<string>()
  const q: string[] = [forkId]
  seen.add(forkId)
  while (q.length) {
    const cur = q.shift()!
    for (const e of edges.filter((ed) => ed.source === cur)) {
      if (seen.has(e.target)) continue
      seen.add(e.target)
      const n = nodes.find((x) => x.id === e.target)
      if (n?.data.blockId === 'join') return n
      q.push(e.target)
    }
  }
  return undefined
}

function extractBranchSubgraph(
  forkId: string,
  sourceHandle: string,
  joinId: string | undefined,
  nodes: FlowNode[],
  edges: FlowEdge[],
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const seeds = edges
    .filter((e) => e.source === forkId && e.sourceHandle === sourceHandle)
    .map((e) => e.target)
  if (seeds.length === 0) return { nodes: [], edges: [] }

  const reachable = new Set<string>()
  const q = [...seeds]
  for (const s of seeds) reachable.add(s)

  while (q.length) {
    const cur = q.shift()!
    if (joinId && cur === joinId) continue
    for (const e of edges.filter((ed) => ed.source === cur)) {
      if (joinId && e.target === joinId) continue
      if (e.target === forkId) continue
      if (!reachable.has(e.target)) {
        reachable.add(e.target)
        q.push(e.target)
      }
    }
  }

  const subNodes = nodes.filter((n) => reachable.has(n.id))
  const subEdges = edges.filter((e) => reachable.has(e.source) && reachable.has(e.target))
  return { nodes: subNodes, edges: subEdges }
}

async function executeStandardBlock(
  node: FlowNode,
  def: BlockDefinition,
  context: AgentContext,
  edges: FlowEdge[],
  queue: string[]
): Promise<void> {
  const nodeId = node.id
  const blockId = node.data.blockId
  
  // Use existing executor logic
  const upstreamOutputs = getUpstreamOutputs(nodeId, edges, context.blockOutputs)
  const resolvedConfig = resolveConfig(node.data.config, context)
  
  const executor = allExecutors[blockId]
  if (!executor) {
    context.log({ 
      nodeId, 
      blockId, 
      blockName: def.name, 
      type: 'skip', 
      message: 'No executor registered' 
    })
    context.onNodeStatusChange(nodeId, 'idle')
    return
  }
  
  try {
    const output = await executor(resolvedConfig, context, upstreamOutputs)
    
    if (output === null) {
      context.log({ 
        nodeId, 
        blockId, 
        blockName: def.name, 
        type: 'skip', 
        message: 'Filtered out' 
      })
      context.onNodeStatusChange(nodeId, 'idle')
      return
    }
    
    context.blockOutputs.set(nodeId, output)
    context.blockOutputs.set(blockId, output)
    context.onNodeStatusChange(nodeId, 'success')
    
    const txId = (output as Record<string, unknown>)?.txId as string | undefined
    const successMsg = txId ? `Success (TxID: ${txId.slice(0, 10)}...)` : 'Completed'
    context.log({
      nodeId, 
      blockId, 
      blockName: def.name, 
      type: 'success',
      message: successMsg
    })
    
    if (blockId === 'comparator') {
      const branch = String(output.branch ?? 'true')
      for (const e of edges.filter((ed) => ed.source === nodeId && ed.sourceHandle === branch)) {
        if (!queue.includes(e.target)) queue.push(e.target)
      }
    } else {
      enqueueDownstreamNodes(nodeId, edges, queue)
    }
    
  } catch (error) {
    context.log({
      nodeId, 
      blockId, 
      blockName: def.name, 
      type: 'error',
      message: error instanceof Error ? error.message : String(error)
    })
    context.onNodeStatusChange(nodeId, 'error')
  }
}

async function isPromiseResolved(promise: Promise<any>): Promise<boolean> {
  const resolved = Symbol('resolved')
  const result = await Promise.race([
    promise.then(() => resolved).catch(() => resolved),
    Promise.resolve(Symbol('pending'))
  ])
  
  return result === resolved
}

async function checkJoinConditions(
  completedAgentId: string,
  result: any,
  nodes: FlowNode[],
  edges: FlowEdge[],
  queue: string[],
  agentStates: Map<string, AgentState>
): Promise<void> {
  // Look for join nodes that might now be ready to execute
  const joinNodes = nodes.filter(node => node.data.blockId === 'join')
  
  for (const joinNode of joinNodes) {
    // Check if this join node is waiting for the completed agent
    const upstreamInputs = getUpstreamInputs(joinNode.id, edges)
    if (upstreamInputs.includes(completedAgentId)) {
      // This join might now be ready - add it to queue for re-evaluation
      if (!queue.includes(joinNode.id)) {
        queue.push(joinNode.id)
      }
    }
  }
}

async function processSpawnAgent(
  node: FlowNode,
  def: BlockDefinition,
  context: AgentContext,
  edges: FlowEdge[],
  queue: string[],
  agentStates: Map<string, AgentState>,
  runningAgents: Map<string, Promise<void>>,
): Promise<void> {
  const nodeId = node.id
  const config = node.data.config
  const subFlowId = String(config.sub_flow_id ?? '').trim()
  const mode = String(config.mode ?? 'parallel')

  if (!subFlowId) {
    context.log({
      nodeId,
      blockId: 'spawn_agent',
      blockName: def.name,
      type: 'error',
      message: 'sub_flow_id is required (pick a saved workflow)',
    })
    context.onNodeStatusChange(nodeId, 'error')
    return
  }

  if (!isSupabaseConfigured()) {
    context.log({
      nodeId,
      blockId: 'spawn_agent',
      blockName: def.name,
      type: 'error',
      message: 'Supabase is not configured; cannot load child workflow',
    })
    context.onNodeStatusChange(nodeId, 'error')
    return
  }

  const row = await getWorkflow(subFlowId)
  const flow = row?.flow_json as { nodes?: FlowNode[]; edges?: FlowEdge[] } | undefined
  if (!flow?.nodes || !flow.edges) {
    context.log({
      nodeId,
      blockId: 'spawn_agent',
      blockName: def.name,
      type: 'error',
      message: `Child workflow not found or invalid: ${subFlowId}`,
    })
    context.onNodeStatusChange(nodeId, 'error')
    return
  }

  const childNodes = flow.nodes as FlowNode[]
  const childEdges = flow.edges as FlowEdge[]
  const childContext: AgentContext = {
    ...context,
    workflowId: subFlowId,
    parentWorkflowId: context.workflowId,
  }

  const agentKey = `${nodeId}_spawn_${subFlowId}`
  agentStates.set(agentKey, { id: agentKey, status: 'running', startTime: Date.now(), parentId: nodeId })

  const runChild = async () => {
    const { runMultiAgentWorkflow } = await import('./runAgent')
    return runMultiAgentWorkflow(childNodes, childEdges, childContext).finally(() => {
      const st = agentStates.get(agentKey)
      if (st) st.status = 'completed'
    })
  }

  if (mode === 'parallel') {
    const p = runChild()
    runningAgents.set(agentKey, p)
    context.blockOutputs.set(nodeId, { spawned_workflow_id: subFlowId, mode, async: true })
    context.onNodeStatusChange(nodeId, 'success')
    enqueueDownstreamNodes(nodeId, edges, queue)
    return
  }

  try {
    await runChild()
    context.blockOutputs.set(nodeId, { spawned_workflow_id: subFlowId, mode, completed: true })
    context.onNodeStatusChange(nodeId, 'success')
    enqueueDownstreamNodes(nodeId, edges, queue)
  } catch (err) {
    context.log({
      nodeId,
      blockId: 'spawn_agent',
      blockName: def.name,
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    })
    context.onNodeStatusChange(nodeId, 'error')
  }
}

async function processWatchdog(
  node: FlowNode,
  def: BlockDefinition,
  context: AgentContext,
  edges: FlowEdge[],
  nodes: FlowNode[],
  queue: string[],
  agentStates: Map<string, AgentState>,
  _runningAgents: Map<string, Promise<void>>,
): Promise<void> {
  const nodeId = node.id
  const config = node.data.config
  const timeoutMs = Math.max(1000, Number(config.timeout_seconds ?? 300) * 1000)

  const successTarget = edges.find((e) => e.source === nodeId && e.sourceHandle === 'success')?.target
  if (!successTarget) {
    context.log({
      nodeId,
      blockId: 'watchdog',
      blockName: def.name,
      type: 'skip',
      message: 'No success branch connected',
    })
    context.onNodeStatusChange(nodeId, 'idle')
    return
  }

  const { nodes: subNodes, edges: subEdges } = extractDownstreamSubgraph(successTarget, nodes, edges)
  if (subNodes.length === 0) {
    context.log({
      nodeId,
      blockId: 'watchdog',
      blockName: def.name,
      type: 'skip',
      message: 'Watchdog success branch is empty',
    })
    context.onNodeStatusChange(nodeId, 'idle')
    return
  }

  const wKey = `${nodeId}_watchdog`
  agentStates.set(wKey, { id: wKey, status: 'running', startTime: Date.now() })

  const runWatched = import('./runAgent').then(({ runMultiAgentWorkflow }) =>
    runMultiAgentWorkflow(subNodes, subEdges, context),
  )
  const timeoutP = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('watchdog_timeout')), timeoutMs)
  })

  try {
    await Promise.race([runWatched, timeoutP])
    const st = agentStates.get(wKey)
    if (st) st.status = 'completed'
    context.blockOutputs.set(nodeId, { status: 'success', watchdog: 'completed' })
    context.onNodeStatusChange(nodeId, 'success')
    enqueueDownstreamForHandle(nodeId, 'success', edges, queue)
  } catch (err) {
    const st = agentStates.get(wKey)
    if (st) {
      st.status = err instanceof Error && err.message === 'watchdog_timeout' ? 'timeout' : 'failed'
      st.error = err instanceof Error ? err.message : String(err)
    }
    if (err instanceof Error && err.message === 'watchdog_timeout') {
      context.blockOutputs.set(nodeId, { status: 'timeout', watchdog: 'timeout' })
      context.onNodeStatusChange(nodeId, 'error')
      enqueueDownstreamForHandle(nodeId, 'timeout', edges, queue)
    } else {
      context.blockOutputs.set(nodeId, { status: 'error', error: String(err) })
      context.onNodeStatusChange(nodeId, 'error')
    }
  }
}

function extractDownstreamSubgraph(
  startId: string,
  nodes: FlowNode[],
  edges: FlowEdge[],
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const reachable = new Set<string>()
  const q: string[] = [startId]
  reachable.add(startId)
  while (q.length) {
    const cur = q.shift()!
    for (const e of edges.filter((ed) => ed.source === cur)) {
      if (!reachable.has(e.target)) {
        reachable.add(e.target)
        q.push(e.target)
      }
    }
  }
  const subNodes = nodes.filter((n) => reachable.has(n.id))
  const subEdges = edges.filter((e) => reachable.has(e.source) && reachable.has(e.target))
  return { nodes: subNodes, edges: subEdges }
}

function enqueueDownstreamForHandle(
  sourceId: string,
  sourceHandle: string,
  edges: FlowEdge[],
  queue: string[],
): void {
  const downstream = edges
    .filter((e) => e.source === sourceId && e.sourceHandle === sourceHandle)
    .map((e) => e.target)
  for (const id of downstream) {
    if (!queue.includes(id)) queue.push(id)
  }
}

export { globalEventBus }