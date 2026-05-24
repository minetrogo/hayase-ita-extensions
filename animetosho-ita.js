export default new class AnimeToshoITA {
  base = 'https://feed.animetosho.org/json?q='

  async test() {
    const res = await fetch(this.base + 'one%20piece')
    return res.ok
  }

  async single({ titles, episode }) {
    if (!titles?.length) return []
    const title = titles[0]

    try {
      const res = await fetch(this.base + encodeURIComponent(title))
      if (!res.ok) return []
      const data = await res.json()
      if (!Array.isArray(data)) return []

      const results = data.map(item => ({
        title: item.title || '',
        link: item.magnet_uri || '',
        hash: (item.info_hash || '').toLowerCase(),
        seeders: Number(item.seeders || 0),
        leechers: Number(item.leechers || 0),
        downloads: Number(item.torrent_download_count || 0),
        size: Number(item.total_size || 0),
        date: item.timestamp ? new Date(item.timestamp * 1000) : new Date(),
        accuracy: 'medium',
        type: 'alt'
      })).filter(r => r.link)

      // ITA prima, poi per seeders
      results.sort((a, b) => {
        const sa = itaScore(a.title), sb = itaScore(b.title)
        if (sb !== sa) return sb - sa
        return b.seeders - a.seeders
      })

      return results.slice(0, 30)
    } catch {
      return []
    }
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
