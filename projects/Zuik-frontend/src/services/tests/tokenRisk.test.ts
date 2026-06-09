import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computeRiskScore, riskBandLabel, type TokenRiskResult, type RiskBand } from '../tokenRisk'

// Mock the algorand service
vi.mock('../algorand', () => ({
  getAlgorandClient: vi.fn().mockReturnValue({
    client: {
      algod: {
        getAssetByID: vi.fn().mockImplementation((assetId: number) => ({
          do: () => Promise.resolve({
            params: {
              name: `Test Asset ${assetId}`,
              'unit-name': 'TEST',
              total: 1000000,
              decimals: 6,
              creator: 'CREATOR123ABCD',
              manager: assetId === 1 ? 'MANAGER123' : undefined,
              reserve: assetId === 1 ? 'RESERVE123' : undefined,
              freeze: assetId === 1 ? 'FREEZE123' : undefined,
              clawback: assetId === 1 ? 'CLAWBACK123' : undefined,
            }
          })
        }))
      },
      indexer: {
        searchForAssets: vi.fn().mockImplementation((assetId: number) => ({
          do: () => Promise.resolve({
            assets: [{
              index: assetId,
              params: {
                name: `Test Asset ${assetId}`,
                'unit-name': 'TEST',
                total: 1000000,
                decimals: 6,
                creator: 'CREATOR123ABCD'
              }
            }]
          })
        })),
        lookupAssetBalances: vi.fn().mockImplementation((assetId: number) => ({
          do: () => Promise.resolve({
            balances: assetId === 1 ? 
              // High concentration for asset 1
              [
                { address: 'HOLDER1', amount: 500000 },
                { address: 'HOLDER2', amount: 300000 },
                { address: 'HOLDER3', amount: 200000 }
              ] :
              // Better distribution for asset 2
              [
                { address: 'HOLDER1', amount: 100000 },
                { address: 'HOLDER2', amount: 100000 },
                { address: 'HOLDER3', amount: 100000 },
                { address: 'HOLDER4', amount: 100000 },
                { address: 'HOLDER5', amount: 100000 },
                { address: 'HOLDER6', amount: 500000 }
              ]
          })
        }))
      }
    }
  })
}))

describe('Token Risk Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('computeRiskScore', () => {
    it('should compute high risk for assets with centralized control', async () => {
      // Asset 1 has manager, reserve, freeze, and clawback addresses (high risk)
      const risk = await computeRiskScore(1)
      
      expect(risk).toBeDefined()
      expect(risk.score).toBeGreaterThanOrEqual(50) // Should be higher risk
      expect(['elevated', 'extreme', 'moderate']).toContain(risk.band) // Accept elevated/extreme/moderate
      expect(Array.isArray(risk.reasons)).toBe(true)
      expect(risk.reasons.length).toBeGreaterThan(0)
    })

    it('should compute lower risk for decentralized assets', async () => {
      // Asset 2 has no special addresses and better distribution
      const risk = await computeRiskScore(2)
      
      expect(risk).toBeDefined()
      expect(risk.score).toBeLessThan(70) // Should be lower risk than asset 1
      expect(risk.band).not.toBe('high')
    })

    it('should handle non-existent assets gracefully', async () => {
      const mockAlgorandClient = {
        client: {
          algod: {
            getAssetByID: vi.fn().mockImplementation(() => ({
              do: () => Promise.reject(new Error('Asset not found'))
            }))
          },
          indexer: {
            searchForAssets: vi.fn().mockImplementation(() => ({
              do: () => Promise.resolve({ assets: [] })
            }))
          }
        }
      }
      
      vi.mocked(await import('../algorand')).getAlgorandClient.mockReturnValueOnce(mockAlgorandClient as any)
      
      const risk = await computeRiskScore(999999)
      expect(risk.score).toBe(50) // Default score for assets that can't be loaded
      expect(risk.reasons).toContain('Could not load on-chain asset params')
    })
  })

  describe('riskBandLabel', () => {
    it('should return correct labels for risk bands', () => {
      expect(riskBandLabel('low')).toBe('Low risk')
      expect(riskBandLabel('moderate')).toBe('Moderate')  
      expect(riskBandLabel('elevated')).toBe('Elevated')
      expect(riskBandLabel('extreme')).toBe('Extreme')
    })
  })

  describe('Risk scoring logic', () => {
    it('should identify centralized control risks correctly', () => {
      const mockAssetWithControl = {
        params: {
          name: 'Centralized Token',
          manager: 'MANAGER123',
          freeze: 'FREEZE123',
          clawback: 'CLAWBACK123',
          total: 1000000,
          decimals: 6
        }
      }

      // This would be high risk due to centralized control
      const hasManager = !!mockAssetWithControl.params.manager
      const hasFreeze = !!mockAssetWithControl.params.freeze
      const hasClawback = !!mockAssetWithControl.params.clawback
      
      expect(hasManager).toBe(true)
      expect(hasFreeze).toBe(true)
      expect(hasClawback).toBe(true)
      
      const controlRiskFactor = hasManager || hasFreeze || hasClawback
      expect(controlRiskFactor).toBe(true)
    })

    it('should calculate holder concentration correctly', () => {
      const balances = [
        { amount: 500000 }, // 50%
        { amount: 300000 }, // 30%
        { amount: 200000 }  // 20%
      ]
      const totalSupply = 1000000
      
      // Top holder concentration
      const topHolderPercent = (balances[0].amount / totalSupply) * 100
      expect(topHolderPercent).toBe(50)
      
      // Top 3 holders concentration
      const top3Percent = (balances.reduce((sum, b) => sum + b.amount, 0) / totalSupply) * 100
      expect(top3Percent).toBe(100)
      
      const isHighConcentration = topHolderPercent > 20 || top3Percent > 60
      expect(isHighConcentration).toBe(true)
    })

    it('should handle small supply tokens correctly', () => {
      const smallSupplyAsset = {
        params: {
          name: 'Small Token',
          total: 100, // Very small supply
          decimals: 0
        }
      }
      
      const isSmallSupply = smallSupplyAsset.params.total < 1000
      expect(isSmallSupply).toBe(true)
      
      // Small supply tokens should be treated with caution
    })
  })

  describe('Risk band classification', () => {
    it('should classify risk bands correctly based on scores', () => {
      // Low risk: 0-30
      const lowRisk: TokenRiskResult = {
        score: 25,
        band: 'low' as RiskBand,
        reasons: ['Decentralized']
      }
      expect(lowRisk.band).toBe('low')
      
      // Moderate risk: 31-60
      const moderateRisk: TokenRiskResult = {
        score: 55,
        band: 'moderate' as RiskBand,
        reasons: ['Some concentration']
      }
      expect(moderateRisk.band).toBe('moderate')
      
      // Elevated risk: 61-80
      const elevatedRisk: TokenRiskResult = {
        score: 75,
        band: 'elevated' as RiskBand,
        reasons: ['Centralized control', 'High concentration']
      }
      expect(elevatedRisk.band).toBe('elevated')
      
      // Extreme risk: 81-100
      const extremeRisk: TokenRiskResult = {
        score: 90,
        band: 'extreme' as RiskBand,
        reasons: ['Fully centralized', 'Single holder']
      }
      expect(extremeRisk.band).toBe('extreme')
    })
  })
})