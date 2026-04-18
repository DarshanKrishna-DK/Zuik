/**
 * Edge Function: saber-sign
 *
 * Returns HMAC signatures for Saber Money API calls. Keep SABER_CLIENT_SECRET in
 * Supabase secrets only (Dashboard - Edge Functions - saber-sign - Secrets).
 *
 * Deploy: supabase functions deploy saber-sign --project-ref <ref>
 * Secrets: SABER_CLIENT_ID, SABER_CLIENT_SECRET
 */

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function hmacSha256(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const clientId = Deno.env.get('SABER_CLIENT_ID') ?? ''
  const clientSecret = Deno.env.get('SABER_CLIENT_SECRET') ?? ''
  if (!clientId || !clientSecret) {
    return new Response(JSON.stringify({ error: 'Saber signing not configured on server' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: { kind?: string; userId?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const kind = body.kind
  const userId = typeof body.userId === 'string' ? body.userId : ''

  const timestamp = Math.floor(Date.now() / 1000).toString()
  let sigString = ''

  if (kind === 'admin') {
    sigString = clientId + timestamp
  } else if (kind === 'user' && userId) {
    sigString = clientId + timestamp + userId
  } else if (kind === 'sdk' && userId) {
    sigString = clientId + timestamp + 'sdk' + userId
  } else {
    return new Response(JSON.stringify({ error: 'Invalid kind or missing userId' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const signature = await hmacSha256(sigString, clientSecret)

  return new Response(JSON.stringify({ signature, timestamp }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
