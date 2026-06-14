import { createBrowserClient } from '@supabase/ssr'

let client: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  if (client) return client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error('Supabase environment variables are missing')
  }

  client = createBrowserClient(url, anonKey, {
    global: {
      fetch: async (input, init) => {
        try {
          return await fetch(input, init)
        } catch (error) {
          console.warn('Supabase fetch failed (handled gracefully):', error)
          return new Response(
            JSON.stringify({
              error: 'network_error',
              message: error instanceof Error ? error.message : 'Failed to fetch'
            }),
            {
              status: 503,
              statusText: 'Service Unavailable',
              headers: { 'Content-Type': 'application/json' }
            }
          )
        }
      }
    }
  })

  return client
}

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  return !!(url && url.startsWith('https://') && !url.includes('placeholder'))
}
