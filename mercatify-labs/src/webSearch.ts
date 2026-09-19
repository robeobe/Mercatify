/**
 * Thin wrapper over Firecrawl's `/v1/search` endpoint — the only external,
 * network-calling tool in this package. Kept in its own file (rather than
 * folded into toolExecutor.ts) so it's obvious at a glance which single
 * function actually leaves the process.
 *
 * Never hardcode a key here or anywhere else in this repo. Read it from
 * `FIRECRAWL_API_KEY` (see `.env.example`) and keep `.env` out of git.
 */
export interface WebSearchResult {
  url: string
  title: string
  snippet: string
}

export interface WebSearchOptions {
  apiKey: string
  baseURL?: string
  limit?: number
}

export async function firecrawlSearch(query: string, options: WebSearchOptions): Promise<WebSearchResult[]> {
  const baseURL = (options.baseURL ?? 'https://api.firecrawl.dev').replace(/\/$/, '')
  const response = await fetch(`${baseURL}/v1/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({ query, limit: options.limit ?? 5 }),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`[mercatify-labs] Firecrawl search failed (${response.status}): ${body.slice(0, 300)}`)
  }
  const json = (await response.json()) as {
    success: boolean
    data?: Array<{ url: string; title: string; description?: string }>
  }
  if (!json.success || !json.data) {
    throw new Error('[mercatify-labs] Firecrawl search returned no data.')
  }
  return json.data.map((item) => ({
    url: item.url,
    title: item.title,
    snippet: (item.description ?? '').slice(0, 500),
  }))
}
