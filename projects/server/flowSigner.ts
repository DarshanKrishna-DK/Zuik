/**
 * Whether a saved flow must be run from the Zuik web app (wallet signing or browser-based triggers).
 */

const SIGNER_BLOCKS = new Set([
  'swap-token',
  'send-payment',
  'opt-in-asa',
  'create-asa',
  'call-contract',
])

const DELEGATION_BLOCKS = new Set([
  'send-payment',
])

/** Triggers that only work in the browser agent / hosted runner, not in the headless server loop. */
const BROWSER_TRIGGERS = new Set(['wallet-event', 'webhook-receiver', 'telegram-trigger'])

export function flowRequiresWalletSigner(
  flowJson: { nodes?: Array<{ data?: { blockId?: string } }> } | null | undefined,
  options?: { hasDelegation?: boolean },
): boolean {
  if (!flowJson?.nodes) return false
  return flowJson.nodes.some((n) => {
    const blockId = n.data?.blockId ?? ''
    if (!SIGNER_BLOCKS.has(blockId)) return false
    if (options?.hasDelegation && DELEGATION_BLOCKS.has(blockId)) return false
    return true
  })
}

export function workflowNeedsZuikApp(
  flowJson: { nodes?: Array<{ data?: { blockId?: string } }> } | null | undefined,
  options?: { hasDelegation?: boolean },
): boolean {
  if (!flowJson?.nodes?.length) return true
  if (flowRequiresWalletSigner(flowJson, options)) return true
  return flowJson.nodes.some((n) => BROWSER_TRIGGERS.has(n.data?.blockId ?? ''))
}
