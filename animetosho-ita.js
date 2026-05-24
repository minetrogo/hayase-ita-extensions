// ============================================================
// Hayase Extension: AnimeTosho ITA
// Usa le API JSON di AnimeTosho con filtro lingua italiana
// AnimeTosho indicizza torrent da Nyaa e altri tracker,
// e ha metadati ricchi (inclusa lingua sub/audio).
// ============================================================

export default {
  async test() {
    try {
      const res = await fetch('https://feed.animetosho.org/json?eid=1', { signal: AbortSignal.timeout(5000) })
      return res.ok
    } catch {
      return false
    }
  },

  async single(query) {
    const { titles, episode, season, options } = query
    const preferITA = options?.preferITA !== false // default true

    if (!titles || titles.length === 0) return []

    // Prepara varianti del titolo
    const searchTitles = [...new Set([
      titles.find(t => t.type === 'romaji')?.title,
      titles.find(t => t.type === 'english')?.title,
      titles[0]?.title
    ].filter(Boolean))]

    const allResults = []

    for (const title of searchTitles.slice(0, 2)) {
      const items = await fetchAnimeTosho(title, episode, season)
      allResults.push(...items)
    }

    // Deduplicazione
    const seen = new Set()
    const unique = allResults.filter(r => {
      const key = r.hash || r.magnet
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    if (preferITA) {
      // Ordina: ITA/multi prima, poi per seeders
      unique.sort((a, b) => {
        const scoreA = getLanguageScore(a)
        const scoreB = getLanguageScore(b)
        if (scoreB !== scoreA) return scoreB - scoreA
        return (b.seeders || 0) - (a.seeders || 0)
      })
    } else {
      unique.sort((a, b) => (b.seeders || 0) - (a.seeders || 0))
    }

    return unique.slice(0, 25)
  }
}

// ----------------------------------------------------------------
// Fetch da AnimeTosho JSON API
// ----------------------------------------------------------------
async function fetchAnimeTosho(title, episode, season) {
  const results = []

  try {
    const q = encodeURIComponent(title)
    const url = `https://feed.animetosho.org/json?q=${q}&qx=1`

    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return []

    const data = await res.json()
    if (!Array.isArray(data)) return []

    for (const item of data) {
      // AnimeTosho ha campo "sub_languages" e "audio_languages"
      const subLangs = item.sub_languages || []
      const audioLangs = item.audio_languages || []

      // Filtra per episodio se specificato
      if (episode && !matchesEpisode(item.title || '', episode, season)) continue

      // Costruisci magnet se non presente direttamente
      const magnet = item.magnet_uri || buildMagnet(item.info_hash, item.title)
      if (!magnet) continue

      results.push({
        title: item.title || 'Sconosciuto',
        magnet: magnet,
        hash: item.info_hash,
        seeders: item.seeders || 0,
        size: item.total_size ? formatSize(item.total_size) : '',
        quality: detectQuality(item.title || ''),
        type: 'magnet',
        // Metadati lingua per il sorting
        _subLangs: subLangs,
        _audioLangs: audioLangs
      })
    }
  } catch (e) {
    // silenzioso
  }

  return results
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------
function getLanguageScore(item) {
  const subLangs = (item._subLangs || []).map(l => l.toLowerCase())
  const audioLangs = (item._audioLangs || []).map(l => l.toLowerCase())
  const title = (item.title || '').toLowerCase()

  // Audio ITA = massimo punteggio
  if (audioLangs.includes('it') || audioLangs.includes('ita') || audioLangs.includes('italian')) return 100

  // Sub ITA esplicito nei metadati
  if (subLangs.includes('it') || subLangs.includes('ita') || subLangs.includes('italian')) return 90

  // Keyword ITA nel titolo
  if (title.includes(' ita') || title.includes('[ita]') || title.includes('(ita)') || title.includes('italiano')) return 85

  // Multi-sub (spesso include ITA)
  if (subLangs.length > 3) return 60
  if (title.includes('multi') || title.includes('multilingual') || title.includes('multisub')) return 55

  return 0
}

function buildMagnet(infoHash, title) {
  if (!infoHash) return null
  const trackers = [
    'udp://open.demonii.com:1337/announce',
    'udp://tracker.openbittorrent.com:80',
    'udp://tracker.coppersurfer.tk:6969',
    'udp://glotorrents.pw:6969/announce',
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://torrent.gresille.org:80/announce',
    'udp://p4p.arenabg.com:1337',
    'udp://tracker.leechers-paradise.org:6969'
  ]
  const name = title ? `&dn=${encodeURIComponent(title)}` : ''
  const tr = trackers.map(t => `&tr=${encodeURIComponent(t)}`).join('')
  return `magnet:?xt=urn:btih:${infoHash}${name}${tr}`
}

function formatSize(bytes) {
  if (!bytes) return ''
  const gb = bytes / (1024 ** 3)
  if (gb >= 1) return `${gb.toFixed(2)} GB`
  const mb = bytes / (1024 ** 2)
  return `${mb.toFixed(0)} MB`
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
