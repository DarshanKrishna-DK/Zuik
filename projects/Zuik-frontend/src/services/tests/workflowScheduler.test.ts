import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ScheduleEntry } from '../workflowScheduler'
import { 
  saveSchedule, 
  recordScheduleIteration, 
  getMissedSchedules,
  deactivateSchedule 
} from '../workflowScheduler'

// Mock Supabase
const mockSupabase = {
  from: vi.fn().mockReturnThis(),
  upsert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  single: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  lt: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  rpc: vi.fn()
}

vi.mock('../supabase', () => ({
  isSupabaseConfigured: vi.fn().mockReturnValue(true),
  getSupabase: vi.fn(() => mockSupabase)
}))

describe('Workflow Scheduler Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset mock chain
    Object.values(mockSupabase).forEach(mock => {
      if (typeof mock === 'function') {
        mock.mockReturnThis()
      }
    })
  })

  describe('saveSchedule', () => {
    it('should save a workflow schedule successfully', async () => {
      const mockScheduleId = 'schedule-123'
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: mockScheduleId },
        error: null
      })

      const params = {
        workflowId: 'workflow-123',
        walletAddress: 'ABCD1234567890EFGH',
        intervalSec: 5, // 5 second interval for testing
        maxIterations: 3, // Limit to 3 executions
        requiresSigner: false,
        agentAddress: 'AGENT1234567890',
        flowJson: { nodes: [], edges: [] }
      }

      const result = await saveSchedule(params)
      expect(result).toBe(mockScheduleId)
      expect(mockSupabase.from).toHaveBeenCalledWith('workflow_schedules')
      expect(mockSupabase.upsert).toHaveBeenCalled()
    })

    it('should handle save schedule errors gracefully', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error' }
      })

      const params = {
        workflowId: 'workflow-123',
        walletAddress: 'ABCD1234567890EFGH',
        intervalSec: 5,
        maxIterations: 3,
        requiresSigner: false,
        flowJson: { nodes: [], edges: [] }
      }

      const result = await saveSchedule(params)
      expect(result).toBeNull()
    })
  })

  describe('recordScheduleIteration', () => {
    it('should increment iteration count correctly', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({
        error: null
      })

      await recordScheduleIteration('schedule-123', 5)
      
      expect(mockSupabase.rpc).toHaveBeenCalledWith('increment_schedule_iteration', {
        p_schedule_id: 'schedule-123',
        p_next_run_at: expect.any(String)
      })
    })
  })

  describe('getMissedSchedules', () => {
    it('should return missed schedules correctly', async () => {
      const mockMissedSchedules: ScheduleEntry[] = [
        {
          id: 'schedule-1',
          workflow_id: 'workflow-1',
          wallet_address: 'WALLET123',
          interval_sec: 5,
          max_iterations: 3,
          iterations_completed: 1,
          next_run_at: new Date(Date.now() - 10000).toISOString(), // 10 seconds ago
          is_active: true,
          requires_signer: false,
          agent_address: 'AGENT123',
          schedule_type: 'interval',
          flow_json: { nodes: [], edges: [] },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ]

      mockSupabase.order.mockResolvedValueOnce({
        data: mockMissedSchedules,
        error: null
      })

      const result = await getMissedSchedules('WALLET123')
      expect(result).toEqual(mockMissedSchedules)
      expect(mockSupabase.lt).toHaveBeenCalledWith('next_run_at', expect.any(String))
    })
  })

  describe('deactivateSchedule', () => {
    it('should deactivate a schedule successfully', async () => {
      // Set up the mock chain properly
      const mockChain = {
        from: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null })
      }

      vi.mocked(await import('../supabase')).getSupabase.mockReturnValue(mockChain as any)

      await deactivateSchedule('workflow-123')
      
      expect(mockChain.from).toHaveBeenCalledWith('workflow_schedules')
      expect(mockChain.update).toHaveBeenCalledWith({
        is_active: false,
        updated_at: expect.any(String)
      })
      expect(mockChain.eq).toHaveBeenCalledWith('workflow_id', 'workflow-123')
    })
  })

  describe('Schedule execution limits', () => {
    it('should handle max iterations correctly', () => {
      const schedule: Partial<ScheduleEntry> = {
        max_iterations: 3,
        iterations_completed: 2,
        is_active: true
      }

      // Should still be active as we haven't hit the limit
      const hasIterationsLeft = !schedule.max_iterations || 
        schedule.iterations_completed! < schedule.max_iterations
      expect(hasIterationsLeft).toBe(true)

      // After completing the 3rd iteration
      const completedSchedule = { ...schedule, iterations_completed: 3 }
      const shouldStop = completedSchedule.max_iterations && 
        completedSchedule.iterations_completed! >= completedSchedule.max_iterations
      expect(shouldStop).toBe(true)
    })

    it('should handle infinite iterations (null max_iterations)', () => {
      const schedule: Partial<ScheduleEntry> = {
        max_iterations: null, // Infinite
        iterations_completed: 1000,
        is_active: true
      }

      const hasIterationsLeft = !schedule.max_iterations || 
        schedule.iterations_completed! < schedule.max_iterations
      expect(hasIterationsLeft).toBe(true) // Should never stop due to iterations
    })
  })
})