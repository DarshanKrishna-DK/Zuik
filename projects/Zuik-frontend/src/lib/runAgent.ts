import type { TransactionSigner } from 'algosdk'
import type { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { getBlockById } from './blockRegistry'
import type { BlockCategory } from './blockRegistry'
import { allExecutors } from './executors'
import { saveSchedule, deactivateSchedule, recordScheduleIteration } from '../services/workflowScheduler'

/**
 * Creates a Web Worker-based interval that is NOT throttled when the tab
 * is in the background (browsers throttle setInterval to ~1 min in hidden tabs).
 *
 * Note: ticks fire on a fixed schedule and do NOT wait for an async `callback`.
 * If `callback` returns a Promise, overlapping ticks can still run unless you
 * use `options.awaitAsync` so the next tick waits for the previous run to finish.
 */
function createBgInterval(
  callback: () => void | Promise<void>,
  ms: number,
  options?: { awaitAsync?: boolean },
): { clear: () => void } {
  const awaitAsync = options?.awaitAsync ?? false
  let runPromise: Promise<void> = Promise.resolve()
  const workerSrc = `
    let id;
    onmessage = function(e) {
      if (e.data === 'start') id = setInterval(() => postMessage('tick'), ${ms});
      if (e.data === 'stop') { clearInterval(id); close(); }
    };
  `
  try {
    const blob = new Blob([workerSrc], { type: 'application/javascript' })
    const w = new Worker(URL.createObjectURL(blob))
    w.onmessage = () => {
      if (awaitAsync) {
        runPromise = runPromise.then(() => Promise.resolve(callback()).catch(() => {}))
      } else {
        void callback()
      }
    }
    w.postMessage('start')
    return {
      clear() {
        try { w.postMessage('stop') } catch { /* already closed */ }
        try { w.terminate() } catch { /* ok */ }
      },
    }
  } catch {
    let runPromise: Promise<void> = Promise.resolve()
    const id = setInterval(() => {
      if (awaitAsync) {
        runPromise = runPromise.then(() => Promise.resolve(callback()).catch(() => {}))
      } else {
        void callback()
      }
    }, ms)
    return { clear() { clearInterval(id) } }
  }
}

/**
 * Chained setTimeout aligned to an anchor clock so slow async callbacks do not permanently drift the schedule
 * (unlike fixed setInterval ticks that ignore handler duration).
 */
function createDriftAwareRepeatingTimer(
  callback: () => void | Promise<void>,
  intervalMs: number,
  options?: { awaitAsync?: boolean },
): { clear: () => void } {
  const awaitAsync = options?.awaitAsync ?? false
  let cleared = false
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const anchor = Date.now()
  let tickIndex = 0

  const scheduleNext = () => {
    if (cleared) return
    tickIndex += 1
    const nextDue = anchor + tickIndex * intervalMs
    const delay = Math.max(0, nextDue - Date.now())
    timeoutId = setTimeout(() => {
      const run = async () => {
        if (cleared) return
        if (awaitAsync) {
          await Promise.resolve(callback()).catch(() => {})
        } else {
          void Promise.resolve(callback()).catch(() => {})
        }
        if (!cleared) scheduleNext()
      }
      void run()
    }, delay)
  }

  scheduleNext()
  return {
    clear() {
      cleared = true
      if (timeoutId != null) clearTimeout(timeoutId)
    },
  }
}

export type AgentStatus = 'idle' | 'running' | 'paused' | 'error' | 'stopped'

export interface LogEntry {
  timestamp: number
  nodeId: string
  blockId: string
  blockName: string
  type: 'start' | 'success' | 'error' | 'skip' | 'trigger-fire' | 'info'
  message: string
  data?: unknown
}

export interface VariableContext {
  variables: Record<string, unknown>
  set(name: string, value: unknown): void
  get(name: string): unknown
  resolve(template: string, blockOutputs: Map<string, Record<string, unknown>>): string
}

export interface FlowNode {
  id: string
  data: {
    blockId: string
    config: Record<string, string | number | undefined>
    label?: string
    [key: string]: unknown
  }
}

export interface FlowEdge {
  id?: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
}

/**
 * Comparator blocks must tag outgoing edges with sourceHandle "true" or "false".
 * If exactly two edges from a comparator lack handles, assign "true" / "false" by target id order so only one branch runs.
 */
export function normalizeComparatorEdgesForRun(nodes: FlowNode[], edges: FlowEdge[]): FlowEdge[] {
  const comparatorNodeIds = new Set(
    nodes.filter((n) => n.data.blockId === 'comparator').map((n) => n.id),
  )
  const next = edges.map((e) => ({ ...e }))
  for (const cid of comparatorNodeIds) {
    const fromComp = next
      .map((e, idx) => ({ e, idx }))
      .filter(({ e }) => e.source === cid && (e.sourceHandle == null || e.sourceHandle === ''))
    if (fromComp.length !== 2) continue
    fromComp.sort((a, b) => a.e.target.localeCompare(b.e.target))
    next[fromComp[0].idx] = { ...next[fromComp[0].idx], sourceHandle: 'true' }
    next[fromComp[1].idx] = { ...next[fromComp[1].idx], sourceHandle: 'false' }
  }
  return next
}

/** Set by subscribeAgent so wallet-event exposes "received since last poll", not full balance */
export interface WalletEventAmountOverride {
  assetId: number
  decimals: number
  /** Base units (microAlgos or ASA base units) */
  amountBaseUnits: bigint
}

export interface AgentContext {
  sender: string
  signer: TransactionSigner
  algorand: AlgorandClient
  variables: VariableContext
  blockOutputs: Map<string, Record<string, unknown>>
  log: (entry: Omit<LogEntry, 'timestamp'>) => void
  onNodeStatusChange: (nodeId: string, status: 'running' | 'success' | 'error' | 'idle') => void
  abortSignal: AbortSignal
  /** When set, `wallet-event` executor uses this instead of querying total balance (agent monitoring only) */
  walletEventOverride?: WalletEventAmountOverride
}

/**
 * Maps block IDs to node IDs so template variables like {{wallet-event.amount}}
 * can resolve even though blockOutputs is keyed by node ID.
 */
let _blockIdToNodeId: Map<string, string> = new Map()

export function setBlockIdMapping(nodes: FlowNode[]) {
  _blockIdToNodeId = new Map()
  for (const n of nodes) {
    _blockIdToNodeId.set(n.data.blockId, n.id)
  }
}

export function createVariableContext(): VariableContext {
  const variables: Record<string, unknown> = {}

  return {
    variables,
    set(name: string, value: unknown) {
      variables[name] = value
    },
    get(name: string) {
      return variables[name]
    },
    resolve(template: string, blockOutputs: Map<string, Record<string, unknown>>): string {
      return template.replace(/\{\{([^}]+)\}\}/g, (_match, key: string) => {
        const trimmed = key.trim()
        if (trimmed.includes('.')) {
          const [ref, outputName] = trimmed.split('.', 2)
          // Try direct node ID lookup first
          let outputs = blockOutputs.get(ref)
          // Fall back to block ID -> node ID lookup
          if (!outputs) {
            const nodeId = _blockIdToNodeId.get(ref)
            if (nodeId) outputs = blockOutputs.get(nodeId)
          }
          if (outputs && outputName in outputs) {
            return String(outputs[outputName])
          }
        }
        if (trimmed in variables) {
          return String(variables[trimmed])
        }
        return `{{${trimmed}}}`
      })
    },
  }
}

function topologicalSort(nodeIds: string[], edges: FlowEdge[]): string[] {
  const inDegree = new Map<string, number>()
  const outEdges = new Map<string, string[]>()
  for (const id of nodeIds) {
    inDegree.set(id, 0)
    outEdges.set(id, [])
  }
  for (const e of edges) {
    if (nodeIds.includes(e.source) && nodeIds.includes(e.target)) {
      outEdges.get(e.source)!.push(e.target)
      inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1)
    }
  }
  const queue = nodeIds.filter((id) => inDegree.get(id) === 0)
  const result: string[] = []
  while (queue.length > 0) {
    const u = queue.shift()!
    result.push(u)
    for (const v of outEdges.get(u) ?? []) {
      const d = (inDegree.get(v) ?? 1) - 1
      inDegree.set(v, d)
      if (d === 0) queue.push(v)
    }
  }
  return result
}

function getDownstreamNodes(
  nodeId: string,
  edges: FlowEdge[],
  sourceHandle?: string | null
): string[] {
  return edges
    .filter((e) => {
      if (e.source !== nodeId) return false
      if (sourceHandle !== undefined && sourceHandle !== null) {
        return e.sourceHandle === sourceHandle
      }
      return true
    })
    .map((e) => e.target)
}

function getUpstreamOutputs(
  nodeId: string,
  edges: FlowEdge[],
  blockOutputs: Map<string, Record<string, unknown>>
): Record<string, unknown> {
  const merged: Record<string, unknown> = {}
  for (const e of edges) {
    if (e.target === nodeId) {
      const outputs = blockOutputs.get(e.source)
      if (outputs) {
        Object.assign(merged, outputs)
      }
    }
  }
  return { ...merged }
}

function resolveConfig(
  config: Record<string, string | number | undefined>,
  ctx: AgentContext
): Record<string, string | number | undefined> {
  const resolved: Record<string, string | number | undefined> = {}
  for (const [key, val] of Object.entries(config)) {
    if (typeof val === 'string' && val.includes('{{')) {
      resolved[key] = ctx.variables.resolve(val, ctx.blockOutputs)
    } else {
      resolved[key] = val
    }
  }
  return resolved
}

export async function runFlowOnce(
  nodes: FlowNode[],
  edges: FlowEdge[],
  context: AgentContext,
  startFromNodeId?: string
): Promise<void> {
  setBlockIdMapping(nodes)
  const execEdges = normalizeComparatorEdgesForRun(nodes, edges)
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const allNodeIds = nodes.map((n) => n.id)
  const sorted = topologicalSort(allNodeIds, execEdges)

  const skipSet = new Set<string>()

  let startIndex = 0
  if (startFromNodeId) {
    startIndex = sorted.indexOf(startFromNodeId)
    if (startIndex < 0) startIndex = 0
  }

  for (let i = startIndex; i < sorted.length; i++) {
    if (context.abortSignal.aborted) break

    const nodeId = sorted[i]
    if (skipSet.has(nodeId)) continue

    const node = nodeMap.get(nodeId)
    if (!node) continue

    const blockId = node.data.blockId
    const def = getBlockById(blockId)
    if (!def) continue

    const blockName = def.name

    if (!startFromNodeId && def.category === ('trigger' as BlockCategory)) {
      context.log({ nodeId, blockId, blockName, type: 'trigger-fire', message: 'Trigger fired' })
      const executor = allExecutors[blockId]
      if (executor) {
        try {
          const output = await executor(node.data.config, context, {})
          if (output) {
            context.blockOutputs.set(nodeId, output)
            context.blockOutputs.set(blockId, output)
          }
        } catch { /* trigger errors are non-fatal */ }
      }
      context.onNodeStatusChange(nodeId, 'success')
      continue
    }

    const upstreamNodes = execEdges.filter((e) => e.target === nodeId).map((e) => e.source)
    const hasUpstreamOutput = upstreamNodes.some((uid) => context.blockOutputs.has(uid))
    if (upstreamNodes.length > 0 && !hasUpstreamOutput && !startFromNodeId) {
      skipSet.add(nodeId)
      const downstream = getDownstreamNodes(nodeId, execEdges)
      downstream.forEach((d) => skipSet.add(d))
      context.log({ nodeId, blockId, blockName, type: 'skip', message: 'Skipped (no upstream data)' })
      continue
    }

    context.onNodeStatusChange(nodeId, 'running')
    context.log({ nodeId, blockId, blockName, type: 'start', message: 'Executing...' })

    const upstreamOutputs = getUpstreamOutputs(nodeId, execEdges, context.blockOutputs)
    const resolvedConfig = resolveConfig(node.data.config, context)

    const executor = allExecutors[blockId]
    if (!executor) {
      context.log({ nodeId, blockId, blockName, type: 'skip', message: 'No executor registered' })
      context.onNodeStatusChange(nodeId, 'idle')
      continue
    }

    try {
      const output = await executor(resolvedConfig, context, upstreamOutputs)

      if (output === null) {
        context.log({ nodeId, blockId, blockName, type: 'skip', message: 'Filtered out (no downstream)' })
        context.onNodeStatusChange(nodeId, 'idle')
        const downstream = getDownstreamNodes(nodeId, execEdges)
        downstream.forEach((d) => skipSet.add(d))
        continue
      }

      context.blockOutputs.set(nodeId, output)
      context.blockOutputs.set(blockId, output)

      if (blockId === 'comparator') {
        const branch = output.branch as string
        const otherBranch = branch === 'true' ? 'false' : 'true'
        const skippedDownstream = getDownstreamNodes(nodeId, execEdges, otherBranch)
        skippedDownstream.forEach((d) => skipSet.add(d))
      }

      context.onNodeStatusChange(nodeId, 'success')
      const txId = (output as Record<string, unknown>)?.txId as string | undefined
      const successMsg = txId ? `Success (TxID: ${txId.slice(0, 10)}...)` : 'Completed'
      context.log({
        nodeId, blockId, blockName, type: 'success',
        message: successMsg,
        data: output,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      context.onNodeStatusChange(nodeId, 'error')
      context.log({ nodeId, blockId, blockName, type: 'error', message })
      const downstream = getDownstreamNodes(nodeId, execEdges)
      downstream.forEach((d) => skipSet.add(d))
    }
  }
}

export interface AgentHandle {
  stop: () => void
  pause: () => void
  resume: () => void
}

export function subscribeAgent(
  nodes: FlowNode[],
  edges: FlowEdge[],
  context: AgentContext,
  onStatusChange: (status: AgentStatus) => void,
  workflowId?: string | null,
  /** Fires once when a wallet-event trigger finishes runFlowOnce (success or failure). Timer-loop not included. */
  onWalletEventFlowComplete?: (result: { success: boolean; errorMessage?: string }) => void,
): AgentHandle {
  const bgIntervals: { clear: () => void }[] = []
  let paused = false
  const abortController = new AbortController()
  const ctxWithSignal: AgentContext = { ...context, abortSignal: abortController.signal }

  const triggerNodes = nodes.filter((n) => {
    const def = getBlockById(n.data.blockId)
    return def?.category === 'trigger'
  })

  onStatusChange('running')
  
  if (triggerNodes.length > 0) {
    console.log(`[Agent] Started with ${triggerNodes.length} trigger(s)`)
    context.log({
      nodeId: '', blockId: 'agent', blockName: 'Agent',
      type: 'info', message: `Agent started. Monitoring ${triggerNodes.length} trigger(s) for events...`,
    })
  }

  const hasOnChainActions = nodes.some((n) => {
    const id = n.data.blockId
    return ['send-payment', 'swap-token', 'opt-in-asa', 'create-asa', 'call-contract'].includes(id)
  })

  const scheduleIds: string[] = []

  for (const triggerNode of triggerNodes) {
    const blockId = triggerNode.data.blockId
    const config = triggerNode.data.config

    if (blockId === 'timer-loop') {
      const intervalSec = Number(config.interval || 60)
      const maxIterations = config.maxIterations ? Number(config.maxIterations) : Infinity
      let iteration = 0
      let scheduleId: string | null = null

      if (workflowId) {
        saveSchedule({
          workflowId,
          walletAddress: context.sender,
          intervalSec,
          maxIterations: maxIterations === Infinity ? null : maxIterations,
          requiresSigner: hasOnChainActions,
          flowJson: {
            nodes: nodes.map((n) => ({ id: n.id, data: n.data })),
            edges: edges.map((e) => ({ source: e.source, target: e.target })),
          },
        }).then((id) => {
          scheduleId = id
          if (id) scheduleIds.push(id)
        }).catch(() => {})
      }

      const handle = createDriftAwareRepeatingTimer(async () => {
        if (paused || abortController.signal.aborted) return
        if (iteration >= maxIterations) {
          context.log({
            nodeId: triggerNode.id, blockId, blockName: 'Timer Loop',
            type: 'info', message: `Max iterations (${maxIterations}) reached. Stopping.`,
          })
          handle.clear()
          return
        }
        iteration++
        ctxWithSignal.blockOutputs.set(triggerNode.id, { tick: Date.now(), iteration })
        context.onNodeStatusChange(triggerNode.id, 'success')
        context.log({
          nodeId: triggerNode.id, blockId, blockName: 'Timer Loop',
          type: 'trigger-fire', message: `Tick #${iteration} - Executing workflow...`,
        })

        if (scheduleId) {
          recordScheduleIteration(scheduleId, intervalSec).catch(() => {})
        }

        try {
          await runFlowOnce(nodes, edges, ctxWithSignal, triggerNode.id)
        } catch (err) {
          context.log({
            nodeId: triggerNode.id, blockId, blockName: 'Timer Loop',
            type: 'error', message: err instanceof Error ? err.message : String(err),
          })
        }
      }, intervalSec * 1000, { awaitAsync: true })
      bgIntervals.push(handle)
    }

    if (blockId === 'wallet-event') {
      const pollInterval = Number(config.pollInterval || 15)
      const assetId = Number(config.assetId ?? 0)
      const amountMode = String(config.amountMode ?? 'received') as 'received' | 'total'
      let lastRound = 0
      let lastLogTime = Date.now()
      let checkCount = 0
      /** Snapshot after each poll so we can compute net change (approx. "amount received") */
      let previousBalanceMicro: bigint | null = null
      let assetDecimals = 6

      const readBalanceMicro = (acct: Record<string, unknown>): bigint => {
        if (assetId === 0) {
          return BigInt(String(acct.amount ?? 0))
        }
        const assets = acct.assets as Array<Record<string, unknown>> | undefined
        const row = assets?.find((a) => Number(a['asset-id'] ?? a.assetId) === assetId)
        return BigInt(String(row?.amount ?? 0))
      }

      const handle = createBgInterval(async () => {
        checkCount++
        if (paused || abortController.signal.aborted) {
          if (abortController.signal.aborted) {
            console.warn(`[Wallet Event] Polling stopped - abort signal received. Checked ${checkCount} times.`)
            handle.clear() // Clear the interval immediately when abort signal is received
          }
          return
        }
        try {
          const algod = ctxWithSignal.algorand.client.algod
          const address = (config.address as string) || ctxWithSignal.sender
          if (assetId > 0 && checkCount === 1) {
            try {
              const assetInfo = await algod.getAssetByID(assetId).do()
              const ai = assetInfo as unknown as Record<string, unknown>
              const params = ai.params as Record<string, unknown> | undefined
              assetDecimals = Number(params?.decimals ?? ai.decimals ?? 6)
            } catch { /* keep 6 */ }
          }

          const info = (await algod.accountInformation(address).do()) as unknown as Record<string, unknown>
          const currentRound = Number(info['round'] ?? 0)
          const currentMicro = readBalanceMicro(info)

          console.log(`[Wallet Event] Check #${checkCount}: Round ${currentRound}, Last ${lastRound}`)
          
          const now = Date.now()
          if (now - lastLogTime > 60000) {
            const assetName = assetId === 0 ? 'ALGO' : `ASA #${assetId}`
            context.log({
              nodeId: triggerNode.id, blockId, blockName: 'Wallet Event',
              type: 'info', message: `Monitoring wallet for incoming ${assetName}... (round ${currentRound})`,
            })
            lastLogTime = now
          }

          if (lastRound > 0 && currentRound > lastRound) {
            let amountBaseUnits: bigint
            if (amountMode === 'total') {
              amountBaseUnits = currentMicro
            } else {
              if (previousBalanceMicro === null) {
                amountBaseUnits = 0n
              } else {
                const delta = currentMicro - previousBalanceMicro
                amountBaseUnits = delta > 0n ? delta : 0n
              }
            }

            if (amountMode === 'received' && amountBaseUnits === 0n) {
              context.log({
                nodeId: triggerNode.id, blockId, blockName: 'Wallet Event',
                type: 'info',
                message:
                  'New round detected but net change for this asset since the last check is 0. Skipping workflow. ' +
                  '(If you expected a deposit, it may land on the next poll, or use Amount mode = Total balance in the block.)',
              })
              previousBalanceMicro = currentMicro
              lastRound = currentRound
              return
            }

            context.onNodeStatusChange(triggerNode.id, 'success')
            context.log({
              nodeId: triggerNode.id, blockId, blockName: 'Wallet Event',
              type: 'trigger-fire', message: `New round: ${currentRound} - Activity detected! Executing workflow...`,
            })
            console.log(`[Wallet Event] TRIGGER FIRED at round ${currentRound}`)
            ctxWithSignal.walletEventOverride = {
              assetId,
              decimals: assetDecimals,
              amountBaseUnits,
            }
            try {
              await runFlowOnce(nodes, edges, ctxWithSignal)
              const allTxIds = Array.from(ctxWithSignal.blockOutputs.values())
                .map((output) => (output as Record<string, unknown>)?.txId as string | undefined)
                .filter((txId): txId is string => !!txId)
              // blockOutputs stores each node under nodeId and blockId, so values() duplicates txId
              const uniqueTxIds = [...new Set(allTxIds)]
              const txSummary = uniqueTxIds.length > 0 ? ` | Transactions: ${uniqueTxIds.join(', ')}` : ''
              context.log({
                nodeId: triggerNode.id, blockId, blockName: 'Wallet Event',
                type: 'info', message: `✓ Execution complete${txSummary}. Workflow finished. Stopping agent.`,
              })
              console.log(`[Wallet Event] Execution complete. Stopping agent.`)
              onWalletEventFlowComplete?.({ success: true })
              abortController.abort()
            } catch (execErr) {
              const msg = execErr instanceof Error ? execErr.message : String(execErr)
              context.log({
                nodeId: triggerNode.id, blockId, blockName: 'Wallet Event',
                type: 'error', message: `Execution failed: ${msg}`,
              })
              console.error(`[Wallet Event] Execution error:`, execErr)
              onWalletEventFlowComplete?.({ success: false, errorMessage: msg })
            } finally {
              delete ctxWithSignal.walletEventOverride
            }
          }
          previousBalanceMicro = currentMicro
          lastRound = currentRound
        } catch (err) {
          console.error(`[Wallet Event] Polling error on check #${checkCount}:`, err)
          context.log({
            nodeId: triggerNode.id, blockId, blockName: 'Wallet Event',
            type: 'error', message: err instanceof Error ? err.message : String(err),
          })
        }
      }, pollInterval * 1000, { awaitAsync: true })
      bgIntervals.push(handle)
      console.log(`[Wallet Event] Started polling with interval ${pollInterval}s for asset #${assetId}`)
    }
  }

  if (triggerNodes.length === 0) {
    runFlowOnce(nodes, edges, ctxWithSignal).then(() => {
      onStatusChange('idle')
    }).catch(() => {
      onStatusChange('error')
    })
  }

  return {
    stop() {
      console.warn(`[Agent] Stopping - abort signal being triggered`)
      paused = false
      abortController.abort()
      bgIntervals.forEach((h) => h.clear())
      bgIntervals.length = 0
      onStatusChange('stopped')
      nodes.forEach((n) => context.onNodeStatusChange(n.id, 'idle'))
      context.log({
        nodeId: '', blockId: 'agent', blockName: 'Agent',
        type: 'info', message: 'Agent stopped.',
      })
      if (workflowId) {
        deactivateSchedule(workflowId).catch(() => {})
      }
    },
    pause() {
      paused = true
      onStatusChange('paused')
    },
    resume() {
      paused = false
      onStatusChange('running')
    },
  }
}
