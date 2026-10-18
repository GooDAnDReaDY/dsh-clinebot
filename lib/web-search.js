/**
 * ClineBot Native WebSearchProvider for ctx.web (Issue #233)
 *
 * Implements DSH WebSearchProvider contract so the model-facing
 * web_search tool can search the web via ClinePass upstream.
 */

export const CLINEBOT_SEARCH_PROVIDER_ID = 'clinebot'

function clampNumResults(maxResults) {
  const n = Number(maxResults)
  if (Number.isNaN(n) || n <= 0) return 5
  return Math.max(1, Math.min(10, Math.round(n)))
}

function toSource(result) {
  if (!result || typeof result !== 'object') return null
  const url = String(result.url || '').trim()
  if (!url) return null
  const title = String(result.title || '').trim()
  const snippet = String(result.snippet || '').trim()
  return {
    url,
    ...(title ? { title } : {}),
    ...(snippet ? { snippet } : {}),
  }
}

export class ClineBotSearchProvider {
  constructor(deps) {
    this.deps = deps || {}
    this.id = CLINEBOT_SEARCH_PROVIDER_ID
  }

  available() {
    const base = this.deps.getBaseUrl ? this.deps.getBaseUrl() : 'https://api.cline.bot/api/v1'
    return Boolean(base && typeof base === 'string')
  }

  async search(request, signal) {
    if (signal?.aborted) {
      const err = new Error('ClineBot web search aborted')
      err.name = 'AbortError'
      throw err
    }

    const query = String(request?.query || '').trim()
    if (!query) return { sources: [] }

    const baseUrl = (this.deps.getBaseUrl ? this.deps.getBaseUrl() : 'https://api.cline.bot/api/v1').replace(/\/+$/, '')
    const key = this.deps.getApiKey ? await this.deps.getApiKey() : ''
    const endpoint = `${baseUrl}/alpha/web-search`
    const numResults = clampNumResults(request?.maxResults)

    const fetchImpl = this.deps.fetchImpl || fetch

    try {
      const resp = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
          'x-cli-environment': 'production',
        },
        body: JSON.stringify({ query, numResults }),
        signal,
      })

      if (!resp.ok) {
        return { sources: [] }
      }

      const data = await resp.json().catch(() => ({}))
      const rawResults = Array.isArray(data?.results) ? data.results : []
      const sources = rawResults.map(toSource).filter(Boolean)
      return { sources }
    } catch (err) {
      if (err.name === 'AbortError') throw err
      return { sources: [] }
    }
  }
}
