import type { AgentContext } from '../runAgent'
import { triggerExecutors } from './triggerExecutors'
import { logicExecutors } from './logicExecutors'
import { notificationExecutors } from './notificationExecutors'
import { blockExecutors } from '../../services/blockExecutors'
import type { ExecutorContext } from '../../services/blockExecutors'

export type ExecutorFn = (
  config: Record<string, string | number | undefined>,
  context: AgentContext,
  upstreamOutputs?: Record<string, unknown>
) => Promise<Record<string, unknown> | null>

function wrapActionExecutor(
  fn: (config: Record<string, string | number | undefined>, ctx: ExecutorContext) => Promise<Record<string, unknown>>
): ExecutorFn {
  return async (config, context, _upstreamOutputs) => {
    return fn(config, {
      sender: context.sender,
      signer: context.signer,
      algorand: context.algorand,
    })
  }
}

const wrappedActionExecutors: Record<string, ExecutorFn> = {}
for (const [key, fn] of Object.entries(blockExecutors)) {
  wrappedActionExecutors[key] = wrapActionExecutor(fn)
}

export const allExecutors: Record<string, ExecutorFn> = {
  ...triggerExecutors,
  ...logicExecutors,
  ...notificationExecutors,
  ...wrappedActionExecutors,
}
