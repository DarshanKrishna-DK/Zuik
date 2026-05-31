import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? ''

async function validateKey(key: string): Promise<boolean> {
  if (!SUPABASE_URL || !key) return false
  const sb = createClient(SUPABASE_URL, key)
  const { error } = await sb.from('workflow_schedules').select('id').limit(1)
  return !error
}

function decodeJwtRole(key: string): string | null {
  try {
    const payload = key.split('.')[1]
    if (!payload) return null
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { role?: string }
    return json.role ?? null
  } catch {
    return null
  }
}

function isElevatedKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true
  return decodeJwtRole(key) === 'service_role'
}

/**
 * Resolve a working Supabase key. Prefers secret/service_role keys; falls back to anon key.
 */
export async function createValidatedSupabaseClient(): Promise<SupabaseClient> {
  const candidates: { label: string; key: string }[] = [
    { label: 'SUPABASE_SECRET_KEY', key: process.env.SUPABASE_SECRET_KEY?.trim() ?? '' },
    { label: 'SUPABASE_SERVICE_KEY', key: process.env.SUPABASE_SERVICE_KEY?.trim() ?? '' },
    { label: 'SUPABASE_ANON_KEY', key: process.env.SUPABASE_ANON_KEY?.trim() ?? '' },
  ]

  let sawInvalidElevatedKey = false

  for (const { label, key } of candidates) {
    if (!key) continue
    if (!(await validateKey(key))) {
      if (isElevatedKey(key)) {
        sawInvalidElevatedKey = true
      }
      continue
    }

    if (label === 'SUPABASE_ANON_KEY') {
      if (sawInvalidElevatedKey) {
        console.warn(
          '[Supabase] Elevated key invalid. Using SUPABASE_ANON_KEY fallback (dev only). ' +
            'Add a fresh sb_secret key from Dashboard > Settings > API Keys.',
        )
      } else {
        console.warn('[Supabase] Using SUPABASE_ANON_KEY for server operations (dev only).')
      }
    } else {
      const role = key.startsWith('sb_secret_') ? 'secret' : decodeJwtRole(key) ?? 'elevated'
      console.log(`[Supabase] Connected with ${role} key (${label})`)
    }

    return createClient(SUPABASE_URL, key)
  }

  throw new Error(
    'No valid Supabase API key. Set SUPABASE_SECRET_KEY or SUPABASE_SERVICE_KEY in projects/server/.env',
  )
}
