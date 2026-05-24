export default new class NyaaITA {
  base = 'https://torrent-search-api-livid.vercel.app/api/nyaasi/'

  async test() {
    const res = await fetch(this.base + 'one%20piece')
    return res.ok
  }

  async single({ titles, episode }) {
    if (!titles?.length) return []
    const results = []

    // Cerca prima ITA, poi multi, poi generico
    const queries = [
      `${titles[0]} ITA`,
      `${titles[0]} Italiano`,
      `${titles[0]} multisub`,
      titles[0]
    ]

    const seen = new Set()

    for (const q of queries) {
      try {
        const res = await fetch(this.base + encodeURIComponent(q))
        if (!res.ok) continue
        const data = await res.json()
        if (!Array.isArray(data)) continue

        for (const item of data) {
          const hash = item.Magnet?.match(/btih:([A-Fa-f0-9]+)/i)?.[1] || ''
          if (seen.has(hash || item.Magnet)) continue
          seen.add(hash || item.Magnet)

          results.push({
            title: item.Name || '',
            link: item.Magnet || '',
            hash,
            seeders: Number(item.Seeders || 0),
            leechers: Number(item.Leechers || 0),
            downloads: Number(item.Downloads || 0),
            size: 0,
            date: new Date(item.DateUploaded || Date.now()),
            accuracy: 'medium',
            type: 'alt'
          })
        }
      } catch {}
    }

    // ITA prima, poi per seeders
    results.sort((a, b) => {
      const sa = itaScore(a.title), sb = itaScore(b.title)
      if (sb !== sa) return sb - sa
      return b.seeders - a.seeders
    })

    return results.slice(0, 30)
  }

  batch = this.single
  movie = this.single
}()

function itaScore(title) {
  const t = (title || '').toLowerCase()
  if (/\[ita\]|\(ita\)|\bita\b/.test(t)) return 100
  if (t.includes('italiano') || t.includes('italian')) return 90
  if (t.includes('multisub') || t.includes('multi-sub')) return 50
  return 0
}
