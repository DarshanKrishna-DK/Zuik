import type { ExecutorFn } from './index'
import { globalEventBus } from '../multiAgentExecutor'
import { getWorkflow, isSupabaseConfigured } from '../../services/supabase'

// Multi-Agent block executors
// Note: Most multi-agent blocks are handled in the multiAgentExecutor.ts file
// These executors are for cases where the blocks need standard executor integration

export const multiAgentExecutors: Record<string, ExecutorFn> = {
  // Merge Gate - handled in multiAgentExecutor, but needs executor for standard mode
  merge_gate: async (config, context, upstreamOutputs) => {
    // In standard execution mode, merge gate acts like a simple merge
    const mode = config.mode as string || 'ALL'
    const inputKeys = Object.keys(upstreamOutputs || {})
    
    if (mode === 'ANY' && inputKeys.length > 0) {
      return { 
        gate_fired: true, 
        mode: 'ANY',
        result: upstreamOutputs?.[inputKeys[0]]
      }
    }
    
    if (mode === 'ALL' || mode === 'SEQUENCE') {
      return {
        gate_fired: true,
        mode,
        results: upstreamOutputs
      }
    }
    
    return null // Don't fire
  },

  // Fork - creates parallel execution branches
  fork: async (config, context, upstreamOutputs) => {
    const branchCount = Number(config.branch_count) || 2
    
    return {
      fork_executed: true,
      branch_count: branchCount,
      input_data: upstreamOutputs,
      timestamp: Date.now()
    }
  },

  // Join - waits for multiple inputs
  join: async (config, context, upstreamOutputs) => {
    const strategy = config.strategy as string || 'all'
    const requiredN = Number(config.n) || 2
    const inputKeys = Object.keys(upstreamOutputs || {})
    
    let canJoin = false
    
    switch (strategy) {
      case 'any':
        canJoin = inputKeys.length > 0
        break
      case 'all':
        canJoin = inputKeys.length >= 2 // Assume we need at least 2 inputs for a join
        break
      case 'n_of_m':
        canJoin = inputKeys.length >= requiredN
        break
    }
    
    if (canJoin) {
      return {
        join_completed: true,
        strategy,
        input_count: inputKeys.length,
        results: upstreamOutputs
      }
    }
    
    return null // Not ready to join yet
  },

  // Event Trigger - listens for events
  event_trigger: async (config, context, upstreamOutputs) => {
    const eventName = config.event_name as string
    const filterKey = config.filter_key as string
    const filterValue = config.filter_value as string
    
    if (!eventName) {
      throw new Error('Event name is required for event trigger')
    }
    
    // Check event history for immediate firing
    const eventHistory = globalEventBus.getEventHistory(eventName)
    
    for (const event of [...eventHistory].reverse()) {
      if (filterKey && filterValue) {
        if (event[filterKey] === filterValue) {
          return {
            event_triggered: true,
            event_name: eventName,
            event_data: event,
            source: 'history'
          }
        }
      } else {
        return {
          event_triggered: true,
          event_name: eventName,
          event_data: event,
          source: 'history'
        }
      }
    }
    
    // No matching event in history; multi-agent engine wires listeners during orchestration.
    context.log({
      nodeId: context.currentNodeId || 'unknown',
      blockId: 'event_trigger',
      blockName: 'Event Trigger',
      type: 'waiting',
      message: `Waiting for event: ${eventName}`
    })
    
    return null
  },

  // Event Emit - publishes events
  event_emit: async (config, context, upstreamOutputs) => {
    const eventName = config.event_name as string
    const payloadTemplate = config.payload_template as string
    
    if (!eventName) {
      throw new Error('Event name is required for event emit')
    }
    
    // Prepare event payload
    let eventData: any = upstreamOutputs || {}
    
    if (payloadTemplate) {
      try {
        // Simple template replacement
        let processedTemplate = payloadTemplate
        
        // Replace {{key}} with values from upstream outputs and context
        const allData = {
          ...upstreamOutputs,
          timestamp: Date.now(),
          nodeId: context.currentNodeId,
          workflowId: context.workflowId
        }
        
        for (const [key, value] of Object.entries(allData)) {
          const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
          processedTemplate = processedTemplate.replace(regex, String(value))
        }
        
        eventData = JSON.parse(processedTemplate)
      } catch (error) {
        throw new Error(`Failed to process payload template: ${error}`)
      }
    }
    
    // Publish event to global event bus
    await globalEventBus.publishEvent(
      eventName,
      eventData as Record<string, unknown>,
      context,
    )
    
    context.log({
      nodeId: context.currentNodeId || 'unknown',
      blockId: 'event_emit',
      blockName: 'Event Emit',
      type: 'success',
      message: `Published event: ${eventName}`
    })
    
    return {
      event_published: true,
      event_name: eventName,
      payload: eventData,
      timestamp: Date.now()
    }
  },

  spawn_agent: async (config, context, upstreamOutputs) => {
    const subFlowId = String(config.sub_flow_id ?? '').trim()
    const mode = (config.mode as string) || 'parallel'
    const passContext = String(config.pass_context ?? '') === 'true'

    if (!subFlowId) {
      throw new Error('Sub-workflow ID is required for spawn agent')
    }
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase is not configured; cannot load child workflow')
    }

    const row = await getWorkflow(subFlowId)
    const fj = row?.flow_json as { nodes?: unknown[]; edges?: unknown[] } | undefined
    if (!fj?.nodes || !fj.edges) {
      throw new Error(`Child workflow not found: ${subFlowId}`)
    }

    const { runMultiAgentWorkflow } = await import('../runAgent')
    const childContext = {
      ...context,
      workflowId: subFlowId,
      parentWorkflowId: context.workflowId,
      variables: passContext ? context.variables : context.variables,
    }

    if (mode === 'race' || mode === 'parallel') {
      void runMultiAgentWorkflow(
        fj.nodes as Parameters<typeof runMultiAgentWorkflow>[0],
        fj.edges as Parameters<typeof runMultiAgentWorkflow>[1],
        childContext,
      )
    } else {
      await runMultiAgentWorkflow(
        fj.nodes as Parameters<typeof runMultiAgentWorkflow>[0],
        fj.edges as Parameters<typeof runMultiAgentWorkflow>[1],
        childContext,
      )
    }

    context.log({
      nodeId: context.currentNodeId || 'unknown',
      blockId: 'spawn_agent',
      blockName: 'Spawn Agent',
      type: 'success',
      message: `Spawned workflow ${subFlowId} (${mode})`,
    })

    return {
      agent_spawned: true,
      sub_flow_id: subFlowId,
      mode,
      pass_context: passContext,
      spawn_time: Date.now(),
      agent_id: subFlowId,
    }
  },

  // Watchdog: real timeout and branch routing run in multiAgentExecutor.processWatchdog.
  // This executor only runs for linear `runFlowOnce` paths without multi-agent orchestration.
  watchdog: async (config, context, upstreamOutputs) => {
    const timeoutSeconds = Number(config.timeout_seconds) || 300
    const onTimeout = (config.on_timeout as string) || 'cancel'
    context.log({
      nodeId: context.currentNodeId || 'unknown',
      blockId: 'watchdog',
      blockName: 'Watchdog',
      type: 'info',
      message:
        'Watchdog metadata only in this mode. Use Start Agent or a flow with multi-agent blocks for timed routing.',
    })
    return {
      watchdog_active: true,
      timeout_seconds: timeoutSeconds,
      on_timeout: onTimeout,
      monitored_data: upstreamOutputs,
      start_time: Date.now(),
    }
  },
}