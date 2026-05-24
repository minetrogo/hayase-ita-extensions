// Hayase Extension: AnimeTosho ITA
// Usa AnimeTosho JSON API - indicizza torrent da Nyaa con metadati lingua

export default class TorrentSource {
  async test() {
    try {
      const res = await fetch('https://feed.animetosho.org/json?eid=1')
      return res.ok
    } catch {
      return false
    }
  }

  async single(query) {
    return searchAnimeTosho(query)
  }

  async batch(query) {
    return searchAnimeTosho(query)
  }

  async movie(query) {
    return searchAnimeTosho(query)
  }
}

async function searchAnimeTosho(query) {
  const titles = query.titles || []
  if (titles.length === 0) return []

  const title = titles[0]
  const episode = query.episode
  const results = []
  const seen = new Set()

  try {
    const url = `https://feed.animetosho.org/json?q=${encodeURIComponent(title)}&qx=1`
    const res = await fetch(url)
    if (!res.ok) return []

    const data = await res.json()
    if (!Array.isArray(data)) return []

    for (const item of data) {
      const t = item.title || ''
      const magnet = item.magnet_uri || buildMagnet(item.info_hash, t)
      const hash = (item.info_hash || '').toLowerCase()

      if (!magnet || seen.has(hash || magnet)) continue
      seen.add(hash || magnet)

      if (episode && !matchEpisode(t, episode)) continue
      if (query.exclusions?.some(ex => t.toLowerCase().includes(ex.toLowerCase()))) continue

      results.push({
        title: t,
        link: magnet,
        seeders: item.seeders || 0,
        leechers: item.leechers || 0,
        downloads: item.torrent_download_count || 0,
        accuracy: getAccuracy(t, item),
        hash: hash,
        size: item.total_size || 0,
        date: item.timestamp ? new Date(item.timestamp * 1000) : new Date()
      })
    }
  } catch (e) {
    // silenzioso
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
  if (t.includes('multisub') || t.includes('multi-sub') || t.includes('multi ')) return 50
  return 0
}

function getAccuracy(title, item) {
  const t = title.toLowerCase()
  if (t.includes('subsplease') || t.includes('erai-raws') || t.includes('blu-ray')) return 'high'
  if ((item.seeders || 0) > 10) return 'medium'
  return 'low'
}

function buildMagnet(hash, title) {
  if (!hash) return null
  const trackers = [
    'udp://open.demonii.com:1337/announce',
    'udp://tracker.openbittorrent.com:80',
    'udp://tracker.opentrackr.org:1337/announce'
  ]
  const name = title ? `&dn=${encodeURIComponent(title)}` : ''
  const tr = trackers.map(t => `&tr=${encodeURIComponent(t)}`).join('')
  return `magnet:?xt=urn:btih:${hash}${name}${tr}`
}

function matchEpisode(title, episode) {
  const ep = String(episode).padStart(2, '0')
  return new RegExp(`E${ep}\\b|EP${ep}\\b|\\b${ep}\\b|- ${ep} |\\[${ep}\\]`, 'i').test(title)
}
