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

const VIEWPORT_STORAGE_KEY = 'zuik_builder_viewport'

function readStoredViewport(): { x: number; y: number; zoom: number } | null {
  try {
    const raw = sessionStorage.getItem(VIEWPORT_STORAGE_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as { x?: number; y?: number; zoom?: number }
    if (typeof v.x === 'number' && typeof v.y === 'number' && typeof v.zoom === 'number') {
      return { x: v.x, y: v.y, zoom: v.zoom }
    }
  } catch { /* ignore */ }
  return null
}

function persistViewportFrom(inst: ReactFlowInstance<Node, Edge> | null) {
  if (!inst) return
  try {
    sessionStorage.setItem(VIEWPORT_STORAGE_KEY, JSON.stringify(inst.getViewport()))
  } catch { /* ignore */ }
}
import '@xyflow/react/dist/style.css'
import { useWallet } from '@txnlab/use-wallet-react'
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom'

import Sidebar from '../components/flow/Sidebar'
import GenericNode from '../components/flow/GenericNode'
import TransactionPanel from '../components/flow/TransactionPanel'
import AgentControls from '../components/flow/AgentControls'
import ExecutionLog from '../components/flow/ExecutionLog'
import ChatPanel from '../components/flow/ChatPanel'
import SchedulePanel from '../components/flow/SchedulePanel'
import TemplateGallery from '../components/flow/TemplateGallery'
import * as XLSX from 'xlsx'
import type { WorkflowTemplate, TemplateNode, TemplateEdge } from '../services/templateService'
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
  runMultiAgentWorkflow,
} from '../lib/runAgent'
import { getAlgorandClient } from '../services/algorand'
import { materializeIntent, addNodesToCanvas } from '../lib/intentMaterializer'
import type { ParsedIntent, CanvasBlock, UserContext } from '../services/intentParser'
import {
  isSupabaseConfigured, getWorkflow, createWorkflow, updateWorkflow,
  recordExecution, completeExecution, listWorkflows,
} from '../services/supabase'
import { WorkflowSelectOptionsProvider } from '../context/WorkflowSelectOptionsContext'
import { fetchAlgoUsdPrice, estimateStepFee } from '../services/transactionSimulator'
import { scheduleWorkflowStart, deactivateSchedule } from '../services/workflowScheduler'

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
function PlusIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="5" y2="19" /><line x1="5" x2="19" y1="12" y2="12" /></svg>
}
function TrashIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
}
function BrainCircuitIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M19.938 10.5a4 4 0 0 1 .585.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M19.967 17.484A4 4 0 0 1 18 18"/></svg>
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
function ClockIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
}

const nodeTypes = { generic: GenericNode }

let nodeIdCounter = 0
function nextNodeId() {
  return `node_${Date.now()}_${nodeIdCounter++}`
}

const MAX_HISTORY = 50
const PAYROLL_TEMPLATE_ID = 'employee-payroll'

type PayrollRow = {
  id: string
  name: string
  wallet: string
  amount: number
  assetId: number
}

const DEFAULT_PAYROLL_ROWS: PayrollRow[] = [
  { id: 'row_1', name: 'Ava Patel', wallet: 'REPLACE_WITH_ADDRESS_1', amount: 12, assetId: 0 },
  { id: 'row_2', name: 'Noah Kim', wallet: 'REPLACE_WITH_ADDRESS_2', amount: 8, assetId: 0 },
  { id: 'row_3', name: 'Maya Singh', wallet: 'REPLACE_WITH_ADDRESS_3', amount: 15, assetId: 0 },
]

function createPayrollRow(overrides: Partial<PayrollRow> = {}): PayrollRow {
  return {
    id: `row_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    name: '',
    wallet: '',
    amount: 0,
    assetId: 0,
    ...overrides,
  }
}

export default function Builder() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [transactionPanelOpen, setTransactionPanelOpen] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [templateGalleryOpen, setTemplateGalleryOpen] = useState(false)
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null)
  const [payrollRows, setPayrollRows] = useState<PayrollRow[]>([])
  const [menuOpen, setMenuOpen] = useState(false)
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle')
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [workflowId, setWorkflowId] = useState<string | null>(null)
  const workflowIdRef = useRef<string | null>(null)
  const [workflowName, setWorkflowName] = useState('Untitled Workflow')
  const [workflowSpawnSelectOptions, setWorkflowSpawnSelectOptions] = useState<{ value: string; label: string }[]>([])
  const [saveIndicator, setSaveIndicator] = useState<'idle' | 'saving' | 'saved'>('idle')
  const savingRef = useRef(false)
  const [isDirty, setIsDirty] = useState(false)
  const agentHandleRef = useRef<AgentHandle | null>(null)
  const rfInstance = useRef<ReactFlowInstance<Node, Edge> | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [rfReady, setRfReady] = useState(false)
  const [flowHydrated, setFlowHydrated] = useState(false)
  const viewBootDone = useRef(false)
  const prevWfParamRef = useRef<string | null>(null)
  const { transactionSigner, activeAddress } = useWallet()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [prefillIntent, setPrefillIntent] = useState<string | null>(null)
  const prefillAppliedRef = useRef<string | null>(null)

  const refreshSpawnWorkflowOptions = useCallback(async () => {
    if (!activeAddress || !isSupabaseConfigured()) {
      setWorkflowSpawnSelectOptions([])
      return
    }
    try {
      const rows = await listWorkflows(activeAddress)
      setWorkflowSpawnSelectOptions(
        rows.map((r) => ({ value: r.id, label: r.name?.trim() ? r.name : r.id })),
      )
    } catch {
      setWorkflowSpawnSelectOptions([])
    }
  }, [activeAddress])

  useEffect(() => {
    void refreshSpawnWorkflowOptions()
  }, [refreshSpawnWorkflowOptions])

  useEffect(() => {
    const state = location.state as { prefillIntent?: string } | null
    if (state?.prefillIntent && state.prefillIntent !== prefillAppliedRef.current) {
      setChatOpen(true)
      setPrefillIntent(state.prefillIntent)
      prefillAppliedRef.current = state.prefillIntent
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null })
    }
  }, [location, navigate])

  // Undo/Redo history
  const undoStack = useRef<{ nodes: Node[]; edges: Edge[] }[]>([])
  const redoStack = useRef<{ nodes: Node[]; edges: Edge[] }[]>([])
  const skipHistory = useRef(false)

  const pushHistory = useCallback(() => {
    if (skipHistory.current) return
    undoStack.current.push({ nodes: structuredClone(nodes), edges: structuredClone(edges) })
    if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift()
    redoStack.current = []
  }, [nodes, edges])

  // Capture state before React Flow changes
  const wrappedOnNodesChange: typeof onNodesChange = useCallback((changes) => {
    const hasRemoval = changes.some((c) => c.type === 'remove')
    if (hasRemoval) pushHistory()
    onNodesChange(changes)
  }, [onNodesChange, pushHistory])

  const wrappedOnEdgesChange: typeof onEdgesChange = useCallback((changes) => {
    const hasRemoval = changes.some((c) => c.type === 'remove')
    if (hasRemoval) pushHistory()
    onEdgesChange(changes)
  }, [onEdgesChange, pushHistory])

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

  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      rfInstance.current?.updateNodeInternals(node.id)
    },
    [],
  )

  const buildFlowJson = useCallback(() => {
    return {
      nodes: nodes.map((n) => ({
        id: n.id,
        data: n.data as FlowNode['data'],
      })),
      edges: edges.map((e) => ({
        source: e.source,
        target: e.target,
      })),
    }
  }, [nodes, edges])

  const requiresSigner = useMemo(() => {
    const signerBlocks = new Set(['swap-token', 'send-payment', 'opt-in-asa', 'create-asa', 'call-contract'])
    return nodes.some((node) => {
      const blockId = (node.data as Record<string, unknown>)?.blockId as string | undefined
      return blockId ? signerBlocks.has(blockId) : false
    })
  }, [nodes])

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
    if (prevWfParamRef.current !== null && prevWfParamRef.current !== wfParam) {
      try { sessionStorage.removeItem(VIEWPORT_STORAGE_KEY) } catch { /* ignore */ }
    }
    prevWfParamRef.current = wfParam

    viewBootDone.current = false
    setFlowHydrated(false)
    if (wfParam && isSupabaseConfigured()) {
      setNodes([])
      setEdges([])
      getWorkflow(wfParam)
        .then((wf) => {
          if (wf) {
            workflowIdRef.current = wf.id
            setWorkflowId(wf.id)
            setWorkflowName(wf.name)
            if (wf.flow_json?.nodes) setNodes(wf.flow_json.nodes as Node[])
            if (wf.flow_json?.edges) setEdges(wf.flow_json.edges as Edge[])
          }
        })
        .catch(() => {})
        .finally(() => setFlowHydrated(true))
    } else {
      const saved = loadFlowFromLocal()
      if (saved && saved.nodes.length > 0) {
        setNodes(saved.nodes)
        setEdges(saved.edges)
      }
      setFlowHydrated(true)
    }
  }, [searchParams, setNodes, setEdges])

  useEffect(() => {
    if (!rfReady || !flowHydrated || viewBootDone.current) return
    const inst = rfInstance.current
    if (!inst) return
    const stored = readStoredViewport()
    if (stored) {
      inst.setViewport(stored, { duration: 0 })
    } else if (nodes.length > 0) {
      inst.fitView({ padding: 0.2 })
      persistViewportFrom(inst)
    } else {
      inst.setViewport({ x: 0, y: 0, zoom: 0.7 }, { duration: 0 })
      persistViewportFrom(inst)
    }
    viewBootDone.current = true
  }, [rfReady, flowHydrated, nodes.length])

  const saveToSupabase = useCallback(async () => {
    if (!activeAddress || !isSupabaseConfigured() || nodes.length === 0) return
    if (savingRef.current) return
    savingRef.current = true
    setSaveIndicator('saving')
    try {
      const flowJson = { nodes, edges }
      const existingId = workflowIdRef.current
      if (existingId) {
        await updateWorkflow(existingId, { name: workflowName, flow_json: flowJson })
      } else {
        const created = await createWorkflow(activeAddress, workflowName, flowJson)
        workflowIdRef.current = created.id
        setWorkflowId(created.id)
        window.history.replaceState(null, '', `/builder?wf=${created.id}`)
      }
      setIsDirty(false)
      setSaveIndicator('saved')
      await refreshSpawnWorkflowOptions()
      setTimeout(() => setSaveIndicator('idle'), 2000)
    } catch (err) {
      console.error('Supabase save failed:', err)
      setSaveIndicator('idle')
    } finally {
      savingRef.current = false
    }
  }, [activeAddress, nodes, edges, workflowName, refreshSpawnWorkflowOptions])

  useEffect(() => {
    if (nodes.length === 0) return
    if (flowHydrated) setIsDirty(true)
    const debounce = setTimeout(() => {
      saveFlowToLocal(nodes, edges)
    }, 3_000)
    return () => clearTimeout(debounce)
  }, [nodes, edges, flowHydrated])

  // Fetch ALGO price once on mount
  useEffect(() => {
    fetchAlgoUsdPrice().catch(() => {})
  }, [])

  useEffect(() => {
    const handleKeyboard = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        saveFlowToLocal(nodes, edges)
        saveToSupabase()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        const prev = undoStack.current.pop()
        if (prev) {
          redoStack.current.push({ nodes: structuredClone(nodes), edges: structuredClone(edges) })
          skipHistory.current = true
          setNodes(prev.nodes)
          setEdges(prev.edges)
          skipHistory.current = false
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Z') {
        e.preventDefault()
        const next = redoStack.current.pop()
        if (next) {
          undoStack.current.push({ nodes: structuredClone(nodes), edges: structuredClone(edges) })
          skipHistory.current = true
          setNodes(next.nodes)
          setEdges(next.edges)
          skipHistory.current = false
        }
      }
    }
    window.addEventListener('keydown', handleKeyboard)
    return () => {
      window.removeEventListener('keydown', handleKeyboard)
    }
  }, [nodes, edges, saveToSupabase])

  // Cleanup agent on component unmount only
  useEffect(() => {
    return () => {
      agentHandleRef.current?.stop()
    }
  }, [])

  // Warn before browser close / tab switch if unsaved changes
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

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

    setLogOpen(true)

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
    let execFinalized = false
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
    let totalFeesMicroalgo = 0

    const wrappedLog = (entry: Omit<LogEntry, 'timestamp'>) => {
      addLog(entry)
      if (entry.type === 'success' && entry.data) {
        const txId = (entry.data as Record<string, unknown>)?.txId
        if (typeof txId === 'string' && txId) {
          collectedTxIds.push(txId)
          totalFeesMicroalgo += estimateStepFee(entry.blockId)
        }
      }
    }

    const hasTriggers = flowNodes.some((n) => {
      const def = getBlockById((n.data as FlowNode['data']).blockId)
      return def?.category === 'trigger'
    })

    const finishExecution = async (status: 'success' | 'failed' | 'cancelled', errorMsg?: string) => {
      if (!execId || !isSupabaseConfigured() || execFinalized) return
      try {
        await completeExecution(execId, {
          status,
          txIds: [...new Set(collectedTxIds)],
          errorMessage: errorMsg,
          durationMs: Date.now() - startTime,
          totalFeesMicroalgo,
        })
        execFinalized = true
      } catch { /* non-blocking */ }
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
        workflowId: workflowId ?? undefined,
      }, setAgentStatus, workflowId, (evResult) => {
        setAgentStatus('idle')
        if (evResult.success) {
          void finishExecution('success')
        } else {
          void finishExecution('failed', evResult.errorMessage)
        }
      })
      const originalStop = handle.stop.bind(handle)
      handle.stop = () => {
        originalStop()
        if (!execFinalized) void finishExecution('cancelled')
      }
      agentHandleRef.current = handle
    } else {
      setAgentStatus('running')
      runMultiAgentWorkflow(flowNodes, flowEdges, {
        sender: activeAddress,
        signer: transactionSigner,
        algorand,
        variables,
        blockOutputs,
        log: wrappedLog,
        onNodeStatusChange: updateNodeStatus,
        abortSignal: abortController.signal,
        workflowId: workflowId ?? undefined,
      }).then(() => {
        setAgentStatus('idle')
        void finishExecution('success')
      }).catch((err) => {
        setAgentStatus('error')
        void finishExecution('failed', err instanceof Error ? err.message : String(err))
      })
      agentHandleRef.current = {
        stop() {
          abortController.abort()
          setAgentStatus('stopped')
          if (!execFinalized) void finishExecution('cancelled')
        },
        pause() { setAgentStatus('paused') },
        resume() { setAgentStatus('running') },
      }
    }
  }, [nodes, edges, transactionSigner, activeAddress, addLog, updateNodeStatus, workflowId])

  const handleScheduleRun = useCallback(async (runAtLocal: string) => {
    if (!activeAddress) {
      return { ok: false, message: 'Connect your wallet to schedule a run.' }
    }
    if (!isSupabaseConfigured()) {
      return { ok: false, message: 'Supabase is not configured for this project.' }
    }
    if (nodes.length === 0) {
      return { ok: false, message: 'Add blocks to the workflow before scheduling.' }
    }

    const runAt = new Date(runAtLocal)
    if (Number.isNaN(runAt.getTime())) {
      return { ok: false, message: 'Pick a valid date and time.' }
    }
    if (runAt.getTime() < Date.now()) {
      return { ok: false, message: 'Scheduled time must be in the future.' }
    }

    if (!workflowIdRef.current) {
      await saveToSupabase()
    }
    const id = workflowIdRef.current
    if (!id) {
      return { ok: false, message: 'Save the workflow before scheduling.' }
    }

    const flowJson = buildFlowJson()
    const scheduleId = await scheduleWorkflowStart({
      workflowId: id,
      walletAddress: activeAddress,
      runAtIso: runAt.toISOString(),
      requiresSigner,
      flowJson,
    })
    if (!scheduleId) {
      return { ok: false, message: 'Could not save schedule. Check Supabase connection.' }
    }

    addLog({
      nodeId: '',
      blockId: 'schedule-start',
      blockName: 'Scheduler',
      type: 'info',
      message: `Scheduled run at ${runAt.toLocaleString()}`,
    })
    return { ok: true, message: `Scheduled for ${runAt.toLocaleString()}` }
  }, [activeAddress, addLog, buildFlowJson, nodes.length, requiresSigner, saveToSupabase])

  const handleCancelSchedule = useCallback(async () => {
    const id = workflowIdRef.current
    if (!id) return { ok: false, message: 'Save the workflow before cancelling.' }
    if (!isSupabaseConfigured()) {
      return { ok: false, message: 'Supabase is not configured for this project.' }
    }
    await deactivateSchedule(id, 'start_at')
    addLog({
      nodeId: '',
      blockId: 'schedule-start',
      blockName: 'Scheduler',
      type: 'info',
      message: 'Cancelled scheduled run.',
    })
    return { ok: true, message: 'Schedule cancelled.' }
  }, [addLog])

  const userContext: UserContext = useMemo(() => {
    const tgChatId = typeof window !== 'undefined' ? localStorage.getItem('zuik_telegram_chat_id') || '' : ''
    return {
      walletAddress: activeAddress || undefined,
      telegramChatId: tgChatId || undefined,
    }
  }, [activeAddress])

  const handleIntentParsed = useCallback((intent: ParsedIntent) => {
    pushHistory()

    // Handle block deletions
    if (intent.intent === 'delete_block' && intent.deleteNodeIds && intent.deleteNodeIds.length > 0) {
      const idsToDelete = new Set(intent.deleteNodeIds)
      setNodes((nds) => nds.filter((n) => !idsToDelete.has(n.id)))
      setEdges((eds) => eds.filter((e) => !idsToDelete.has(e.source) && !idsToDelete.has(e.target)))
      return
    }

    // Handle block modifications (update existing block config)
    if (intent.intent === 'modify_block' && intent.modifications) {
      setNodes((nds) => nds.map((n) => {
        const data = n.data as Record<string, unknown>
        const blockId = data.blockId as string
        const mod = intent.modifications?.find((m) =>
          m.blockId === blockId || m.nodeId === n.id
        )
        if (mod && mod.configChanges) {
          const existingConfig = (data.config as Record<string, string | number | undefined>) ?? {}
          return {
            ...n,
            data: {
              ...data,
              config: { ...existingConfig, ...mod.configChanges },
            },
          }
        }
        return n
      }))
      return
    }

    // Handle clear_and_rebuild: replace the entire canvas
    if (intent.intent === 'clear_and_rebuild' || (nodes.length > 0 && intent.replaceCanvas)) {
      const materialized = materializeIntent(intent)
      setNodes(materialized.nodes)
      setEdges(materialized.edges)
      setTimeout(() => {
        const inst = rfInstance.current
        inst?.fitView({ padding: 0.2, duration: 500 })
        setTimeout(() => persistViewportFrom(rfInstance.current), 560)
      }, 100)
      return
    }

    // Default: add new blocks to canvas
    const materialized = materializeIntent(intent)
    const merged = addNodesToCanvas(nodes, edges, materialized.nodes, materialized.edges)
    setNodes(merged.nodes)
    setEdges(merged.edges)

    setTimeout(() => {
      const inst = rfInstance.current
      inst?.fitView({ padding: 0.2, duration: 500 })
      setTimeout(() => persistViewportFrom(rfInstance.current), 560)
    }, 100)
  }, [nodes, edges, setNodes, setEdges, pushHistory])

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
          setActiveTemplateId(null)
          setPayrollRows([])
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
    workflowIdRef.current = null
    setWorkflowId(null)
    setWorkflowName('Untitled Workflow')
    clearFlowLocal()
    window.history.replaceState(null, '', '/builder')
    setActiveTemplateId(null)
    setPayrollRows([])
    setMenuOpen(false)
    try { sessionStorage.removeItem(VIEWPORT_STORAGE_KEY) } catch { /* ignore */ }
    viewBootDone.current = false
  }

  const buildPayrollTemplate = useCallback((rows: PayrollRow[]) => {
    const nodes: TemplateNode[] = [
      {
        id: 'payroll_timer',
        type: 'generic',
        position: { x: 60, y: 120 },
        data: {
          blockId: 'timer-loop',
          config: { interval: 2592000 },
          label: 'Monthly Payroll',
        },
      },
    ]

    const edges: TemplateEdge[] = []
    const perColumn = 4
    rows.forEach((row, index) => {
      const col = Math.floor(index / perColumn)
      const rowIdx = index % perColumn
      const nodeId = `payroll_send_${index + 1}`
      nodes.push({
        id: nodeId,
        type: 'generic',
        position: { x: 380 + col * 260, y: 40 + rowIdx * 160 },
        data: {
          blockId: 'send-payment',
          config: {
            recipient: row.wallet || 'REPLACE_WITH_ADDRESS',
            amount: row.amount || 0,
            asset: row.assetId ?? 0,
          },
          label: row.name ? `Pay ${row.name}` : `Pay employee #${index + 1}`,
        },
      })
      edges.push({
        id: `edge_${nodeId}`,
        source: 'payroll_timer',
        target: nodeId,
        sourceHandle: 'tick',
        targetHandle: 'trigger',
      })
    })

    return { nodes, edges }
  }, [])

  const applyTemplate = useCallback(
    (templateNodes: TemplateNode[], templateEdges: TemplateEdge[], name: string, options?: { resetWorkflow?: boolean }) => {
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

      if (options?.resetWorkflow !== false) {
        workflowIdRef.current = null
        setWorkflowId(null)
        clearFlowLocal()
        window.history.replaceState(null, '', '/builder')
      }

      setTimeout(() => {
        const inst = rfInstance.current
        inst?.fitView({ padding: 0.2, duration: 500 })
        setTimeout(() => persistViewportFrom(rfInstance.current), 560)
      }, 100)
    },
    [setNodes, setEdges],
  )

  const handleUseTemplate = useCallback((template: WorkflowTemplate) => {
    if (template.id === PAYROLL_TEMPLATE_ID) {
      setActiveTemplateId(PAYROLL_TEMPLATE_ID)
      const seededRows = DEFAULT_PAYROLL_ROWS.map((row) => createPayrollRow(row))
      setPayrollRows(seededRows)
      const { nodes: payrollNodes, edges: payrollEdges } = buildPayrollTemplate(seededRows)
      applyTemplate(payrollNodes, payrollEdges, template.name)
      return
    }

    setActiveTemplateId(null)
    setPayrollRows([])
    applyTemplate(template.nodes, template.edges, template.name)
  }, [applyTemplate, buildPayrollTemplate])

  const handleApplyPayroll = useCallback((rows: PayrollRow[]) => {
    const { nodes: payrollNodes, edges: payrollEdges } = buildPayrollTemplate(rows)
    applyTemplate(payrollNodes, payrollEdges, workflowName, { resetWorkflow: false })
  }, [applyTemplate, buildPayrollTemplate, workflowName])

  const handlePayrollUpload = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.xlsx,.xls'
    input.onchange = (event) => {
      const file = (event.target as HTMLInputElement).files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const data = new Uint8Array(reader.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]
        const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(sheet, { defval: '' })
        const parsed = rows.map((row) => {
          const name = String(row.Name ?? row.name ?? '').trim()
          const wallet = String(row.Wallet ?? row.wallet ?? row.Address ?? '').trim()
          const amount = Number(row.Amount ?? row.amount ?? 0)
          const assetId = Number(row.AssetId ?? row.assetId ?? row.Asset ?? 0)
          return createPayrollRow({
            name,
            wallet,
            amount: Number.isFinite(amount) ? amount : 0,
            assetId: Number.isFinite(assetId) ? assetId : 0,
          })
        }).filter((row) => row.wallet)
        if (parsed.length > 0) {
          setPayrollRows(parsed)
          handleApplyPayroll(parsed)
        }
      }
      reader.readAsArrayBuffer(file)
    }
    input.click()
  }, [handleApplyPayroll])

  const handlePayrollAi = useCallback(() => {
    const summary = payrollRows.length
      ? payrollRows.map((row) => `${row.name || 'Employee'} - ${row.wallet} - ${row.amount || 0} - asset ${row.assetId ?? 0}`).join('\n')
      : 'No employees yet.'
    setPrefillIntent(
      `Update the payroll workflow. Current employees:\n${summary}\n` +
      'Add or remove employees, adjust amounts, and keep the workflow as monthly payroll.',
    )
    setChatOpen(true)
  }, [payrollRows])

  const updatePayrollRow = useCallback((rowId: string, patch: Partial<PayrollRow>) => {
    setPayrollRows((rows) => rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)))
  }, [])

  const removePayrollRow = useCallback((rowId: string) => {
    setPayrollRows((rows) => rows.filter((row) => row.id !== rowId))
  }, [])

  const addPayrollRow = useCallback(() => {
    setPayrollRows((rows) => [...rows, createPayrollRow()])
  }, [])

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
    <WorkflowSelectOptionsProvider options={workflowSpawnSelectOptions}>
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <Sidebar />
      <div ref={wrapperRef} style={{ flex: 1, position: 'relative' }}>
        <div className="zuik-dashboard-mesh" aria-hidden />
        {/* Toolbar */}
        <div className="zuik-canvas-toolbar">
          <input
            className="zuik-wf-name-input"
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            onBlur={() => { if (workflowIdRef.current) saveToSupabase() }}
            placeholder="Workflow name"
          />
          <div className="zuik-agent-separator" />

          <AgentControls
            status={agentStatus}
            onStart={handleStartAgent}
            onStop={() => agentHandleRef.current?.stop()}
            onPause={() => agentHandleRef.current?.pause()}
            onResume={() => agentHandleRef.current?.resume()}
            onClear={handleClear}
          />
          <div className="zuik-agent-separator" />

          <button className="z-btn z-btn-primary z-btn-sm" onClick={() => setChatOpen((o) => !o)} title="AI Intent Assistant">
            <BrainCircuitIcon /> AI
          </button>
          <button className="z-btn z-btn-ghost z-btn-sm" onClick={() => setTemplateGalleryOpen((o) => !o)} title="Starter Workflows">
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
                <button onClick={() => { setScheduleOpen(true); setMenuOpen(false) }} title="Schedule this workflow to run later">
                  <ClockIcon /> Schedule Run
                </button>
                <button onClick={() => { setTransactionPanelOpen(true); setMenuOpen(false) }} title="Test workflow manually - useful for debugging and testing before going live">
                  <ZapIcon /> Run Workflow (Test)
                </button>
                <button onClick={() => { setLogOpen((o) => !o); setMenuOpen(false) }}>
                  <ActivityIcon /> Execution Log
                </button>
              </div>
            )}
          </div>
        </div>

        {activeTemplateId === PAYROLL_TEMPLATE_ID && (
          <div className="payroll-panel">
            <div className="payroll-panel-header">
              <div>
                <div className="payroll-panel-title">Employee Payroll</div>
                <div className="payroll-panel-subtitle">Add employees or upload an Excel file to generate payments.</div>
              </div>
              <button className="z-btn z-btn-ghost z-btn-sm" onClick={handlePayrollUpload}>
                <UploadIcon /> Upload Excel
              </button>
            </div>
            <div className="payroll-panel-note">
              Expected columns: <strong>Name</strong>, <strong>Wallet</strong>, <strong>Amount</strong>, <strong>AssetId</strong>. Use ALGO (asset 0) when empty.
            </div>
            <div className="payroll-row-list">
              {payrollRows.map((row) => (
                <div key={row.id} className="payroll-row">
                  <input
                    placeholder="Name"
                    value={row.name}
                    onChange={(event) => updatePayrollRow(row.id, { name: event.target.value })}
                  />
                  <input
                    placeholder="Wallet address"
                    value={row.wallet}
                    onChange={(event) => updatePayrollRow(row.id, { wallet: event.target.value })}
                  />
                  <input
                    type="number"
                    placeholder="Amount"
                    value={row.amount || ''}
                    onChange={(event) => updatePayrollRow(row.id, { amount: Number(event.target.value) || 0 })}
                  />
                  <input
                    type="number"
                    placeholder="AssetId"
                    value={row.assetId || ''}
                    onChange={(event) => updatePayrollRow(row.id, { assetId: Number(event.target.value) || 0 })}
                  />
                  <button className="payroll-row-remove" onClick={() => removePayrollRow(row.id)} title="Remove employee">
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </div>
            <div className="payroll-panel-actions">
              <div className="payroll-panel-actions-left">
                <button className="z-btn z-btn-ghost z-btn-sm" onClick={addPayrollRow}>
                  <PlusIcon /> Add employee
                </button>
                <button className="z-btn z-btn-ghost z-btn-sm" onClick={handlePayrollAi}>
                  <BrainCircuitIcon /> Edit with AI
                </button>
              </div>
              <button className="z-btn z-btn-primary z-btn-sm" onClick={() => handleApplyPayroll(payrollRows)} disabled={payrollRows.length === 0}>
                Apply to canvas
              </button>
            </div>
          </div>
        )}

        <TransactionPanel
          isOpen={transactionPanelOpen}
          onClose={() => setTransactionPanelOpen(false)}
          nodes={nodes}
          edges={edges}
          onHighlightNode={handleHighlightNode}
          workflowId={workflowId}
          workflowName={workflowName}
        />
        <ExecutionLog
          isOpen={logOpen}
          onClose={() => setLogOpen(false)}
          logs={logs}
          onClear={() => setLogs([])}
        />
        <SchedulePanel
          isOpen={scheduleOpen}
          onClose={() => setScheduleOpen(false)}
          workflowId={workflowId}
          workflowName={workflowName}
          walletAddress={activeAddress}
          supabaseReady={isSupabaseConfigured()}
          requiresSigner={requiresSigner}
          onSchedule={handleScheduleRun}
          onCancel={handleCancelSchedule}
        />
        <ChatPanel
          isOpen={chatOpen}
          onClose={() => setChatOpen(false)}
          onIntentParsed={handleIntentParsed}
          canvasBlocks={canvasBlocks}
          userContext={userContext}
          prefillMessage={prefillIntent ?? undefined}
        />
        <TemplateGallery
          isOpen={templateGalleryOpen}
          onClose={() => setTemplateGalleryOpen(false)}
          onUseTemplate={handleUseTemplate}
        />
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={wrappedOnNodesChange}
          onEdgesChange={wrappedOnEdgesChange}
          onConnect={onConnect}
          isValidConnection={isConnectionValid}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onNodeDragStop={onNodeDragStop}
          onInit={(inst) => {
            rfInstance.current = inst
            setRfReady(true)
          }}
          onMoveEnd={() => persistViewportFrom(rfInstance.current)}
          nodeTypes={nodeTypes}
          snapToGrid
          snapGrid={[16, 16]}
          deleteKeyCode={['Backspace', 'Delete']}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.6} color="rgba(110, 231, 255, 0.35)" />
          <Controls />
          <MiniMap
            nodeColor={minimapNodeColor}
            maskColor="rgba(12,12,14,0.7)"
            style={{ borderRadius: 8 }}
          />
        </ReactFlow>
      </div>
    </div>
    </WorkflowSelectOptionsProvider>
  )
}
