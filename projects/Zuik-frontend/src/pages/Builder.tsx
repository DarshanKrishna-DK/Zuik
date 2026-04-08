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

import Sidebar from '../components/flow/Sidebar'
import GenericNode from '../components/flow/GenericNode'
import TransactionPanel from '../components/flow/TransactionPanel'
import AgentControls from '../components/flow/AgentControls'
import ExecutionLog from '../components/flow/ExecutionLog'
import ChatPanel from '../components/flow/ChatPanel'
import { getBlockById } from '../lib/blockRegistry'
import { isValidConnection } from '../lib/connectionValidator'
import { saveFlowToLocal, loadFlowFromLocal, exportFlowJSON, importFlowJSON } from '../lib/flowSerializer'
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
import type { ParsedIntent } from '../services/intentParser'
import { Save, Download, Upload, Trash2, Sparkles, Zap } from 'lucide-react'

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
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle')
  const [logs, setLogs] = useState<LogEntry[]>([])
  const agentHandleRef = useRef<AgentHandle | null>(null)
  const rfInstance = useRef<ReactFlowInstance<Node, Edge> | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const { transactionSigner, activeAddress } = useWallet()

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
    const saved = loadFlowFromLocal()
    if (saved && saved.nodes.length > 0) {
      setNodes(saved.nodes)
      setEdges(saved.edges)
    }
  }, [setNodes, setEdges])

  useEffect(() => {
    const timer = setInterval(() => {
      saveFlowToLocal(nodes, edges)
    }, 30_000)
    return () => clearInterval(timer)
  }, [nodes, edges])

  useEffect(() => {
    return () => {
      agentHandleRef.current?.stop()
    }
  }, [])

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

  const handleStartAgent = useCallback(() => {
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

    const algorand = getAlgorandClient()
    const abortController = new AbortController()
    const variables = createVariableContext()
    const blockOutputs = new Map<string, Record<string, unknown>>()

    const hasTriggers = flowNodes.some((n) => {
      const def = getBlockById((n.data as FlowNode['data']).blockId)
      return def?.category === 'trigger'
    })

    if (hasTriggers) {
      const handle = subscribeAgent(flowNodes, flowEdges, {
        sender: activeAddress,
        signer: transactionSigner,
        algorand,
        variables,
        blockOutputs,
        log: addLog,
        onNodeStatusChange: updateNodeStatus,
        abortSignal: abortController.signal,
      }, setAgentStatus)
      agentHandleRef.current = handle
    } else {
      setAgentStatus('running')
      runFlowOnce(flowNodes, flowEdges, {
        sender: activeAddress,
        signer: transactionSigner,
        algorand,
        variables,
        blockOutputs,
        log: addLog,
        onNodeStatusChange: updateNodeStatus,
        abortSignal: abortController.signal,
      }).then(() => {
        setAgentStatus('idle')
      }).catch(() => {
        setAgentStatus('error')
      })
      agentHandleRef.current = {
        stop() { abortController.abort(); setAgentStatus('stopped') },
        pause() { setAgentStatus('paused') },
        resume() { setAgentStatus('running') },
      }
    }
  }, [nodes, edges, transactionSigner, activeAddress, addLog, updateNodeStatus])

  const handleIntentParsed = useCallback((intent: ParsedIntent) => {
    const materialized = materializeIntent(intent)
    const merged = addNodesToCanvas(nodes, edges, materialized.nodes, materialized.edges)
    setNodes(merged.nodes)
    setEdges(merged.edges)

    setTimeout(() => {
      rfInstance.current?.fitView({ padding: 0.2, duration: 500 })
    }, 100)
  }, [nodes, edges, setNodes, setEdges])

  const handleSave = () => saveFlowToLocal(nodes, edges)

  const handleExport = () => {
    const json = exportFlowJSON(nodes, edges)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `zuik-flow-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
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
  }

  const handleClear = () => {
    agentHandleRef.current?.stop()
    setNodes([])
    setEdges([])
    setLogs([])
    setAgentStatus('idle')
  }

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

  const minimapNodeColor = useMemo(() => {
    return (node: Node) => {
      const blockId = (node.data as Record<string, unknown>)?.blockId as string
      const def = getBlockById(blockId)
      if (!def) return '#3F3F46'
      const colors: Record<string, string> = {
        trigger: '#8B5CF6', action: '#3B82F6', logic: '#EAB308', notification: '#22C55E', defi: '#F97316',
      }
      return colors[def.category] ?? '#3F3F46'
    }
  }, [])

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <Sidebar />
      <div ref={wrapperRef} style={{ flex: 1, position: 'relative' }}>
        <div className="zuik-canvas-toolbar">
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
          <button className="zuik-btn zuik-btn-primary zuik-btn-sm" onClick={() => setTransactionPanelOpen(true)} title="Simulate and Execute">
            <Zap size={14} /> Execute
          </button>
          <button className="zuik-btn zuik-btn-primary zuik-btn-sm" onClick={() => setChatOpen((o) => !o)} title="AI Intent Assistant">
            <Sparkles size={14} /> AI
          </button>
          <div className="zuik-agent-separator" />
          <button className="zuik-btn zuik-btn-ghost zuik-btn-sm" onClick={handleSave} title="Save"><Save size={14} /> Save</button>
          <button className="zuik-btn zuik-btn-ghost zuik-btn-sm" onClick={handleExport} title="Export"><Download size={14} /> Export</button>
          <button className="zuik-btn zuik-btn-ghost zuik-btn-sm" onClick={handleImport} title="Import"><Upload size={14} /> Import</button>
          <button className="zuik-btn zuik-btn-ghost zuik-btn-sm" onClick={handleClear} title="Clear"><Trash2 size={14} /> Clear</button>
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
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#27272A" />
          <Controls />
          <MiniMap
            nodeColor={minimapNodeColor}
            maskColor="rgba(0,0,0,0.7)"
            style={{ borderRadius: 8 }}
          />
        </ReactFlow>
      </div>
    </div>
  )
}
