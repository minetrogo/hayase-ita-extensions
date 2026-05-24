// Hayase Extension: Nyaa ITA
// Cerca anime su Nyaa.si con priorità release italiane

export async function search(request, query) {
  const results = []

  // Cerca prima release ITA/italiano, poi multi-sub, poi generiche
  const queries = [
    `${query} ITA`,
    `${query} Italiano`,
    `${query} multisub`,
    query
  ]

  const seen = new Set()

  for (const q of queries) {
    try {
      const url = `https://nyaa.si/?f=0&c=1_0&q=${encodeURIComponent(q)}&page=rss`
      const xml = await request.text(url)
      const items = xml.split('<item>').slice(1)

      for (const item of items) {
        const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)
        const magnetMatch = item.match(/<nyaa:magnetUri>(.*?)<\/nyaa:magnetUri>/)
        const seedersMatch = item.match(/<nyaa:seeders>(.*?)<\/nyaa:seeders>/)

        if (!titleMatch || !magnetMatch) continue

        const title = titleMatch[1]
        const magnet = magnetMatch[1]
        const seeders = parseInt(seedersMatch?.[1] || '0')

        if (seen.has(magnet)) continue
        seen.add(magnet)

        results.push({
          title,
          url: magnet,
          seeders
        })
      }
    } catch (e) {
      // silenzioso, prova prossima query
    }
  }

  // Ordina: ITA prima, poi per seeders
  results.sort((a, b) => {
    const scoreA = getITAScore(a.title)
    const scoreB = getITAScore(b.title)
    if (scoreB !== scoreA) return scoreB - scoreA
    return (b.seeders || 0) - (a.seeders || 0)
  })

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
  if (t.includes('multisub') || t.includes('multi-sub') || t.includes('multi sub')) return 50
  return 0
}
