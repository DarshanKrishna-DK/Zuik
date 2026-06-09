import {
  Account,
  Application,
  Asset,
  BoxMap,
  Global,
  GlobalState,
  Txn,
  Uint64,
  assert,
  assertMatch,
  clone,
  gtxn,
} from '@algorandfoundation/algorand-typescript'
import type { bytes, uint64 } from '@algorandfoundation/algorand-typescript'
import { Contract, abimethod, readonly } from '@algorandfoundation/algorand-typescript/arc4'

/** ~1 day on Algorand at typical round times (used for daily reset). */
const ROUNDS_PER_DAY = Uint64(27_000)

/** Per-agent spend policy stored in a box keyed by the agent address bytes. */
type AgentPolicy = {
  maxPerTradeMicroAlgos: uint64
  dailyCapMicroAlgos: uint64
  dailySpentMicroAlgos: uint64
  dayResetRound: uint64
  expiryRound: uint64
  dailyExecutionsCap: uint64
  dailyExecutionsSpent: uint64
  allowedDexAppId: uint64 // 0 = none
  allowedAssetId: uint64 // 0 = ALGO only
}

/**
 * ZuikGuardian - on-chain policy store for funded agent sub-accounts.
 *
 * Enforcement model is an atomic transaction group:
 *   [0] pay/axfer (sender = agent sub-account, signed by the server-held agent key)
 *   [1] appl authorize_trade(pay) / authorize_asset_trade(spend)
 *
 * If any assert here fails, the entire group reverts, so not even Zuik's server
 * can move funds outside the policy registered by the owner.
 */
export class ZuikGuardian extends Contract {
  owner = GlobalState<Account>()
  isPaused = GlobalState<boolean>()

  /** agent address bytes -> policy */
  policies = BoxMap<bytes, AgentPolicy>({ keyPrefix: 'pol' })

  /** recipient address bytes -> allowed flag */
  allowedRecipients = BoxMap<bytes, boolean>({ keyPrefix: 'rcv' })

  @abimethod({ onCreate: 'require' })
  createApplication(): void {
    this.owner.value = Txn.sender
    this.isPaused.value = false
  }

  /**
   * Owner registers (or re-registers) an agent policy. Boxes do not require opt-in,
   * but the app account must be funded for box MBR before the first box write.
   */
  @abimethod({ allowActions: 'NoOp' })
  bootstrap(
    agent: Account,
    maxPerTradeMicroAlgos: uint64,
    dailyCapMicroAlgos: uint64,
    expiryRound: uint64,
    dailyExecutionsCap: uint64,
    allowedAssetId: Asset,
    allowedDexAppId: Application,
  ): void {
    assert(Txn.sender === this.owner.value)
    assert(!this.isPaused.value)
    assert(maxPerTradeMicroAlgos > Uint64(0))
    assert(dailyCapMicroAlgos >= maxPerTradeMicroAlgos)
    assert(expiryRound > Global.round)

    const policy: AgentPolicy = {
      maxPerTradeMicroAlgos,
      dailyCapMicroAlgos,
      dailySpentMicroAlgos: Uint64(0),
      dayResetRound: Global.round + ROUNDS_PER_DAY,
      expiryRound,
      dailyExecutionsCap,
      dailyExecutionsSpent: Uint64(0),
      allowedDexAppId: allowedDexAppId.id,
      allowedAssetId: allowedAssetId.id,
    }
    this.policies(agent.bytes).value = clone(policy)
  }

  /** Owner adds a recipient to the global allowlist. */
  @abimethod({ allowActions: 'NoOp' })
  allowRecipient(agent: Account, recipient: Account): void {
    assert(Txn.sender === this.owner.value)
    this.allowedRecipients(recipient.bytes).value = true
  }

  /**
   * Atomic enforcement for an ALGO payment. Must be grouped with the payment
   * transaction immediately before this application call.
   */
  @abimethod({ allowActions: 'NoOp' })
  authorize_trade(pay: gtxn.PaymentTxn): void {
    assert(!this.isPaused.value)
    const agentKey = pay.sender.bytes
    const policy = clone(this.policies(agentKey).value)

    assert(Global.round <= policy.expiryRound)
    assert(this.allowedRecipients(pay.receiver.bytes).value)

    assertMatch(pay, {
      closeRemainderTo: Global.zeroAddress,
      rekeyTo: Global.zeroAddress,
    })
    assert(pay.amount > Uint64(0))
    assert(pay.amount <= policy.maxPerTradeMicroAlgos)
    assert(policy.allowedAssetId === Uint64(0)) // ALGO-only path

    if (Global.round >= policy.dayResetRound) {
      policy.dailySpentMicroAlgos = Uint64(0)
      policy.dailyExecutionsSpent = Uint64(0)
      policy.dayResetRound = Global.round + ROUNDS_PER_DAY
    }
    assert(policy.dailySpentMicroAlgos + pay.amount <= policy.dailyCapMicroAlgos)
    assert(policy.dailyExecutionsSpent < policy.dailyExecutionsCap)

    policy.dailySpentMicroAlgos = policy.dailySpentMicroAlgos + pay.amount
    policy.dailyExecutionsSpent = policy.dailyExecutionsSpent + Uint64(1)
    this.policies(agentKey).value = clone(policy)
  }

  /**
   * Atomic enforcement for an ASA transfer. Must be grouped with the asset
   * transfer transaction immediately before this application call.
   */
  @abimethod({ allowActions: 'NoOp' })
  authorize_asset_trade(spend: gtxn.AssetTransferTxn): void {
    assert(!this.isPaused.value)
    const agentKey = spend.sender.bytes
    const policy = clone(this.policies(agentKey).value)

    assert(Global.round <= policy.expiryRound)
    assert(this.allowedRecipients(spend.assetReceiver.bytes).value)
    assert(spend.xferAsset.id === policy.allowedAssetId)

    assertMatch(spend, {
      assetCloseTo: Global.zeroAddress,
      rekeyTo: Global.zeroAddress,
    })
    assert(spend.assetAmount > Uint64(0))
    assert(spend.assetAmount <= policy.maxPerTradeMicroAlgos)

    if (Global.round >= policy.dayResetRound) {
      policy.dailySpentMicroAlgos = Uint64(0)
      policy.dailyExecutionsSpent = Uint64(0)
      policy.dayResetRound = Global.round + ROUNDS_PER_DAY
    }
    assert(policy.dailySpentMicroAlgos + spend.assetAmount <= policy.dailyCapMicroAlgos)
    assert(policy.dailyExecutionsSpent < policy.dailyExecutionsCap)

    policy.dailySpentMicroAlgos = policy.dailySpentMicroAlgos + spend.assetAmount
    policy.dailyExecutionsSpent = policy.dailyExecutionsSpent + Uint64(1)
    this.policies(agentKey).value = clone(policy)
  }

  @abimethod({ allowActions: 'NoOp' })
  emergency_stop(): void {
    assert(Txn.sender === this.owner.value)
    this.isPaused.value = true
  }

  @abimethod({ allowActions: 'NoOp' })
  resume(): void {
    assert(Txn.sender === this.owner.value)
    this.isPaused.value = false
  }

  @readonly
  getPolicy(agent: Account): AgentPolicy {
    return clone(this.policies(agent.bytes).value)
  }

  @readonly
  isRecipientAllowed(recipient: Account): boolean {
    return this.allowedRecipients(recipient.bytes).value
  }

  @readonly
  isPausedState(): boolean {
    return this.isPaused.value
  }
}
