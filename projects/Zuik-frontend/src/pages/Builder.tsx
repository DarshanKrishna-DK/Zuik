import { useCallback, useRef, useMemo, useEffect, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
  BackgroundVariant,
  type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useWallet } from '@txnlab/use-wallet-react'
import { useSearchParams } from 'react-router-dom'

import Sidebar from '../components/flow/Sidebar'
import GenericNode from '../components/flow/GenericNode'
import TransactionPanel from '../components/flow/TransactionPanel'
import AgentControls from '../components/flow/AgentControls'
import ExecutionLog from '../components/flow/ExecutionLog'
import ChatPanel from '../components/flow/ChatPanel'
import TemplateGallery from '../components/flow/TemplateGallery'
import type { TemplateNode, TemplateEdge } from '../services/templateService'
import { getBlockById } from '../lib/blockRegistry'
import { isValidConnection } from '../lib/connectionValidator'
import { saveFlowToLocal, loadFlowFromLocal, clearFlowLocal, exportFlowJSON, importFlowJSON } from '../lib/flowSerializer'
import {
  type AgentStatus,
  type LogEntry,
  type AgentHandle,
  type FlowNode,
  type FlowEdge,
  createVariableContext,
  subscribeAgent,
  runFlowOnce,
} from '../lib/runAgent'
import { getAlgorandClient } from '../services/algorand'
import { materializeIntent, addNodesToCanvas } from '../lib/intentMaterializer'
import type { ParsedIntent, CanvasBlock } from '../services/intentParser'
import {
  isSupabaseConfigured, getWorkflow, createWorkflow, updateWorkflow,
  recordExecution, completeExecution,
} from '../services/supabase'
import { fetchAlgoUsdPrice } from '../services/transactionSimulator'

/* ── Inline SVG Icons ─────────────────────────────────── */

function MenuIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="18" y2="18" /></svg>
}
function SaveIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" /><path d="M7 3v4a1 1 0 0 0 1 1h7" /></svg>
}
function DownloadIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
}
function UploadIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" /></svg>
}
function TrashIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
}
function SparklesIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" /><path d="M20 3v4" /><path d="M22 5h-4" /></svg>
}
function ZapIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" /></svg>
}
function CheckIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
}
function LoaderIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
}
function LayoutGridIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" /></svg>
}
function ActivityIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" /></svg>
}

const nodeTypes = { generic: GenericNode }

let nodeIdCounter = 0
function nextNodeId() {
  return `node_${Date.now()}_${nodeIdCounter++}`
}

export default function Builder() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [transactionPanelOpen, setTransactionPanelOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [templateGalleryOpen, setTemplateGalleryOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle')
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [workflowId, setWorkflowId] = useState<string | null>(null)
  const [workflowName, setWorkflowName] = useState('Untitled Workflow')
  const [saveIndicator, setSaveIndicator] = useState<'idle' | 'saving' | 'saved'>('idle')
  const agentHandleRef = useRef<AgentHandle | null>(null)
  const rfInstance = useRef<ReactFlowInstance<Node, Edge> | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const { transactionSigner, activeAddress } = useWallet()
  const [searchParams] = useSearchParams()

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as HTMLElement)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  const onConnect = useCallback(
    (params: Connection) => {
      if (isValidConnection(params, nodes)) {
        setEdges((eds) => addEdge(params, eds))
      }
    },
    [nodes, setEdges],
  )

  const isConnectionValid = useCallback(
    (connection: Edge | Connection) => isValidConnection(connection as Connection, nodes),
    [nodes],
  )

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const blockId = e.dataTransfer.getData('application/zuik-block')
      if (!blockId) return

      const def = getBlockById(blockId)
      if (!def) return

      const bounds = wrapperRef.current?.getBoundingClientRect()
      const position = rfInstance.current?.screenToFlowPosition({
        x: e.clientX - (bounds?.left ?? 0),
        y: e.clientY - (bounds?.top ?? 0),
      }) ?? { x: 100, y: 100 }

      const newNode: Node = {
        id: nextNodeId(),
        type: 'generic',
        position,
        data: {
          blockId: def.id,
          config: {},
          label: def.name,
        },
      }
      setNodes((nds) => [...nds, newNode])
    },
    [setNodes],
  )

  useEffect(() => {
    const wfParam = searchParams.get('wf')
    if (wfParam && isSupabaseConfigured()) {
      getWorkflow(wfParam).then((wf) => {
        if (wf) {
          setWorkflowId(wf.id)
          setWorkflowName(wf.name)
          if (wf.flow_json?.nodes) setNodes(wf.flow_json.nodes as Node[])
          if (wf.flow_json?.edges) setEdges(wf.flow_json.edges as Edge[])
        }
      }).catch(() => {})
    } else {
      const saved = loadFlowFromLocal()
      if (saved && saved.nodes.length > 0) {
        setNodes(saved.nodes)
        setEdges(saved.edges)
      }
    }
  }, [searchParams, setNodes, setEdges])

  const saveToSupabase = useCallback(async () => {
    if (!activeAddress || !isSupabaseConfigured() || nodes.length === 0) return
    setSaveIndicator('saving')
    try {
      const flowJson = { nodes, edges }
      if (workflowId) {
        await updateWorkflow(workflowId, { name: workflowName, flow_json: flowJson })
      } else {
        const created = await createWorkflow(activeAddress, workflowName, flowJson)
        setWorkflowId(created.id)
        window.history.replaceState(null, '', `/builder?wf=${created.id}`)
      }
      setSaveIndicator('saved')
      setTimeout(() => setSaveIndicator('idle'), 2000)
    } catch (err) {
      console.error('Supabase save failed:', err)
      setSaveIndicator('idle')
    }
  }, [activeAddress, nodes, edges, workflowId, workflowName])

  useEffect(() => {
    if (nodes.length === 0) return
    const debounce = setTimeout(() => {
      saveFlowToLocal(nodes, edges)
      saveToSupabase()
    }, 3_000)
    return () => clearTimeout(debounce)
  }, [nodes, edges, saveToSupabase])

  useEffect(() => {
    fetchAlgoUsdPrice().catch(() => {})

    const handleKeyboard = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        saveFlowToLocal(nodes, edges)
        saveToSupabase()
      }
    }
    window.addEventListener('keydown', handleKeyboard)
    return () => {
      window.removeEventListener('keydown', handleKeyboard)
      agentHandleRef.current?.stop()
    }
  }, [nodes, edges, saveToSupabase])

  const updateNodeStatus = useCallback((nodeId: string, status: 'running' | 'success' | 'error' | 'idle') => {
    setNodes((nds) => nds.map((n) => {
      if (n.id === nodeId) {
        return { ...n, data: { ...n.data, executionStatus: status } }
      }
      return n
    }))
  }, [setNodes])

  const addLog = useCallback((entry: Omit<LogEntry, 'timestamp'>) => {
    setLogs((prev) => [...prev, { ...entry, timestamp: Date.now() }])
  }, [])

  const handleStartAgent = useCallback(async () => {
    if (!transactionSigner || !activeAddress) {
      addLog({ nodeId: '', blockId: '', blockName: 'System', type: 'error', message: 'Connect wallet first' })
      return
    }

    agentHandleRef.current?.stop()

    const flowNodes: FlowNode[] = nodes.map((n) => ({
      id: n.id,
      data: n.data as FlowNode['data'],
    }))
    const flowEdges: FlowEdge[] = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
    }))

    let execId: string | null = null
    const startTime = Date.now()
    if (workflowId && isSupabaseConfigured()) {
      try {
        execId = await recordExecution(workflowId, activeAddress, flowNodes.length)
      } catch { /* non-blocking */ }
    }

    const algorand = getAlgorandClient()
    const abortController = new AbortController()
    const variables = createVariableContext()
    const blockOutputs = new Map<string, Record<string, unknown>>()
    const collectedTxIds: string[] = []

    const wrappedLog = (entry: Omit<LogEntry, 'timestamp'>) => {
      addLog(entry)
      if (entry.type === 'success' && entry.data) {
        const txId = (entry.data as Record<string, unknown>)?.txId
        if (typeof txId === 'string') collectedTxIds.push(txId)
      }
    }

    const hasTriggers = flowNodes.some((n) => {
      const def = getBlockById((n.data as FlowNode['data']).blockId)
      return def?.category === 'trigger'
    })

    const finishExecution = async (status: 'success' | 'failed' | 'cancelled', errorMsg?: string) => {
      if (execId && isSupabaseConfigured()) {
        try {
          await completeExecution(execId, {
            status,
            txIds: collectedTxIds,
            errorMessage: errorMsg,
            durationMs: Date.now() - startTime,
          })
        } catch { /* non-blocking */ }
      }
    }

    if (hasTriggers) {
      const handle = subscribeAgent(flowNodes, flowEdges, {
        sender: activeAddress,
        signer: transactionSigner,
        algorand,
        variables,
        blockOutputs,
        log: wrappedLog,
        onNodeStatusChange: updateNodeStatus,
        abortSignal: abortController.signal,
      }, setAgentStatus, workflowId)
      const originalStop = handle.stop.bind(handle)
      handle.stop = () => { originalStop(); finishExecution('cancelled') }
      agentHandleRef.current = handle
    } else {
      setAgentStatus('running')
      runFlowOnce(flowNodes, flowEdges, {
        sender: activeAddress,
        signer: transactionSigner,
        algorand,
        variables,
        blockOutputs,
        log: wrappedLog,
        onNodeStatusChange: updateNodeStatus,
        abortSignal: abortController.signal,
      }).then(() => {
        setAgentStatus('idle')
        finishExecution('success')
      }).catch((err) => {
        setAgentStatus('error')
        finishExecution('failed', err instanceof Error ? err.message : String(err))
      })
      agentHandleRef.current = {
        stop() { abortController.abort(); setAgentStatus('stopped'); finishExecution('cancelled') },
        pause() { setAgentStatus('paused') },
        resume() { setAgentStatus('running') },
      }
    }
  }, [nodes, edges, transactionSigner, activeAddress, addLog, updateNodeStatus, workflowId])

  const handleIntentParsed = useCallback((intent: ParsedIntent) => {
    const materialized = materializeIntent(intent)
    const merged = addNodesToCanvas(nodes, edges, materialized.nodes, materialized.edges)
    setNodes(merged.nodes)
    setEdges(merged.edges)

    setTimeout(() => {
      rfInstance.current?.fitView({ padding: 0.2, duration: 500 })
    }, 100)
  }, [nodes, edges, setNodes, setEdges])

  const handleSave = () => {
    saveFlowToLocal(nodes, edges)
    saveToSupabase()
    setMenuOpen(false)
  }

  const handleExport = () => {
    const json = exportFlowJSON(nodes, edges)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `zuik-flow-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setMenuOpen(false)
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const data = importFlowJSON(reader.result as string)
        if (data) {
          setNodes(data.nodes)
          setEdges(data.edges)
        }
      }
      reader.readAsText(file)
    }
    input.click()
    setMenuOpen(false)
  }

  const handleClear = () => {
    agentHandleRef.current?.stop()
    setNodes([])
    setEdges([])
    setLogs([])
    setAgentStatus('idle')
    setWorkflowId(null)
    setWorkflowName('Untitled Workflow')
    clearFlowLocal()
    window.history.replaceState(null, '', '/builder')
    setMenuOpen(false)
  }

  const handleUseTemplate = useCallback((templateNodes: TemplateNode[], templateEdges: TemplateEdge[], name: string) => {
    const suffix = `_${Date.now()}`
    const idMap = new Map<string, string>()
    const newNodes = templateNodes.map((n) => {
      const newId = `${n.id}${suffix}`
      idMap.set(n.id, newId)
      return { ...n, id: newId, data: { ...n.data } }
    })
    const newEdges = templateEdges.map((e) => ({
      ...e,
      id: `${e.id}${suffix}`,
      source: idMap.get(e.source) ?? e.source,
      target: idMap.get(e.target) ?? e.target,
    }))

    setNodes(newNodes as Node[])
    setEdges(newEdges as Edge[])
    setWorkflowName(name)
    setWorkflowId(null)
    clearFlowLocal()
    window.history.replaceState(null, '', '/builder')

    setTimeout(() => {
      rfInstance.current?.fitView({ padding: 0.2, duration: 500 })
    }, 100)
  }, [setNodes, setEdges])

  const handleHighlightNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.map((n) => ({
      ...n,
      selected: n.id === nodeId,
    })))
    const node = nodes.find((n) => n.id === nodeId)
    if (node && rfInstance.current) {
      rfInstance.current.setCenter(node.position.x + 140, node.position.y + 60, { zoom: 1.2, duration: 400 })
    }
  }, [nodes, setNodes])

  const canvasBlocks: CanvasBlock[] = useMemo(() => {
    return nodes.map((n) => {
      const data = n.data as Record<string, unknown>
      const blockId = data.blockId as string
      const def = getBlockById(blockId)
      return {
        nodeId: n.id,
        blockId,
        blockName: def?.name ?? blockId,
        config: (data.config as Record<string, string | number | undefined>) ?? {},
      }
    }).filter((b) => b.blockId)
  }, [nodes])

  const minimapNodeColor = useMemo(() => {
    return (node: Node) => {
      const blockId = (node.data as Record<string, unknown>)?.blockId as string
      const def = getBlockById(blockId)
      if (!def) return '#3A3A42'
      const colors: Record<string, string> = {
        trigger: '#A78BFA', action: '#38BDF8', logic: '#FBBF24', notification: '#34D399', defi: '#E8913A',
      }
      return colors[def.category] ?? '#3A3A42'
    }
  }, [])

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <Sidebar />
      <div ref={wrapperRef} style={{ flex: 1, position: 'relative' }}>
        {/* Toolbar */}
        <div className="zuik-canvas-toolbar">
          <input
            className="zuik-wf-name-input"
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            onBlur={saveToSupabase}
            placeholder="Workflow name"
          />
          <div className="zuik-agent-separator" />

          <AgentControls
            status={agentStatus}
            onStart={handleStartAgent}
            onStop={() => agentHandleRef.current?.stop()}
            onPause={() => agentHandleRef.current?.pause()}
            onResume={() => agentHandleRef.current?.resume()}
            onToggleLog={() => setLogOpen((o) => !o)}
            logCount={logs.length}
          />
          <div className="zuik-agent-separator" />

          <button className="zuik-btn zuik-btn-primary zuik-btn-sm" onClick={() => setChatOpen((o) => !o)} title="AI Intent Assistant">
            <SparklesIcon /> AI
          </button>
          <button className="zuik-btn zuik-btn-ghost zuik-btn-sm" onClick={() => setTemplateGalleryOpen((o) => !o)} title="Starter Workflows">
            <LayoutGridIcon /> Templates
          </button>
          <div className="zuik-agent-separator" />

          {/* Hamburger Menu */}
          <div className="z-builder-menu" ref={menuRef}>
            <button
              className={`z-builder-menu-btn${menuOpen ? ' open' : ''}`}
              onClick={() => setMenuOpen((o) => !o)}
              title="More actions"
            >
              <MenuIcon />
            </button>
            {menuOpen && (
              <div className="z-builder-dropdown">
                <button onClick={handleSave}>
                  {saveIndicator === 'saving' ? <LoaderIcon /> : saveIndicator === 'saved' ? <CheckIcon /> : <SaveIcon />}
                  {saveIndicator === 'saving' ? 'Saving...' : saveIndicator === 'saved' ? 'Saved' : 'Save'}
                </button>
                <button onClick={handleExport}><DownloadIcon /> Export JSON</button>
                <button onClick={handleImport}><UploadIcon /> Import JSON</button>
                <div className="z-dropdown-sep" />
                <button onClick={() => { setTransactionPanelOpen(true); setMenuOpen(false) }}>
                  <ZapIcon /> Simulate
                </button>
                <button onClick={() => { setLogOpen((o) => !o); setMenuOpen(false) }}>
                  <ActivityIcon /> Execution Log
                </button>
                <div className="z-dropdown-sep" />
                <button onClick={handleClear} style={{ color: 'var(--z-error)' }}><TrashIcon /> Clear Canvas</button>
              </div>
            )}
          </div>
        </div>

        <TransactionPanel
          isOpen={transactionPanelOpen}
          onClose={() => setTransactionPanelOpen(false)}
          nodes={nodes}
          edges={edges}
          onHighlightNode={handleHighlightNode}
        />
        <ExecutionLog
          isOpen={logOpen}
          onClose={() => setLogOpen(false)}
          logs={logs}
          onClear={() => setLogs([])}
        />
        <ChatPanel
          isOpen={chatOpen}
          onClose={() => setChatOpen(false)}
          onIntentParsed={handleIntentParsed}
          canvasBlocks={canvasBlocks}
        />
        <TemplateGallery
          isOpen={templateGalleryOpen}
          onClose={() => setTemplateGalleryOpen(false)}
          onUseTemplate={handleUseTemplate}
        />
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isConnectionValid}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onInit={(inst) => { rfInstance.current = inst }}
          nodeTypes={nodeTypes}
          fitView
          snapToGrid
          snapGrid={[16, 16]}
          deleteKeyCode={['Backspace', 'Delete']}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#2A2A30" />
          <Controls />
          <MiniMap
            nodeColor={minimapNodeColor}
            maskColor="rgba(12,12,14,0.7)"
            style={{ borderRadius: 8 }}
          />
        </ReactFlow>
        <button
          className="zuik-simulate-fab"
          onClick={() => setTransactionPanelOpen(true)}
          title="Simulate & Sign Transactions"
        >
          <ZapIcon /> Simulate
        </button>
      </div>
    </div>
  )
}
