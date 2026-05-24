// ============================================================
// Hayase Extension: Nyaa ITA/Multi
// Cerca su Nyaa.si dando priorità a release con sub/audio ITA
// ============================================================

export default {
  async test() {
    try {
      const res = await fetch('https://nyaa.si/?f=0&c=1_0&q=test&page=rss', { signal: AbortSignal.timeout(5000) })
      return res.ok
    } catch {
      return false
    }
  },

  async single(query) {
    const { titles, episode, season } = query

    if (!titles || titles.length === 0) return []

    // Prova prima il titolo originale poi quello romaji/inglese
    const searchTitles = [...new Set([
      titles.find(t => t.type === 'romaji')?.title,
      titles.find(t => t.type === 'english')?.title,
      titles[0]?.title
    ].filter(Boolean))]

    const results = []

    for (const title of searchTitles.slice(0, 2)) {
      // --- PRIMO: cerca release ITA specifiche ---
      const itaResults = await searchNyaa(title, episode, season, [
        `${title} ITA`,
        `${title} Italiano`,
        `${title} Italian`
      ])
      results.push(...itaResults)

      // --- SECONDO: cerca release multi-sub (spesso include ITA) ---
      const multiResults = await searchNyaa(title, episode, season, [
        `${title} multi`,
        `${title} multisub`,
        `${title} multilingual`
      ])
      results.push(...multiResults)

      // --- TERZO: release generiche come fallback ---
      const genericResults = await searchNyaa(title, episode, season, [title])
      results.push(...genericResults)
    }

    // Deduplicazione per infoHash/magnet
    const seen = new Set()
    const unique = results.filter(r => {
      const key = r.hash || r.magnet || r.title
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    // Ordina: ITA prima, poi multi, poi il resto
    unique.sort((a, b) => {
      const scoreA = getITAScore(a.title)
      const scoreB = getITAScore(b.title)
      if (scoreB !== scoreA) return scoreB - scoreA
      return (b.seeders || 0) - (a.seeders || 0)
    })

    return unique.slice(0, 20)
  }
}

// ----------------------------------------------------------------
// Funzione helper: cerca su Nyaa tramite RSS e ritorna array torrent
// ----------------------------------------------------------------
async function searchNyaa(baseTitle, episode, season, queries) {
  const results = []

  for (const q of queries) {
    try {
      const encoded = encodeURIComponent(q)
      // Categoria 1_2 = Anime (English-translated), 1_0 = Anime tutto
      const url = `https://nyaa.si/?f=0&c=1_0&q=${encoded}&page=rss`
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) continue

      const text = await res.text()
      const items = parseRSS(text)

      for (const item of items) {
        // Filtra per episodio se specificato
        if (episode && !matchesEpisode(item.title, episode, season)) continue

        results.push({
          title: item.title,
          magnet: item.magnet,
          hash: item.hash,
          seeders: item.seeders,
          size: item.size,
          quality: detectQuality(item.title),
          type: 'magnet'
        })
      }
    } catch (e) {
      // silenzioso, prova prossima query
    }
  }

  return results
}

// ----------------------------------------------------------------
// Parse RSS Nyaa → array di item
// ----------------------------------------------------------------
function parseRSS(xml) {
  const items = []
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g)

  for (const match of itemMatches) {
    const block = match[1]

    const title = extractTag(block, 'title')
    const magnet = extractAttr(block, 'nyaa:magnetUri') || extractTag(block, 'link')
    const seeders = parseInt(extractTag(block, 'nyaa:seeders') || '0', 10)
    const sizeStr = extractTag(block, 'nyaa:size') || ''
    const hash = extractInfoHash(magnet)

    if (!title || !magnet) continue

    items.push({ title, magnet, hash, seeders, size: sizeStr })
  }

  return items
}

function extractTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>(?:<\\!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'))
  return m ? m[1].trim() : ''
}

function extractAttr(xml, attr) {
  const m = xml.match(new RegExp(`<${attr}[^>]*>([\\s\\S]*?)<\\/${attr}>`, 'i'))
  if (m) return m[1].trim()
  // Prova anche formato self-closing con url=""
  const m2 = xml.match(new RegExp(`${attr}="([^"]*)"`, 'i'))
  return m2 ? m2[1].trim() : ''
}

function extractInfoHash(magnet) {
  if (!magnet) return ''
  const m = magnet.match(/xt=urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i)
  return m ? m[1].toLowerCase() : ''
}

// ----------------------------------------------------------------
// Helpers: punteggio ITA, qualità, match episodio
// ----------------------------------------------------------------
function getITAScore(title) {
  const t = title.toLowerCase()
  if (t.includes(' ita ') || t.includes('[ita]') || t.includes('(ita)') || t.endsWith(' ita')) return 100
  if (t.includes('italiano') || t.includes('italian')) return 90
  if (t.includes('multi') || t.includes('multisub') || t.includes('multilingual')) return 50
  return 0
}

function detectQuality(title) {
  const t = title.toLowerCase()
  if (t.includes('2160p') || t.includes('4k')) return '4K'
  if (t.includes('1080p')) return '1080p'
  if (t.includes('720p')) return '720p'
  if (t.includes('480p')) return '480p'
  return 'SD'
}

function matchesEpisode(title, episode, season) {
  // Cerca pattern tipo E05, 05, ep05, episodio 5
  const epNum = String(episode).padStart(2, '0')
  const epNumRaw = String(episode)
  const patterns = [
    new RegExp(`E${epNum}\\b`, 'i'),
    new RegExp(`EP${epNum}\\b`, 'i'),
    new RegExp(`\\b${epNum}\\b`),
    new RegExp(`Episode\\s*${epNumRaw}\\b`, 'i'),
    new RegExp(`Episodio\\s*${epNumRaw}\\b`, 'i'),
    new RegExp(`- ${epNum} `),
    new RegExp(`\\[${epNum}\\]`),
  ]
  return patterns.some(p => p.test(title))
}
