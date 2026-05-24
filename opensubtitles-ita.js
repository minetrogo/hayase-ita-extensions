// ============================================================
// Hayase Extension: Sub ITA Auto (OpenSubtitles)
// Estensione SUBTITLE per Hayase.
// Quando apri un episodio, cerca e carica automaticamente
// i sottotitoli italiani da OpenSubtitles.com (API REST v1).
//
// OpenSubtitles ha API gratuite (limite ~5 req/s, 200/giorno
// senza API key, di più con chiave gratuita).
// ============================================================

// ⚠️ OPZIONALE: inserisci qui la tua API key gratuita da
// https://www.opensubtitles.com/consumers
// Senza key funziona lo stesso ma con limiti più bassi.
const API_KEY = '' // es: 'abc123def456'

const BASE_URL = 'https://api.opensubtitles.com/api/v1'
const USER_AGENT = 'HayaseITASubs v1.0'

export default {
  async test() {
    try {
      const res = await fetch(`${BASE_URL}/infos/languages`, {
        headers: buildHeaders(),
        signal: AbortSignal.timeout(5000)
      })
      return res.ok
    } catch {
      return false
    }
  },

  // Hayase chiama single() quando ha bisogno dei sub per un episodio
  async single(query) {
    const { titles, episode, season, imdbId, tmdbId } = query

    const results = []

    // --- Strategia 1: cerca per IMDB ID (più preciso) ---
    if (imdbId) {
      const byImdb = await searchSubtitles({
        imdb_id: imdbId,
        season_number: season,
        episode_number: episode,
        languages: 'it'
      })
      results.push(...byImdb)
    }

    // --- Strategia 2: cerca per titolo ---
    if (results.length === 0 && titles && titles.length > 0) {
      const searchTitles = [...new Set([
        titles.find(t => t.type === 'romaji')?.title,
        titles.find(t => t.type === 'english')?.title,
        titles[0]?.title
      ].filter(Boolean))]

      for (const title of searchTitles.slice(0, 2)) {
        const byTitle = await searchSubtitles({
          query: title,
          season_number: season,
          episode_number: episode,
          languages: 'it',
          type: 'episode'
        })
        results.push(...byTitle)
        if (results.length > 0) break
      }
    }

    // --- Strategia 3: fallback inglese se ITA non trovato ---
    if (results.length === 0 && imdbId) {
      const english = await searchSubtitles({
        imdb_id: imdbId,
        season_number: season,
        episode_number: episode,
        languages: 'en'
      })
      // Marca chiaramente come sub ENG
      results.push(...english.map(s => ({ ...s, language: 'EN', note: 'Fallback inglese (ITA non trovato)' })))
    }

    // Ordina per download count (più popolari = migliore qualità)
    results.sort((a, b) => (b.downloadCount || 0) - (a.downloadCount || 0))

    return results.slice(0, 10)
  }
}

// ----------------------------------------------------------------
// Cerca sottotitoli su OpenSubtitles API v1
// ----------------------------------------------------------------
async function searchSubtitles(params) {
  try {
    // Costruisci query string
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) qs.set(k, String(v))
    }

    const res = await fetch(`${BASE_URL}/subtitles?${qs.toString()}`, {
      headers: buildHeaders(),
      signal: AbortSignal.timeout(10000)
    })

    if (!res.ok) return []

    const data = await res.json()
    if (!data.data || !Array.isArray(data.data)) return []

    const results = []
    for (const item of data.data) {
      const attrs = item.attributes || {}

      // Ottieni URL download tramite endpoint dedicato
      const downloadUrl = await getDownloadUrl(item.attributes?.files?.[0]?.file_id)
      if (!downloadUrl) continue

      results.push({
        url: downloadUrl,
        language: (attrs.language || 'it').toUpperCase(),
        label: buildLabel(attrs),
        downloadCount: attrs.download_count || 0,
        format: detectFormat(attrs.files?.[0]?.file_name || '')
      })
    }

    return results
  } catch {
    return []
  }
}

// ----------------------------------------------------------------
// Richiedi URL di download effettivo a OpenSubtitles
// ----------------------------------------------------------------
async function getDownloadUrl(fileId) {
  if (!fileId) return null

  try {
    const res = await fetch(`${BASE_URL}/download`, {
      method: 'POST',
      headers: {
        ...buildHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ file_id: fileId }),
      signal: AbortSignal.timeout(8000)
    })

    if (!res.ok) return null

    const data = await res.json()
    return data.link || null
  } catch {
    return null
  }
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------
function buildHeaders() {
  const headers = {
    'User-Agent': USER_AGENT,
    'Content-Type': 'application/json'
  }
  if (API_KEY) {
    headers['Api-Key'] = API_KEY
  }
  return headers
}

function buildLabel(attrs) {
  const parts = []
  if (attrs.language) parts.push(attrs.language.toUpperCase())
  if (attrs.release) parts.push(attrs.release)
  if (attrs.hearing_impaired) parts.push('HI')
  if (attrs.ai_translated) parts.push('AI')
  return parts.join(' · ') || 'Sottotitolo'
}

function detectFormat(filename) {
  const ext = filename.split('.').pop().toLowerCase()
  return ['srt', 'ass', 'ssa', 'vtt', 'sub'].includes(ext) ? ext : 'srt'
}
