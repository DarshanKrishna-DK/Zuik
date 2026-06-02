/**
 * test-aiagent-live: End-to-end headless AI-agent workflow via server scheduler.
 *
 * 1. Upserts a timer-loop -> ai-agent workflow in Supabase
 * 2. Links the funded agent sub-account + schedules a due run (requires_signer=false)
 * 3. Waits for the server poller to execute and records an on-chain tx
 * 4. Verifies the payment on TestNet via the indexer
 *
 * Prereqs: server running (npm start), GROQ_API_KEY, .keystore.json with agent key,
 * Guardian App 763727553, agent funded on TestNet.
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import algosdk from 'algosdk'

const AGENT = process.env.ZUIK_TEST_AGENT_ADDRESS ?? '2745CL2UWWO5LM2FKWGKCVVCG2FGD6RZMA7ALPTFTBEYO7X6ABW2QC7WM4'
const RECIPIENT = process.env.ZUIK_TEST_RECIPIENT ?? 'ZMDNZ4VGMVTKWIJNTYUGMBJR2GAKWVDCQ4WOGNGMITYAJ3BDSA7OOWXBYA'
const OWNER = process.env.ZUIK_TEST_OWNER_WALLET ?? '6YPTWY5MLXGB6R2UF45RQYTWQZLHBDNO6CG4EVOTXXLPPD3P6ZNZRZQBCQ'
const GUARDIAN_APP_ID = Number(process.env.GUARDIAN_APP_ID ?? 763727553)
const WORKFLOW_NAME = 'test-aiagent-live'
const POLL_MS = Number(process.env.ZUIK_LIVE_POLL_MS ?? 5000)
const TIMEOUT_MS = Number(process.env.ZUIK_LIVE_TIMEOUT_MS ?? 120000)

const ALGOD = process.env.ALGOD_URL ?? 'https://testnet-api.4160.nodely.dev'
const INDEXER = process.env.INDEXER_URL ?? 'https://testnet-idx.4160.nodely.dev'

const flowJson = {
  edges: [{ id: 'e1', source: 't1', target: 'a1' }],
  nodes: [
    {
      id: 't1',
      type: 'custom',
      position: { x: 0, y: 0 },
      data: { blockId: 'timer-loop', config: {}, label: 'Timer' },
    },
    {
      id: 'a1',
      type: 'custom',
      position: { x: 200, y: 0 },
      data: {
        blockId: 'ai-agent',
        label: 'AI Agent',
        config: {
          strategy:
            'On every scheduled run, pay exactly 0.2 ALGO to the allowlisted recipient. This is a live autonomous test; do not hold unless Guardian blocks you.',
          recipient: RECIPIENT,
          maxAmount: 0.3,
        },
      },
    },
  ],
}

function sb() {
  const url = process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim()
  if (!url || !key) throw new Error('Missing SUPABASE_URL or API key in .env')
  return createClient(url, key)
}

async function getAccountBalance(addr) {
  const client = new algosdk.Algodv2('', ALGOD, '')
  const acct = await client.accountInformation(addr).do()
  return BigInt(acct.amount ?? 0)
}

async function verifyTxOnChain(txId) {
  const indexer = new algosdk.Indexer('', INDEXER, '')
  const pending = await indexer.lookupTransactionByID(txId).do()
  const tx = pending.transaction
  if (!tx) return { ok: false, reason: 'tx not found' }
  const pay = tx.paymentTransaction
  const sender = tx.sender
  const receiver = pay?.receiver
  const amount = pay?.amount != null ? String(pay.amount) : undefined
  return {
    ok: true,
    sender,
    receiver,
    amountMicroAlgos: amount,
    confirmedRound: tx['confirmed-round'] ?? tx.confirmedRound,
  }
}

async function upsertWorkflow(client) {
  const { data: existing } = await client
    .from('workflows')
    .select('id')
    .eq('wallet_address', OWNER)
    .eq('name', WORKFLOW_NAME)
    .maybeSingle()

  if (existing?.id) {
    const { data, error } = await client
      .from('workflows')
      .update({
        flow_json: flowJson,
        description: 'Live headless AI agent -> Guardian payment (test-aiagent-live)',
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('id')
      .single()
    if (error) throw error
    return data.id
  }

  const { data, error } = await client
    .from('workflows')
    .insert({
      wallet_address: OWNER,
      name: WORKFLOW_NAME,
      description: 'Live headless AI agent -> Guardian payment (test-aiagent-live)',
      flow_json: flowJson,
      is_active: true,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

async function linkAgentWallet(client, workflowId) {
  const { data: row } = await client
    .from('agent_wallets')
    .select('id')
    .eq('agent_address', AGENT)
    .maybeSingle()

  const payload = {
    workflow_id: workflowId,
    wallet_address: OWNER,
    agent_address: AGENT,
    guardian_app_id: GUARDIAN_APP_ID,
    status: 'active',
  }

  if (row?.id) {
    const { error } = await client.from('agent_wallets').update(payload).eq('id', row.id)
    if (error) throw error
    return
  }

  const { error } = await client.from('agent_wallets').insert(payload)
  if (error) throw error
}

async function scheduleDueRun(client, workflowId) {
  const now = new Date().toISOString()
  const past = new Date(Date.now() - 2000).toISOString()

  const { error } = await client.from('workflow_schedules').upsert(
    {
      workflow_id: workflowId,
      wallet_address: OWNER,
      interval_sec: 60,
      max_iterations: 1,
      iterations_completed: 0,
      next_run_at: past,
      is_active: true,
      requires_signer: false,
      agent_address: AGENT,
      schedule_type: 'start_at',
      flow_json: flowJson,
      updated_at: now,
    },
    { onConflict: 'workflow_id,schedule_type' },
  )
  if (error) throw error
}

async function waitForExecution(client, workflowId, startedAtIso) {
  const deadline = Date.now() + TIMEOUT_MS
  while (Date.now() < deadline) {
    const { data: rows, error } = await client
      .from('executions')
      .select('id, status, tx_ids, block_logs, started_at')
      .eq('workflow_id', workflowId)
      .gte('started_at', startedAtIso)
      .order('started_at', { ascending: false })
      .limit(3)

    if (error) {
      console.warn('[wait] executions query:', error.message)
    } else if (rows?.length) {
      for (const row of rows) {
        const logs = row.block_logs ?? []
        const aiLog = logs.find((l) => l.blockId === 'ai-agent' && l.type === 'success')
        const payLog = logs.find(
          (l) => l.blockId === 'ai-agent' && l.message?.includes('AI payment authorized'),
        )
        const txIds = row.tx_ids ?? []
        if (aiLog || payLog || txIds.length > 0) {
          return row
        }
        if (row.status === 'failed') {
          const errLog = logs.find((l) => l.type === 'error')
          throw new Error(errLog?.message ?? 'Execution failed')
        }
      }
    }

    await new Promise((r) => setTimeout(r, POLL_MS))
    process.stdout.write('.')
  }
  throw new Error(`Timed out after ${TIMEOUT_MS}ms waiting for execution`)
}

async function main() {
  console.log('=== test-aiagent-live ===')
  console.log(`Agent: ${AGENT}`)
  console.log(`Recipient: ${RECIPIENT}`)
  console.log(`Guardian App: ${GUARDIAN_APP_ID}`)
  console.log(`Server should be polling schedules (PORT=${process.env.PORT ?? 4030})`)

  const balanceBefore = await getAccountBalance(AGENT)
  console.log(`Agent balance before: ${balanceBefore} microAlgos`)

  const client = sb()
  const startedAt = new Date().toISOString()

  const workflowId = await upsertWorkflow(client)
  console.log(`Workflow id: ${workflowId}`)

  await linkAgentWallet(client, workflowId)
  console.log('Agent wallet linked to workflow')

  await scheduleDueRun(client, workflowId)
  console.log(`Schedule queued (next_run_at in the past). Waiting for server poller...`)

  const execution = await waitForExecution(client, workflowId, startedAt)
  console.log('\nExecution recorded:', execution.id, execution.status)
  console.log('tx_ids:', execution.tx_ids)

  const aiLogs = (execution.block_logs ?? []).filter((l) => l.blockId === 'ai-agent')
  console.log('AI block logs:')
  for (const l of aiLogs) {
    console.log(`  [${l.type}] ${l.message}`)
    if (l.detail) console.log('   detail:', JSON.stringify(l.detail))
  }

  const txId = execution.tx_ids?.[0]
  if (!txId) {
    throw new Error('No tx_ids on execution - payment may not have been submitted')
  }

  const chain = await verifyTxOnChain(txId)
  console.log('On-chain verification:', JSON.stringify(chain, null, 2))

  const balanceAfter = await getAccountBalance(AGENT)
  console.log(`Agent balance after: ${balanceAfter} microAlgos (delta ${balanceAfter - balanceBefore})`)

  const schedule = await client
    .from('workflow_schedules')
    .select('is_active, iterations_completed')
    .eq('workflow_id', workflowId)
    .eq('schedule_type', 'start_at')
    .maybeSingle()

  console.log('Schedule state:', schedule.data)

  if (!chain.ok) throw new Error('Transaction not found on indexer')
  if (chain.sender !== AGENT) {
    console.warn(`Warning: tx sender ${chain.sender} != agent ${AGENT}`)
  }

  console.log('\nPASS: test-aiagent-live completed (AI -> Guardian -> on-chain payment)')
}

main().catch((e) => {
  console.error('\nFAIL:', e instanceof Error ? e.message : e)
  process.exit(1)
})
