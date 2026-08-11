/**
 * URL-ish detection for launch mode: is this query something to open in a browser rather
 * than (only) fuzzy-match? Deliberately conservative — a false positive steals the top row
 * from an app match, a false negative just means no URL row.
 */

/** Common TLDs; a bare `foo.tld` only counts as a URL when tld is here. */
const TLDS = new Set([
  'com',
  'net',
  'org',
  'io',
  'dev',
  'app',
  'co',
  'me',
  'sh',
  'gg',
  'tv',
  'ai',
  'so',
  'to',
  'fm',
  'xyz',
  'info',
  'blog',
  'news',
  'cloud',
  'design',
  'store',
  'edu',
  'gov',
  'mil',
  'int',
  'biz',
  'au',
  'uk',
  'nz',
  'us',
  'ca',
  'de',
  'fr',
  'jp',
  'cn',
  'in',
  'br',
  'ru',
  'es',
  'it',
  'nl',
  'se',
  'no',
  'ch',
])

/**
 * Returns the openable URL (scheme added if missing) or null.
 */
export function detectUrl(query: string): string | null {
  const q = query.trim()
  if (q.length === 0 || /\s/.test(q)) return null

  if (/^https?:\/\/\S+$/i.test(q)) return q

  // localhost[:port][/path]
  if (/^localhost(:\d+)?(\/\S*)?$/i.test(q)) return `http://${q}`

  // host.tld[...]: hostname labels, known TLD, optional port/path/query/hash
  const match = q.match(
    /^([a-z0-9-]+(?:\.[a-z0-9-]+)*)\.([a-z]{2,})((?::\d+)?[/?#]\S*)?$/i,
  )
  if (match && TLDS.has(match[2]!.toLowerCase())) {
    return `https://${q}`
  }

  return null
}

/** Fill a `{query}` placeholder with the encoded query (quicklinks + search fallback). */
export function fillQuery(template: string, query: string): string {
  return template.replaceAll('{query}', encodeURIComponent(query))
}

/**
 * Where a quicklink trigger goes. With a query: the filled template. Bare trigger on a
 * search-style template ({query} present): the site root — `chill ⏎` means "take me to
 * chill.institute", not "search for nothing". Plain links and unparseable templates fall
 * back to fill-as-is.
 */
export function quicklinkTarget(template: string, query: string): string {
  const q = query.trim()
  if (q.length > 0 || !template.includes('{query}')) {
    return fillQuery(template, q)
  }
  try {
    return new URL(fillQuery(template, '')).origin + '/'
  } catch {
    return fillQuery(template, '')
  }
}
