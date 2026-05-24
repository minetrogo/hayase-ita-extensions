// Hayase Extension: Nyaa ITA
// TorrentQuery: { anilistId, titles: string[], episode?, resolution, exclusions, type? }
// TorrentResult: { title, link, seeders, leechers, downloads, accuracy, hash, size, date }

export default class TorrentSource {
  async test() {
    try {
      const res = await fetch('https://nyaa.si/?f=0&c=1_0&q=test&page=rss')
      return res.ok
    } catch {
      return false
    }
  }

  async single(query) {
    return searchNyaa(query)
  }

  async batch(query) {
    return searchNyaa(query)
  }

  async movie(query) {
    return searchNyaa(query)
  }
}

async function searchNyaa(query) {
  const titles = query.titles || []
  if (titles.length === 0) return []

  const title = titles[0]
  const episode = query.episode
  const results = []
  const seen = new Set()

  // Cerca: prima ITA, poi multi, poi generico
  const searches = [
    `${title} ITA`,
    `${title} Italiano`,
    `${title} multisub`,
    title
  ]

  for (const q of searches) {
    try {
      const url = `https://nyaa.si/?f=0&c=1_0&q=${encodeURIComponent(q)}&page=rss`
      const res = await fetch(url)
      if (!res.ok) continue
      const xml = await res.text()
      const items = xml.split('<item>').slice(1)

      for (const item of items) {
        const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)
        const magnetMatch = item.match(/<nyaa:magnetUri>(.*?)<\/nyaa:magnetUri>/)
        const seedersMatch = item.match(/<nyaa:seeders>(.*?)<\/nyaa:seeders>/)
        const leechersMatch = item.match(/<nyaa:leechers>(.*?)<\/nyaa:leechers>/)
        const downloadsMatch = item.match(/<nyaa:downloads>(.*?)<\/nyaa:downloads>/)
        const sizeMatch = item.match(/<nyaa:size>(.*?)<\/nyaa:size>/)
        const hashMatch = item.match(/<nyaa:infoHash>(.*?)<\/nyaa:infoHash>/)
        const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/)

        if (!titleMatch || !magnetMatch) continue

        const t = titleMatch[1]
        const magnet = magnetMatch[1]
        const hash = hashMatch?.[1] || magnet.match(/btih:([a-fA-F0-9]+)/i)?.[1] || ''

        if (seen.has(hash || magnet)) continue
        seen.add(hash || magnet)

        // Filtra per episodio se specificato
        if (episode && !matchEpisode(t, episode)) continue

        // Filtra parole escluse
        if (query.exclusions?.some(ex => t.toLowerCase().includes(ex.toLowerCase()))) continue

        const sizeBytes = parseSize(sizeMatch?.[1] || '0')

        results.push({
          title: t,
          link: magnet,
          seeders: parseInt(seedersMatch?.[1] || '0'),
          leechers: parseInt(leechersMatch?.[1] || '0'),
          downloads: parseInt(downloadsMatch?.[1] || '0'),
          accuracy: getAccuracy(t),
          hash: hash.toLowerCase(),
          size: sizeBytes,
          date: new Date(pubDateMatch?.[1] || Date.now())
        })
      }
    } catch (e) {
      // silenzioso
    }
  }

  // Ordina: ITA prima, poi per seeders
  results.sort((a, b) => {
    const sa = itaScore(a.title)
    const sb = itaScore(b.title)
    if (sb !== sa) return sb - sa
    return b.seeders - a.seeders
  })

  return results.slice(0, 30)
}

function itaScore(title) {
  const t = title.toLowerCase()
  if (t.includes('[ita]') || t.includes('(ita)') || /\bita\b/.test(t)) return 100
  if (t.includes('italiano') || t.includes('italian')) return 90
  if (t.includes('multisub') || t.includes('multi-sub')) return 50
  return 0
}

function getAccuracy(title) {
  const t = title.toLowerCase()
  if (t.includes('best') || t.includes('subsplease') || t.includes('erai')) return 'high'
  if (t.includes('blu-ray') || t.includes('bluray') || t.includes('bdrip')) return 'high'
  return 'medium'
}

function matchEpisode(title, episode) {
  const ep = String(episode).padStart(2, '0')
  const epRaw = String(episode)
  return new RegExp(`E${ep}\\b|EP${ep}\\b|\\b${ep}\\b|- ${ep} |\\[${ep}\\]`, 'i').test(title)
}

function parseSize(sizeStr) {
  if (!sizeStr) return 0
  const m = sizeStr.match(/([\d.]+)\s*(GiB|MiB|GB|MB|KiB|KB)/i)
  if (!m) return 0
  const n = parseFloat(m[1])
  const unit = m[2].toUpperCase()
  if (unit.startsWith('G')) return Math.round(n * 1024 * 1024 * 1024)
  if (unit.startsWith('M')) return Math.round(n * 1024 * 1024)
  if (unit.startsWith('K')) return Math.round(n * 1024)
  return 0
}
