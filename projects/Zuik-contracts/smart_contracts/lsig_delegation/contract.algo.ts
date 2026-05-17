import {
  Account,
  Application,
  Asset,
  assert,
  assertMatch,
  Global,
  GlobalState,
  gtxn,
  LogicSig,
  TemplateVar,
  TransactionType,
  Txn,
  uint64,
  Uint64,
} from '@algorandfoundation/algorand-typescript'
import { Contract, abimethod, methodSelector } from '@algorandfoundation/algorand-typescript/arc4'

const MAX_FEE = TemplateVar<uint64>('MAX_FEE')
const MAX_PER_TRADE = TemplateVar<uint64>('MAX_PER_TRADE')
const ALLOWED_FROM_ASSET = TemplateVar<Asset>('ALLOWED_FROM_ASSET')
const ALLOWED_DEX_APP_ID = TemplateVar<Application>('ALLOWED_DEX_APP_ID')
const VERIFIER_APP_ID = TemplateVar<Application>('VERIFIER_APP_ID')
const EXPIRY_ROUND = TemplateVar<uint64>('EXPIRY_ROUND')

/**
 * Delegated LogicSig used by the server to sign on-chain actions.
 * Every spend must be paired with a verifier app call in the same group.
 */
export class ZuikDelegationLsig extends LogicSig {
  program(): boolean {
    assert(Txn.lastValid <= EXPIRY_ROUND)
    assert(Txn.rekeyTo === Global.zeroAddress)
    assert(Txn.fee <= MAX_FEE)

    if (Txn.typeEnum === TransactionType.ApplicationCall) {
      const appCall = gtxn.ApplicationCallTxn(Txn.groupIndex)
      return appCall.appId === VERIFIER_APP_ID || appCall.appId === ALLOWED_DEX_APP_ID
    }

    if (Txn.typeEnum === TransactionType.Payment) {
      assertMatch(Txn, { closeRemainderTo: Global.zeroAddress })
      assert(ALLOWED_FROM_ASSET.id === Uint64(0))
      assert(Txn.amount <= MAX_PER_TRADE)
      const verifierCall = gtxn.ApplicationCallTxn(Txn.groupIndex + 1)
      assert(verifierCall.appId === VERIFIER_APP_ID)
      assert(verifierCall.appArgs(0) === methodSelector('verifyAlgoSpend(pay)void'))
      return true
    }

    if (Txn.typeEnum === TransactionType.AssetTransfer) {
      assertMatch(Txn, { assetCloseTo: Global.zeroAddress })
      assert(Txn.xferAsset === ALLOWED_FROM_ASSET)
      assert(Txn.assetAmount <= MAX_PER_TRADE)
      const verifierCall = gtxn.ApplicationCallTxn(Txn.groupIndex + 1)
      assert(verifierCall.appId === VERIFIER_APP_ID)
      assert(verifierCall.appArgs(0) === methodSelector('verifyAssetSpend(axfer)void'))
      return true
    }

    return false
  }
}

export class ZuikDelegationVerifier extends Contract {
  owner = GlobalState<Account>()
  maxPerTrade = GlobalState<uint64>()
  dailyCap = GlobalState<uint64>()
  dailySpent = GlobalState<uint64>({ initialValue: Uint64(0) })
  dayResetRound = GlobalState<uint64>()
  allowedFromAsset = GlobalState<Asset>()
  allowedToAsset = GlobalState<Asset>()
  allowedDexAppId = GlobalState<Application>()
  expiryRound = GlobalState<uint64>()

  @abimethod({ onCreate: 'require' })
  createApplication(
    maxPerTrade: uint64,
    dailyCap: uint64,
    allowedFromAsset: Asset,
    allowedToAsset: Asset,
    allowedDexAppId: Application,
    expiryRound: uint64,
  ): void {
    assert(expiryRound > Global.round)
    this.owner.value = Txn.sender
    this.maxPerTrade.value = maxPerTrade
    this.dailyCap.value = dailyCap
    this.allowedFromAsset.value = allowedFromAsset
    this.allowedToAsset.value = allowedToAsset
    this.allowedDexAppId.value = allowedDexAppId
    this.expiryRound.value = expiryRound
    this.dailySpent.value = Uint64(0)
    this.dayResetRound.value = Global.round + Uint64(27000)
  }

  verifyAssetSpend(spend: gtxn.AssetTransferTxn): void {
    assert(Txn.sender === this.owner.value)
    assert(Global.round <= this.expiryRound.value)
    assert(spend.sender === this.owner.value)
    assert(spend.xferAsset === this.allowedFromAsset.value)
    assert(spend.assetAmount <= this.maxPerTrade.value)

    if (Global.round >= this.dayResetRound.value) {
      this.dailySpent.value = Uint64(0)
      this.dayResetRound.value = Global.round + Uint64(27000)
    }

    assert(this.dailySpent.value + spend.assetAmount <= this.dailyCap.value)
    this.dailySpent.value = this.dailySpent.value + spend.assetAmount
  }

  verifyAlgoSpend(spend: gtxn.PaymentTxn): void {
    assert(Txn.sender === this.owner.value)
    assert(Global.round <= this.expiryRound.value)
    assert(spend.sender === this.owner.value)
    assert(this.allowedFromAsset.value.id === Uint64(0))
    assert(spend.amount <= this.maxPerTrade.value)

    if (Global.round >= this.dayResetRound.value) {
      this.dailySpent.value = Uint64(0)
      this.dayResetRound.value = Global.round + Uint64(27000)
    }

    assert(this.dailySpent.value + spend.amount <= this.dailyCap.value)
    this.dailySpent.value = this.dailySpent.value + spend.amount
  }
}
