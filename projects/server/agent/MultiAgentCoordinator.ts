/**
 * Coordinates multiple AgentLoop instances with communication, negotiation, and consensus.
 * Transforms fork/join/merge_gate/event blocks from parallel scripts into collaborating agents.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { FlowNode, FlowEdge, RunContext } from '../workflowRunner.js'
import { executeBlock } from '../workflowRunner.js'
import type { AgentExecutionContext } from '../agentSigner.js'
import { readGuardianContext } from '../guardianPolicy.js'
import { getAlgodClient } from '../algorand.js'
import { getMarketSnapshot } from '../marketSnapshot.js'
import type { AgentDecision } from '../aiAgent.js'
import { AgentMessageBus, type ConsensusVote, type NegotiationResult } from './AgentMessageBus.js'
import { AgentLoop } from './AgentLoop.js'
import { ToolRegistry } from './ToolRegistry.js'

export interface BranchAgentState {
  agentId: string
  branchIndex: number
  role: string
  goal: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  decision?: AgentDecision | null
  branchOutput?: Record<string, unknown>
  error?: string
}

export interface JoinConsensusResult {
  strategy: string
  consensus: NegotiationResult
  branchAgents: BranchAgentState[]
  aggregatedOutput: Record<string, unknown>
}

export interface CoordinatorState {
  messageBus: AgentMessageBus
  branchAgents: Map<string, BranchAgentState>
  joinResults: Map<string, JoinConsensusResult>
  outputs: Map<string, unknown>
  visited: Set<string>
}

interface OrchestratorSlice {
  nodes: FlowNode[]
  edges: FlowEdge[]
  nodeMap: Map<string, FlowNode>
  outputs: Map<string, unknown>
  visited: Set<string>
}

function downstream(edges: FlowEdge[], nodeId: string, handle?: string): string[] {
  return edges
    .filter((e) => e.source === nodeId && (handle == null || e.sourceHandle === handle))
    .map((e) => e.target)
}

function upstream(edges: FlowEdge[], nodeId: string): string[] {
  return edges.filter((e) => e.target === nodeId).map((e) => e.source)
}

function findDownstreamJoin(edges: FlowEdge[], nodeMap: Map<string, FlowNode>, forkId: string): string | undefined {
  const seen = new Set<string>([forkId])
  const q = [forkId]
  while (q.length) {
    const cur = q.shift()!
    for (const t of downstream(edges, cur)) {
      if (seen.has(t)) continue
      seen.add(t)
      if (nodeMap.get(t)?.data?.blockId === 'join') return t
      q.push(t)
    }
  }
  return undefined
}

function extractBranch(
  edges: FlowEdge[],
  forkId: string,
  handle: string,
  joinId: string | undefined,
): string[] {
  const seeds = edges
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
    for (const t of downstream(edges, cur)) {
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

export class MultiAgentCoordinator {
  readonly state: CoordinatorState
  private readonly toolRegistry: ToolRegistry

  constructor(
    readonly nodes: FlowNode[],
    readonly edges: FlowEdge[],
    readonly ctx: RunContext,
    private readonly agent: AgentExecutionContext,
  ) {
    this.state = {
      messageBus: new AgentMessageBus(
        `coord_${Date.now()}`,
        ctx.workflowId,
        ctx.sb,
      ),
      branchAgents: new Map(),
      joinResults: new Map(),
      outputs: new Map(),
      visited: new Set(),
    }
    this.toolRegistry = new ToolRegistry()
  }

  get messageBus(): AgentMessageBus {
    return this.state.messageBus
  }

  /** Register message bus on shared vars for block executors. */
  attachToContext(): void {
    this.ctx.vars.multiAgentCoordinator = this
    this.ctx.vars.agentMessageBus = this.state.messageBus
  }

  /**
   * Fork: spawn independent reasoning agents per branch, run branch subgraphs in parallel,
   * then converge at join with agent communication throughout.
   */
  async handleFork(node: FlowNode, slice: OrchestratorSlice): Promise<void> {
    const config = node.data?.config ?? {}
    const branchCount = Math.min(5, Math.max(2, Number(config.branch_count) || 2))
    const joinId = findDownstreamJoin(this.edges, slice.nodeMap, node.id)
    const correlationId = `fork_${node.id}_${Date.now()}`

    this.ctx.recorder.log({
      nodeId: node.id,
      blockId: 'fork',
      type: 'info',
      message: `Multi-agent fork: spawning ${branchCount} reasoning branch agent(s)`,
    })

    const branchTasks: Promise<BranchAgentState>[] = []

    for (let i = 0; i < branchCount; i++) {
      const handle = `branch_${i + 1}`
      const branchNodeIds = extractBranch(this.edges, node.id, handle, joinId)
      if (branchNodeIds.length === 0) continue

      const agentId = `${node.id}_agent_${i + 1}`
      const role = String(config[`role_${i + 1}`] ?? config.agent_role ?? `branch_analyst_${i + 1}`)
      const goal =
        String(config[`branch_goal_${i + 1}`] ?? config.branch_goal ?? '').trim() ||
        `Analyze branch ${i + 1} for workflow decision (role: ${role})`

      const branchState: BranchAgentState = {
        agentId,
        branchIndex: i,
        role,
        goal,
        status: 'pending',
      }
      this.state.branchAgents.set(agentId, branchState)

      branchTasks.push(this.runBranchAgent(branchState, branchNodeIds, slice, correlationId))
    }

    const completed = await Promise.all(branchTasks)

    for (const ba of completed) {
      this.state.branchAgents.set(ba.agentId, ba)
    }

    this.state.outputs.set(node.id, {
      mode: 'multi_agent',
      branches: completed.length,
      joinId: joinId ?? null,
      agents: completed.map((b) => ({
        agentId: b.agentId,
        role: b.role,
        status: b.status,
        action: b.decision?.action ?? null,
        confidence: b.decision?.confidence ?? null,
      })),
    })
    slice.outputs.set(node.id, this.state.outputs.get(node.id))

    if (joinId) {
      const joinNode = slice.nodeMap.get(joinId)
      if (joinNode && !slice.visited.has(joinId)) {
        slice.visited.add(joinId)
        await this.handleJoin(joinNode, slice, correlationId)
      }
    }
  }

  private async runBranchAgent(
    branch: BranchAgentState,
    nodeIds: string[],
    slice: OrchestratorSlice,
    correlationId: string,
  ): Promise<BranchAgentState> {
    branch.status = 'running'
    const bus = this.state.messageBus

    bus.subscribe(branch.agentId, (msg) => {
      if (msg.type === 'proposal' && msg.toAgentId === branch.agentId) {
        bus.publish({
          type: 'info',
          fromAgentId: branch.agentId,
          toAgentId: msg.fromAgentId,
          topic: 'negotiation_ack',
          correlationId,
          payload: { received: msg.payload },
        })
      }
    })

    await bus.publish({
      type: 'info',
      fromAgentId: branch.agentId,
      topic: 'branch_start',
      correlationId,
      payload: { role: branch.role, goal: branch.goal, nodeCount: nodeIds.length },
    })

    try {
      const guardian = await readGuardianContext(this.agent.guardianAppId, this.agent.agentAddress)
      const acct = await getAlgodClient().accountInformation(this.agent.agentAddress).do()
      const balanceMicro = BigInt(acct.amount ?? 0)
      const market = await getMarketSnapshot(0, this.agent)
      const userStrategy = String(this.ctx.vars.userStrategy ?? branch.goal)

      const loop = new AgentLoop({
        tools: this.toolRegistry,
        maxIterations: Number(process.env.AGENT_BRANCH_MAX_ITERATIONS ?? 3),
      })

      const branchDecision = await loop.run({
        decisionContext: {
          userStrategy: `${userStrategy}\nBranch role: ${branch.role}\nBranch goal: ${branch.goal}`,
          agentBalanceMicroAlgos: balanceMicro,
          market,
          guardian,
          recipient: (this.ctx.vars.recipient as string) ?? null,
          maxAmountAlgo: this.ctx.vars.maxAmountAlgo as number | null,
          agentAddress: this.agent.agentAddress,
          workflowId: this.ctx.workflowId,
          supabase: this.ctx.sb ?? null,
        },
        agent: this.agent,
        sb: this.ctx.sb,
        workflowId: this.ctx.workflowId,
        messageBus: bus,
        agentId: branch.agentId,
      })

      branch.decision = branchDecision

      const vote: ConsensusVote = {
        agentId: branch.agentId,
        action: branchDecision.action,
        amountAlgo: branchDecision.amountAlgo,
        confidence: branchDecision.confidence,
        reason: branchDecision.reason,
      }
      await bus.publishVote(branch.agentId, vote, correlationId)

      for (const nodeId of nodeIds) {
        const node = slice.nodeMap.get(nodeId)
        if (!node || slice.visited.has(nodeId)) continue
        slice.visited.add(nodeId)
        const signal = await executeBlock(node, this.ctx)
        if (signal === 'stop') break
      }

      branch.branchOutput = {
        decision: branchDecision,
        role: branch.role,
        goal: branch.goal,
        nodesExecuted: nodeIds.length,
      }
      branch.status = 'completed'

      await bus.publishBranchResult(
        branch.agentId,
        branch.agentId,
        branch.branchOutput,
        correlationId,
      )

      this.ctx.recorder.log({
        nodeId: branch.agentId,
        blockId: 'fork_branch_agent',
        type: 'success',
        message: `Branch agent ${branch.role}: ${branchDecision.action} (conf ${branchDecision.confidence})`,
        detail: {
          agentId: branch.agentId,
          action: branchDecision.action,
          amountAlgo: branchDecision.amountAlgo,
          reason: branchDecision.reason,
        },
      })
    } catch (e) {
      branch.status = 'failed'
      branch.error = e instanceof Error ? e.message : String(e)
      this.ctx.recorder.log({
        nodeId: branch.agentId,
        blockId: 'fork_branch_agent',
        type: 'error',
        message: branch.error,
      })
    }

    return branch
  }

  /**
   * Join: aggregate branch agent votes via consensus negotiation.
   */
  async handleJoin(
    node: FlowNode,
    slice: OrchestratorSlice,
    correlationId?: string,
  ): Promise<JoinConsensusResult | null> {
    const config = node.data?.config ?? {}
    const strategy = String(config.strategy ?? 'all')
    const requiredN = Number(config.n) || 2
    const inputs = upstream(this.edges, node.id)

    const branchAgents = [...this.state.branchAgents.values()].filter(
      (b) => b.status === 'completed' && b.decision,
    )

    let votes: ConsensusVote[] = branchAgents.map((b) => ({
      agentId: b.agentId,
      action: b.decision!.action,
      amountAlgo: b.decision!.amountAlgo,
      confidence: b.decision!.confidence,
      reason: b.decision!.reason,
    }))

    if (votes.length === 0) {
      const history = this.state.messageBus
        .getHistory('consensus', 20)
        .filter((m) => m.type === 'consensus_vote')
      votes = history.map((m) => m.payload as unknown as ConsensusVote)
    }

    let proceed = false
    if (strategy === 'any') proceed = votes.length > 0
    else if (strategy === 'n_of_m') proceed = votes.length >= requiredN
    else proceed = votes.length >= inputs.length || votes.length === branchAgents.length

    if (!proceed && votes.length === 0) {
      this.ctx.recorder.log({
        nodeId: node.id,
        blockId: 'join',
        type: 'waiting',
        message: `Join ${strategy}: no branch votes yet`,
      })
      return null
    }

    const consensus = this.state.messageBus.negotiateConsensus(votes, correlationId)

    await this.state.messageBus.publish({
      type: 'negotiation_round',
      fromAgentId: 'coordinator',
      topic: 'join_consensus',
      correlationId,
      payload: {
        strategy,
        consensus,
        voteCount: votes.length,
      },
    })

    const result: JoinConsensusResult = {
      strategy,
      consensus,
      branchAgents: branchAgents,
      aggregatedOutput: {
        strategy,
        action: consensus.action,
        amountAlgo: consensus.amountAlgo,
        confidence: consensus.confidence,
        reason: consensus.reason,
        voteCount: votes.length,
        branchResults: branchAgents.map((b) => ({
          agentId: b.agentId,
          role: b.role,
          decision: b.decision,
        })),
      },
    }

    this.state.joinResults.set(node.id, result)
    this.state.outputs.set(node.id, result.aggregatedOutput)
    slice.outputs.set(node.id, result.aggregatedOutput)

    this.ctx.vars.aiDecision = {
      action: consensus.action === 'pay' ? 'pay' : consensus.action === 'notify' ? 'notify' : 'hold',
      amountAlgo: consensus.amountAlgo,
      recipient: (this.ctx.vars.recipient as string) ?? null,
      reason: consensus.reason,
      confidence: consensus.confidence,
      clamped: false,
      source: 'groq' as const,
    }

    this.ctx.recorder.log({
      nodeId: node.id,
      blockId: 'join',
      type: 'success',
      message: `Join consensus: ${consensus.action} (conf ${consensus.confidence.toFixed(2)}, ${votes.length} votes)`,
      detail: result.aggregatedOutput,
    })

    await this.runDownstream(node.id, slice)
    return result
  }

  /**
   * Merge gate: resolve conflicting upstream agent outputs via pairwise negotiation.
   */
  async handleMergeGate(node: FlowNode, slice: OrchestratorSlice): Promise<void> {
    const config = node.data?.config ?? {}
    const mode = String(config.mode ?? 'ALL').toUpperCase()
    const inputs = upstream(this.edges, node.id)
    const fired = inputs.filter((id) => slice.visited.has(id))

    let shouldFire = false
    if (mode === 'ANY') shouldFire = fired.length > 0
    else shouldFire = fired.length === inputs.length && inputs.length > 0

    if (!shouldFire) {
      this.ctx.recorder.log({
        nodeId: node.id,
        blockId: 'merge_gate',
        type: 'waiting',
        message: `Merge gate ${mode}: ${fired.length}/${inputs.length}`,
      })
      return
    }

    const proposals: ConsensusVote[] = []
    for (const inputId of fired) {
      const output = slice.outputs.get(inputId) as Record<string, unknown> | undefined
      if (output?.action) {
        proposals.push({
          agentId: inputId,
          action: String(output.action),
          amountAlgo: Number(output.amountAlgo ?? 0),
          confidence: Number(output.confidence ?? 0.5),
          reason: String(output.reason ?? 'upstream decision'),
        })
      }
    }

    let resolved: NegotiationResult
    if (proposals.length >= 2) {
      resolved = this.state.messageBus.negotiatePair(proposals[0], proposals[1])
      for (let i = 2; i < proposals.length; i++) {
        const next = this.state.messageBus.negotiatePair(
          {
            agentId: 'coordinator',
            action: resolved.action,
            amountAlgo: resolved.amountAlgo,
            confidence: resolved.confidence,
            reason: resolved.reason,
          },
          proposals[i],
        )
        resolved = next
      }
    } else if (proposals.length === 1) {
      resolved = this.state.messageBus.negotiatePair(proposals[0], null)
    } else {
      resolved = {
        resolved: true,
        action: 'hold',
        amountAlgo: 0,
        confidence: 1,
        reason: 'Merge gate fired with no conflicting proposals',
        rounds: 0,
        votes: [],
      }
    }

    const merged = {
      mode,
      firedInputs: fired,
      negotiation: resolved,
      action: resolved.action,
      amountAlgo: resolved.amountAlgo,
      confidence: resolved.confidence,
      reason: resolved.reason,
    }

    this.state.outputs.set(node.id, merged)
    slice.outputs.set(node.id, merged)

    this.ctx.recorder.log({
      nodeId: node.id,
      blockId: 'merge_gate',
      type: 'success',
      message: `Merge gate resolved: ${resolved.action} (${resolved.reason.slice(0, 80)})`,
      detail: merged,
    })

    await this.runDownstream(node.id, slice)
  }

  async handleEventEmit(node: FlowNode, slice: OrchestratorSlice): Promise<void> {
    const config = node.data?.config ?? {}
    const eventName = String(config.event_name ?? '').trim()
    if (!eventName) {
      this.ctx.recorder.log({ nodeId: node.id, blockId: 'event_emit', type: 'error', message: 'Event name required' })
      return
    }

    let payload: Record<string, unknown> = { aiDecision: this.ctx.vars.aiDecision ?? null }
    const tmpl = String(config.payload_template ?? '').trim()
    if (tmpl) {
      try {
        payload = JSON.parse(tmpl) as Record<string, unknown>
      } catch {
        payload = { raw: tmpl }
      }
    }

    await this.state.messageBus.publishEvent(eventName, 'coordinator', payload)

    this.ctx.recorder.log({
      nodeId: node.id,
      blockId: 'event_emit',
      type: 'success',
      message: `Agent bus emitted ${eventName}`,
      detail: { eventName, payload },
    })

    slice.outputs.set(node.id, { eventName, payload })
    await this.runDownstream(node.id, slice)
  }

  async handleEventTrigger(node: FlowNode, slice: OrchestratorSlice): Promise<void> {
    const config = node.data?.config ?? {}
    const eventName = String(config.event_name ?? '').trim()
    const filterKey = String(config.filter_key ?? '').trim() || undefined
    const filterValue = String(config.filter_value ?? '').trim() || undefined

    if (!eventName) {
      this.ctx.recorder.log({ nodeId: node.id, blockId: 'event_trigger', type: 'error', message: 'Event name required' })
      return
    }

    const history = this.state.messageBus.getHistory(eventName, 25)
    let match: Record<string, unknown> | null = null

    for (const msg of [...history].reverse()) {
      const ev = msg.payload
      if (filterKey && filterValue) {
        if (ev[filterKey] === filterValue) {
          match = ev
          break
        }
      } else {
        match = ev
        break
      }
    }

    if (!match && this.ctx.sb && this.ctx.workflowId) {
      try {
        const { data } = await this.ctx.sb
          .from('agent_events')
          .select('data')
          .eq('workflow_id', this.ctx.workflowId)
          .eq('event_name', eventName)
          .order('emitted_at', { ascending: false })
          .limit(25)
        for (const row of (data ?? []) as { data: Record<string, unknown> | null }[]) {
          const ev = row.data ?? {}
          if (filterKey && filterValue) {
            if (ev[filterKey] === filterValue) {
              match = ev
              break
            }
          } else {
            match = ev
            break
          }
        }
      } catch {
        // fallback to bus only
      }
    }

    if (match) {
      this.ctx.vars[`event:${eventName}`] = match
      slice.outputs.set(node.id, match)
      this.ctx.recorder.log({
        nodeId: node.id,
        blockId: 'event_trigger',
        type: 'success',
        message: `Event ${eventName} matched on agent bus`,
      })
      await this.runDownstream(node.id, slice)
    } else {
      this.ctx.recorder.log({
        nodeId: node.id,
        blockId: 'event_trigger',
        type: 'waiting',
        message: `No ${eventName} on agent bus yet`,
      })
    }
  }

  async handleSpawnAgent(node: FlowNode, slice: OrchestratorSlice): Promise<void> {
    const config = node.data?.config ?? {}
    const subFlowId = String(config.sub_flow_id ?? '').trim()
    if (!subFlowId || !this.ctx.sb) {
      this.ctx.recorder.log({
        nodeId: node.id,
        blockId: 'spawn_agent',
        type: 'skip',
        message: 'No sub_flow_id or Supabase',
      })
      await this.runDownstream(node.id, slice)
      return
    }

    try {
      const { data } = await this.ctx.sb
        .from('workflows')
        .select('flow_json')
        .eq('id', subFlowId)
        .maybeSingle()
      const childFlow = (data as { flow_json?: { nodes?: FlowNode[]; edges?: FlowEdge[] } } | null)?.flow_json

      if (childFlow?.nodes) {
        const childCoordinator = new MultiAgentCoordinator(
          childFlow.nodes,
          childFlow.edges ?? [],
          { ...this.ctx, workflowId: subFlowId },
          this.agent,
        )
        childCoordinator.attachToContext()

        await this.state.messageBus.publish({
          type: 'info',
          fromAgentId: 'coordinator',
          topic: 'spawn_agent',
          payload: { subFlowId, mode: config.mode ?? 'sequential' },
        })

        const childSlice: OrchestratorSlice = {
          nodes: childFlow.nodes,
          edges: childFlow.edges ?? [],
          nodeMap: new Map(childFlow.nodes.map((n) => [n.id, n])),
          outputs: new Map(),
          visited: new Set(),
        }

        await childCoordinator.orchestrate(childSlice)

        slice.outputs.set(node.id, {
          spawned_workflow_id: subFlowId,
          childOutputs: Object.fromEntries(childCoordinator.state.outputs),
        })

        this.ctx.recorder.log({
          nodeId: node.id,
          blockId: 'spawn_agent',
          type: 'success',
          message: `Spawned multi-agent child ${subFlowId}`,
        })
      }
    } catch (e) {
      this.ctx.recorder.log({
        nodeId: node.id,
        blockId: 'spawn_agent',
        type: 'error',
        message: e instanceof Error ? e.message : String(e),
      })
    }

    await this.runDownstream(node.id, slice)
  }

  async processNode(node: FlowNode, slice: OrchestratorSlice): Promise<'continue' | 'stop'> {
    const blockId = node.data?.blockId

    switch (blockId) {
      case 'fork':
        await this.handleFork(node, slice)
        return 'continue'
      case 'join':
        await this.handleJoin(node, slice)
        return 'continue'
      case 'merge_gate':
        await this.handleMergeGate(node, slice)
        return 'continue'
      case 'event_emit':
        await this.handleEventEmit(node, slice)
        return 'continue'
      case 'event_trigger':
        await this.handleEventTrigger(node, slice)
        return 'continue'
      case 'spawn_agent':
        await this.handleSpawnAgent(node, slice)
        return 'continue'
      default: {
        const signal = await executeBlock(node, this.ctx)
        if (signal === 'stop') return 'stop'
        await this.runDownstream(node.id, slice)
        return 'continue'
      }
    }
  }

  private async runDownstream(nodeId: string, slice: OrchestratorSlice): Promise<void> {
    for (const t of downstream(this.edges, nodeId)) {
      const node = slice.nodeMap.get(t)
      if (!node || slice.visited.has(t)) continue
      const blockId = node.data?.blockId
      if (blockId === 'join' || blockId === 'merge_gate') {
        if (!slice.visited.has(t)) {
          slice.visited.add(t)
          await this.processNode(node, slice)
        }
        continue
      }
      slice.visited.add(t)
      await this.processNode(node, slice)
    }
  }

  async orchestrate(slice: OrchestratorSlice): Promise<void> {
    this.attachToContext()
    const hasIncoming = new Set(this.edges.map((e) => e.target))
    const triggers = this.nodes.filter((n) => !hasIncoming.has(n.id))

    for (const trigger of triggers) {
      if (slice.visited.has(trigger.id)) continue
      slice.visited.add(trigger.id)
      await this.processNode(trigger, slice)
    }
  }

  /**
   * Entry: run full workflow graph with multi-agent coordination.
   */
  async coordinate(): Promise<void> {
    const slice: OrchestratorSlice = {
      nodes: this.nodes,
      edges: this.edges,
      nodeMap: new Map(this.nodes.map((n) => [n.id, n])),
      outputs: this.state.outputs,
      visited: this.state.visited,
    }
    await this.orchestrate(slice)
  }
}
