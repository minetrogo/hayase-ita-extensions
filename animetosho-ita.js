// Hayase Extension: AnimeTosho ITA
// Cerca anime su AnimeTosho con priorità release italiane

export async function search(request, query) {
  const results = []
  const seen = new Set()

  try {
    const url = `https://feed.animetosho.org/rss2?q=${encodeURIComponent(query)}`
    const xml = await request.text(url)
    const items = xml.split('<item>').slice(1)

    for (const item of items) {
      const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/)
      const magnetMatch = item.match(/<torrent:magnetURI><!\[CDATA\[(.*?)\]\]><\/torrent:magnetURI>/) || item.match(/<link>(.*?)<\/link>/)

      if (!titleMatch) continue

      const title = titleMatch[1]
      const magnet = magnetMatch?.[1] || ''

      if (!magnet || seen.has(magnet)) continue
      seen.add(magnet)

      results.push({
        title,
        url: magnet
      })
    }
  } catch (e) {
    // silenzioso
  }

  // Ordina: ITA prima
  results.sort((a, b) => getITAScore(b.title) - getITAScore(a.title))

  return results.slice(0, 30)
}

export async function detail(request, url) {
  return {
    episodes: [
      {
        title: 'Guarda',
        url: url
      }
    ]
  }
}

function getITAScore(title) {
  const t = title.toLowerCase()
  if (t.includes('[ita]') || t.includes('(ita)') || / ita[. _\][]/.test(t)) return 100
  if (t.includes('italiano') || t.includes('italian')) return 90
  if (t.includes('multisub') || t.includes('multi')) return 50
  return 0
}
