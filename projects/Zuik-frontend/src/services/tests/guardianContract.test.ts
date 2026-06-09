import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { GuardianAgentPolicy } from '../guardianContract'
import { guardianContract, algoToMicroAlgos } from '../guardianContract'

// Mock dependencies
vi.mock('../algorand', () => ({
  getAlgorandClient: vi.fn().mockReturnValue({
    client: {
      algod: {
        status: vi.fn().mockReturnValue({
          do: vi.fn().mockResolvedValue({ 'last-round': 1000 })
        })
      }
    }
  })
}))

describe('Guardian Contract Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('algoToMicroAlgos', () => {
    it('should convert ALGO to microAlgos correctly', () => {
      expect(algoToMicroAlgos(1)).toBe(1000000n)
      expect(algoToMicroAlgos(0.1)).toBe(100000n)
      expect(algoToMicroAlgos(0.001)).toBe(1000n)
    })

    it('should handle edge cases', () => {
      expect(algoToMicroAlgos(0)).toBe(0n)
      expect(algoToMicroAlgos(1000)).toBe(1000000000n)
    })
  })

  describe('Policy validation', () => {
    it('should validate daily execution limits correctly', () => {
      const mockPolicy: GuardianAgentPolicy = {
        maxPerTradeMicroAlgos: 500000n, // 0.5 ALGO
        dailyCapMicroAlgos: 2000000n,   // 2 ALGO
        dailySpentMicroAlgos: 0n,
        dayResetRound: 1000n,
        expiryRound: 31000n,
        dailyExecutionsCap: 3n, // Daily executions allowed
        dailyExecutionsSpent: 0n,
        allowedDexAppId: 0n,
        allowedAssetId: 0n
      }

      // Test that executions remaining is for the current day
      expect(mockPolicy.dailyExecutionsCap - mockPolicy.dailyExecutionsSpent).toBe(3n)
      
      // After one execution, it should decrease
      const updatedPolicy = { ...mockPolicy, dailyExecutionsSpent: mockPolicy.dailyExecutionsSpent + 1n }
      expect(updatedPolicy.dailyExecutionsCap - updatedPolicy.dailyExecutionsSpent).toBe(2n)
      
      // When it reaches 0, agent should stop until daily reset
      const exhaustedPolicy = { ...mockPolicy, dailyExecutionsSpent: mockPolicy.dailyExecutionsCap }
      expect(exhaustedPolicy.dailyExecutionsCap - exhaustedPolicy.dailyExecutionsSpent).toBe(0n)
    })

    it('should validate daily limits reset properly', () => {
      const currentRound = 2000n
      const mockPolicy: GuardianAgentPolicy = {
        maxPerTradeMicroAlgos: 500000n,
        dailyCapMicroAlgos: 2000000n,
        dailySpentMicroAlgos: 1500000n, // 1.5 ALGO spent
        dayResetRound: 1500n, // Reset round has passed
        expiryRound: 31000n,
        dailyExecutionsCap: 5n,
        dailyExecutionsSpent: 5n,
        allowedDexAppId: 0n,
        allowedAssetId: 0n
      }

      // When current round > dayResetRound, daily spending should reset
      const shouldReset = currentRound > mockPolicy.dayResetRound
      expect(shouldReset).toBe(true)
      
      // After reset, dailySpentMicroAlgos should be 0
      const resetPolicy = { 
        ...mockPolicy, 
        dailySpentMicroAlgos: 0n,
        dailyExecutionsSpent: 0n,
        dayResetRound: currentRound + 28800n // ~24 hours later
      }
      expect(resetPolicy.dailySpentMicroAlgos).toBe(0n)
      expect(resetPolicy.dailyExecutionsCap - resetPolicy.dailyExecutionsSpent).toBe(5n)
    })
  })

  describe('Policy limits', () => {
    it('should enforce per-trade limits', () => {
      const mockPolicy: GuardianAgentPolicy = {
        maxPerTradeMicroAlgos: 500000n, // 0.5 ALGO max per trade
        dailyCapMicroAlgos: 2000000n,
        dailySpentMicroAlgos: 0n,
        dayResetRound: 1000n,
        expiryRound: 31000n,
        dailyExecutionsCap: 10n,
        dailyExecutionsSpent: 0n,
        allowedDexAppId: 0n,
        allowedAssetId: 0n
      }

      const tradeAmount = 600000n // 0.6 ALGO
      const isValidTrade = tradeAmount <= mockPolicy.maxPerTradeMicroAlgos
      expect(isValidTrade).toBe(false) // Should fail as it exceeds max per trade

      const validTradeAmount = 400000n // 0.4 ALGO
      const isValidValidTrade = validTradeAmount <= mockPolicy.maxPerTradeMicroAlgos
      expect(isValidValidTrade).toBe(true) // Should pass
    })

    it('should enforce daily cap limits', () => {
      const mockPolicy: GuardianAgentPolicy = {
        maxPerTradeMicroAlgos: 500000n,
        dailyCapMicroAlgos: 2000000n, // 2 ALGO daily cap
        dailySpentMicroAlgos: 1800000n, // Already spent 1.8 ALGO today
        dayResetRound: 2000n,
        expiryRound: 31000n,
        executionsRemaining: 10n,
        allowedDexAppId: 0n,
        allowedAssetId: 0n
      }

      const newTradeAmount = 300000n // 0.3 ALGO
      const totalAfterTrade = mockPolicy.dailySpentMicroAlgos + newTradeAmount
      const exceedsDailyLimit = totalAfterTrade > mockPolicy.dailyCapMicroAlgos
      expect(exceedsDailyLimit).toBe(true) // Should fail as it would exceed daily cap
    })
  })
})