import {
  Account,
  Global,
  GlobalState,
  LocalState,
  Txn,
  Uint64,
  assert,
} from '@algorandfoundation/algorand-typescript'
import type { uint64 } from '@algorandfoundation/algorand-typescript'
import { Contract, abimethod } from '@algorandfoundation/algorand-typescript/arc4'

/** ~1 day on Algorand TestNet/MainNet at typical round times (used for daily reset). */
const ROUNDS_PER_DAY = Uint64(27_000)

/**
 * ZuikGuardian - per-agent daily ALGO spend limits (microAlgos).
 * Agents must opt in before the owner registers policy. Only the agent may call attemptSpend.
 */
export class ZuikGuardian extends Contract {
  owner = GlobalState<Account>()
  isPaused = GlobalState<boolean>()

  totalTransactions = GlobalState<uint64>({ initialValue: Uint64(0) })
  totalVolume = GlobalState<uint64>({ initialValue: Uint64(0) })

  isRegistered = LocalState<boolean>()
  dailyCap = LocalState<uint64>()
  dailySpent = LocalState<uint64>()
  dayResetRound = LocalState<uint64>()
  transactionCount = LocalState<uint64>()

  @abimethod({ onCreate: 'require' })
  createApplication(): void {
    this.owner.value = Txn.sender
    this.isPaused.value = false
  }

  /** Allows an account to create local state before the owner calls registerAgent. */
  @abimethod({ allowActions: 'OptIn' })
  optIn(): void {}

  /**
   * Owner configures an agent. Agent must be opted in and appear in foreign accounts.
   */
  @abimethod({ allowActions: 'NoOp' })
  registerAgent(agent: Account, dailyCapMicroAlgos: uint64): void {
    assert(Txn.sender === this.owner.value)
    assert(!this.isPaused.value)
    assert(dailyCapMicroAlgos > Uint64(0))
    assert(agent.isOptedIn(Global.currentApplicationId))

    this.isRegistered(agent).value = true
    this.dailyCap(agent).value = dailyCapMicroAlgos
    this.dailySpent(agent).value = Uint64(0)
    this.dayResetRound(agent).value = Global.round + ROUNDS_PER_DAY
    this.transactionCount(agent).value = Uint64(0)
  }

  @abimethod({ allowActions: 'NoOp' })
  updateDailyCap(agent: Account, dailyCapMicroAlgos: uint64): void {
    assert(Txn.sender === this.owner.value)
    assert(!this.isPaused.value)
    assert(this.isRegistered(agent).value)
    assert(dailyCapMicroAlgos > Uint64(0))
    this.dailyCap(agent).value = dailyCapMicroAlgos
  }

  /**
   * Agent records an intended spend in microAlgos. Reverts if over daily cap or paused.
   */
  @abimethod({ allowActions: 'NoOp' })
  attemptSpend(agent: Account, amount: uint64): void {
    assert(Txn.sender === agent)
    assert(!this.isPaused.value)
    assert(this.isRegistered(agent).value)
    assert(agent.isOptedIn(Global.currentApplicationId))
    assert(amount > Uint64(0))

    if (Global.round >= this.dayResetRound(agent).value) {
      this.dailySpent(agent).value = Uint64(0)
      this.dayResetRound(agent).value = Global.round + ROUNDS_PER_DAY
    }

    assert(this.dailySpent(agent).value + amount <= this.dailyCap(agent).value)

    this.dailySpent(agent).value = this.dailySpent(agent).value + amount
    this.transactionCount(agent).value = this.transactionCount(agent).value + Uint64(1)
    this.totalTransactions.value = this.totalTransactions.value + Uint64(1)
    this.totalVolume.value = this.totalVolume.value + amount
  }

  @abimethod({ allowActions: 'NoOp' })
  setPaused(paused: boolean): void {
    assert(Txn.sender === this.owner.value)
    this.isPaused.value = paused
  }
}
