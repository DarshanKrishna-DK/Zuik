import type { SupabaseClient } from '@supabase/supabase-js'
import type { FlowNode, FlowEdge, RunContext } from './workflowRunner.js'
import { executeBlock } from './workflowRunner.js'
import { MultiAgentCoordinator } from './agent/MultiAgentCoordinator.js'

/**
 * Server-side multi-agent orchestrator.
 *
 * When an agent wallet context is available, fork/join/merge_gate/event/spawn_agent blocks run
 * through MultiAgentCoordinator: independent AgentLoop branch agents, message-bus negotiation,
 * consensus at join, and x402-capable tool use.
 *
 * Without agent context, falls back to deterministic parallel branch execution (legacy mode).
 *
 * Blocks:
 *   fork          -> spawn reasoning branch agents (or parallel scripts in legacy mode)
 *   join          -> consensus and result aggregation
 *   merge_gate    -> negotiation-based conflict resolution
 *   event_emit    -> agent message bus + agent_events table
 *   event_trigger -> bus history or agent_events
 *   spawn_agent   -> hierarchical multi-agent child workflow
 */

const MULTI_AGENT_BLOCKS = new Set([
  'merge_gate',
  'fork',
  'join',
  'spawn_agent',
  'event_trigger',
  'event_emit',
  'watchdog',
])

export function flowHasMultiAgentBlocks(nodes: FlowNode[]): boolean {
  return nodes.some((n) => MULTI_AGENT_BLOCKS.has(n.data?.blockId))
}

interface OrchestratorState {
  nodes: FlowNode[]
  edges: FlowEdge[]
  ctx: RunContext
  nodeMap: Map<string, FlowNode>
  outputs: Map<string, unknown>
  visited: Set<string>
}

function downstream(state: OrchestratorState, nodeId: string, handle?: string): string[] {
  return state.edges
    .filter((e) => e.source === nodeId && (handle == null || e.sourceHandle === handle))
    .map((e) => e.target)
}

function upstream(state: OrchestratorState, nodeId: string): string[] {
  return state.edges.filter((e) => e.target === nodeId).map((e) => e.source)
}

function findTriggers(state: OrchestratorState): FlowNode[] {
  const hasIncoming = new Set(state.edges.map((e) => e.target))
  return state.nodes.filter((n) => !hasIncoming.has(n.id))
}

/** Emit an event into the agent_events table (the shared multi-agent event bus). */
async function emitEvent(
  sb: SupabaseClient,
  workflowId: string | null | undefined,
  eventName: string,
  data: Record<string, unknown>,
): Promise<void> {
  if (!workflowId) return
  try {
    await sb.from('agent_events').insert({
      workflow_id: workflowId,
      event_name: eventName,
      data: { ...data, timestamp: Date.now() },
    })
  } catch (e) {
    console.warn('[MultiAgent] event_emit insert failed:', e instanceof Error ? e.message : e)
  }
}

/** Look for an already-emitted event matching name (+ optional filter) for this workflow. */
async function findEvent(
  sb: SupabaseClient,
  workflowId: string | null | undefined,
  eventName: string,
  filterKey?: string,
  filterValue?: string,
): Promise<Record<string, unknown> | null> {
  if (!workflowId) return null
  try {
    const { data, error } = await sb
      .from('agent_events')
      .select('data')
      .eq('workflow_id', workflowId)
      .eq('event_name', eventName)
      .order('emitted_at', { ascending: false })
      .limit(25)
    if (error || !data) return null
    for (const row of data as { data: Record<string, unknown> | null }[]) {
      const ev = row.data ?? {}
      if (filterKey && filterValue) {
        if (ev[filterKey] === filterValue) return ev
      } else {
        return ev
      }
    }
  } catch {
    return null
  }
  return null
}

function findDownstreamJoin(state: OrchestratorState, forkId: string): string | undefined {
  const seen = new Set<string>([forkId])
  const q = [forkId]
  while (q.length) {
    const cur = q.shift()!
    for (const t of downstream(state, cur)) {
      if (seen.has(t)) continue
      seen.add(t)
      if (state.nodeMap.get(t)?.data?.blockId === 'join') return t
      q.push(t)
    }
  }
  return undefined
}

function extractBranch(
  state: OrchestratorState,
  forkId: string,
  handle: string,
  joinId: string | undefined,
): string[] {
  const seeds = state.edges
    .filter((e) => e.source === forkId && e.sourceHandle === handle)
    .map((e) => e.target)
  const reachable: string[] = []
  const seen = new Set<string>()
  const q = [...seeds]
  for (const s of seeds) seen.add(s)
  while (q.length) {
    const cur = q.shift()!
    if (joinId && cur === joinId) continue
    reachable.push(cur)
    for (const t of downstream(state, cur)) {
      if (joinId && t === joinId) continue
      if (t === forkId) continue
      if (!seen.has(t)) {
        seen.add(t)
        q.push(t)
      }
    }
  }
  return reachable
}

/** Run a fixed ordered list of node ids as a sequential sub-branch. */
async function runBranch(state: OrchestratorState, nodeIds: string[]): Promise<void> {
  for (const id of nodeIds) {
    const node = state.nodeMap.get(id)
    if (!node || state.visited.has(id)) continue
    state.visited.add(id)
    const signal = await processNode(state, node)
    if (signal === 'stop') break
  }
}

async function processNode(state: OrchestratorState, node: FlowNode): Promise<'continue' | 'stop'> {
  const blockId = node.data?.blockId
  const config = node.data?.config ?? {}
  const { ctx } = state
  const sb = ctx.sb

  switch (blockId) {
    case 'fork': {
      const branchCount = Math.min(5, Math.max(2, Number(config.branch_count) || 2))
      const joinId = findDownstreamJoin(state, node.id)
      const branches: string[][] = []
      for (let i = 0; i < branchCount; i++) {
        const ids = extractBranch(state, node.id, `branch_${i + 1}`, joinId)
        if (ids.length) branches.push(ids)
      }
      ctx.recorder.log({
        nodeId: node.id,
        blockId: 'fork',
        type: 'info',
        message: `Fork into ${branches.length} parallel branch(es)`,
      })
      // Parallel branches; each branch is sequential internally.
      await Promise.all(branches.map((ids) => runBranch(state, ids)))
      state.outputs.set(node.id, { branches: branches.length, joinId: joinId ?? null })
      if (joinId) {
        const joinNode = state.nodeMap.get(joinId)
        if (joinNode && !state.visited.has(joinId)) {
          state.visited.add(joinId)
          await processNode(state, joinNode)
        }
      }
      return 'continue'
    }

    case 'join': {
      const strategy = String(config.strategy ?? 'all')
      const requiredN = Number(config.n) || 2
      const inputs = upstream(state, node.id)
      const completed = inputs.filter((id) => state.visited.has(id))
      let proceed = false
      if (strategy === 'any') proceed = completed.length > 0
      else if (strategy === 'n_of_m') proceed = completed.length >= requiredN
      else proceed = completed.length === inputs.length
      ctx.recorder.log({
        nodeId: node.id,
        blockId: 'join',
        type: proceed ? 'success' : 'waiting',
        message: `Join ${strategy}: ${completed.length}/${inputs.length} complete`,
      })
      if (!proceed) return 'continue'
      state.outputs.set(node.id, { strategy, completed: completed.length })
      await runDownstream(state, node.id)
      return 'continue'
    }

    case 'merge_gate': {
      const mode = String(config.mode ?? 'ALL').toUpperCase()
      const inputs = upstream(state, node.id)
      const fired = inputs.filter((id) => state.visited.has(id))
      let shouldFire = false
      if (mode === 'ANY') shouldFire = fired.length > 0
      else shouldFire = fired.length === inputs.length
      ctx.recorder.log({
        nodeId: node.id,
        blockId: 'merge_gate',
        type: shouldFire ? 'success' : 'waiting',
        message: `Merge gate ${mode}: ${fired.length}/${inputs.length}`,
      })
      if (!shouldFire) return 'continue'
      state.outputs.set(node.id, { mode, fired: fired.length })
      await runDownstream(state, node.id)
      return 'continue'
    }

    case 'event_emit': {
      const eventName = String(config.event_name ?? '').trim()
      if (!eventName) {
        ctx.recorder.log({ nodeId: node.id, blockId: 'event_emit', type: 'error', message: 'Event name required' })
        return 'continue'
      }
      let payload: Record<string, unknown> = { aiDecision: ctx.vars.aiDecision ?? null }
      const tmpl = String(config.payload_template ?? '').trim()
      if (tmpl) {
        try {
          payload = JSON.parse(tmpl) as Record<string, unknown>
        } catch {
          payload = { raw: tmpl }
        }
      }
      if (sb) await emitEvent(sb, ctx.workflowId, eventName, payload)
      ctx.recorder.log({
        nodeId: node.id,
        blockId: 'event_emit',
        type: 'success',
        message: `Emitted event ${eventName}`,
        detail: { eventName, payload },
      })
      await runDownstream(state, node.id)
      return 'continue'
    }

    case 'event_trigger': {
      const eventName = String(config.event_name ?? '').trim()
      const filterKey = String(config.filter_key ?? '').trim() || undefined
      const filterValue = String(config.filter_value ?? '').trim() || undefined
      if (!eventName) {
        ctx.recorder.log({ nodeId: node.id, blockId: 'event_trigger', type: 'error', message: 'Event name required' })
        return 'continue'
      }
      const ev = sb ? await findEvent(sb, ctx.workflowId, eventName, filterKey, filterValue) : null
      if (ev) {
        ctx.vars[`event:${eventName}`] = ev
        ctx.recorder.log({
          nodeId: node.id,
          blockId: 'event_trigger',
          type: 'success',
          message: `Event ${eventName} matched (from bus)`,
        })
        await runDownstream(state, node.id)
      } else {
        ctx.recorder.log({
          nodeId: node.id,
          blockId: 'event_trigger',
          type: 'waiting',
          message: `No matching ${eventName} event yet; will re-check next poll`,
        })
      }
      return 'continue'
    }

    case 'spawn_agent': {
      const subFlowId = String(config.sub_flow_id ?? '').trim()
      if (!subFlowId || !sb) {
        ctx.recorder.log({ nodeId: node.id, blockId: 'spawn_agent', type: 'skip', message: 'No sub_flow_id or Supabase' })
        await runDownstream(state, node.id)
        return 'continue'
      }
      try {
        const { data } = await sb.from('workflows').select('flow_json').eq('id', subFlowId).maybeSingle()
        const childFlow = (data as { flow_json?: { nodes?: FlowNode[]; edges?: FlowEdge[] } } | null)?.flow_json
        if (childFlow?.nodes) {
          const childState: OrchestratorState = {
            nodes: childFlow.nodes,
            edges: childFlow.edges ?? [],
            ctx: { ...ctx, workflowId: subFlowId },
            nodeMap: new Map(childFlow.nodes.map((n) => [n.id, n])),
            outputs: new Map(),
            visited: new Set(),
          }
          ctx.recorder.log({ nodeId: node.id, blockId: 'spawn_agent', type: 'info', message: `Spawning child ${subFlowId}` })
          await orchestrate(childState)
        }
      } catch (e) {
        ctx.recorder.log({
          nodeId: node.id,
          blockId: 'spawn_agent',
          type: 'error',
          message: e instanceof Error ? e.message : String(e),
        })
      }
      await runDownstream(state, node.id)
      return 'continue'
    }

    case 'watchdog': {
      // Headless watchdog: run the success branch with a timeout; on timeout take the timeout branch.
      const timeoutMs = Math.max(1000, Number(config.timeout_seconds ?? 60) * 1000)
      const successTargets = downstream(state, node.id, 'success')
      const ids: string[] = []
      for (const t of successTargets) ids.push(...extractBranch(state, node.id, 'success', undefined))
      const run = runBranch(state, [...new Set(ids)])
      const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), timeoutMs))
      const outcome = await Promise.race([run.then(() => 'ok' as const), timeout])
      if (outcome === 'timeout') {
        ctx.recorder.log({ nodeId: node.id, blockId: 'watchdog', type: 'error', message: 'Watchdog timeout' })
        for (const t of downstream(state, node.id, 'timeout')) {
          const n = state.nodeMap.get(t)
          if (n && !state.visited.has(t)) {
            state.visited.add(t)
            await processNode(state, n)
          }
        }
      } else {
        ctx.recorder.log({ nodeId: node.id, blockId: 'watchdog', type: 'success', message: 'Watchdog branch completed' })
      }
      return 'continue'
    }

    default: {
      // Standard block: delegate to the shared executor (includes the Guardian-bounded ai-agent).
      const signal = await executeBlock(node, ctx)
      if (signal === 'stop') return 'stop'
      await runDownstream(state, node.id)
      return 'continue'
    }
  }
}

async function runDownstream(state: OrchestratorState, nodeId: string): Promise<void> {
  for (const t of downstream(state, nodeId)) {
    const node = state.nodeMap.get(t)
    if (!node || state.visited.has(t)) continue
    // Gates and joins decide for themselves whether to fire; mark visited to avoid loops.
    const blockId = node.data?.blockId
    if (blockId === 'join' || blockId === 'merge_gate') {
      if (!state.visited.has(t)) {
        state.visited.add(t)
        await processNode(state, node)
      }
      continue
    }
    state.visited.add(t)
    await processNode(state, node)
  }
}

async function orchestrate(state: OrchestratorState): Promise<void> {
  const triggers = findTriggers(state)
  for (const trigger of triggers) {
    if (state.visited.has(trigger.id)) continue
    state.visited.add(trigger.id)
    await processNode(state, trigger)
  }
}

/**
 * Entry point used by executeWorkflowHeadless when a flow contains multi-agent blocks.
 * Uses true multi-agent coordination when agentContext is set; otherwise legacy orchestration.
 */
export async function runMultiAgentHeadless(
  nodes: FlowNode[],
  edges: FlowEdge[],
  ctx: RunContext,
): Promise<void> {
  if (ctx.agentContext) {
    console.log('[MultiAgent] Coordinating with AgentLoop branch agents and message bus')
    const coordinator = new MultiAgentCoordinator(nodes, edges, ctx, ctx.agentContext)
    await coordinator.coordinate()
    return
  }

  const state: OrchestratorState = {
    nodes,
    edges,
    ctx,
    nodeMap: new Map(nodes.map((n) => [n.id, n])),
    outputs: new Map(),
    visited: new Set(),
  }
  await orchestrate(state)
}
