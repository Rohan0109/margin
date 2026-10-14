export type DictionaryEntry = {
  partOfSpeech: string
  meaning: string
  example?: string
  source?: string
}

type WordnetShard = Record<string, DictionaryEntry>

const loadedShards = new Map<string, Promise<WordnetShard>>()
const definitionCachePrefix = 'margin-definition:'

export function normalizeWord(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z'-]/g, '')

  return (normalized.match(/[a-z]/g)?.length ?? 0) >= 3 ? normalized : ''
}

function wordForms(word: string): string[] {
  const forms = new Set([word])
  const add = (form: string) => {
    if (form.length >= 3) forms.add(form)
  }

  if (word.endsWith('ies')) add(`${word.slice(0, -3)}y`)
  if (word.endsWith('es')) add(word.slice(0, -2))
  if (word.endsWith('s')) add(word.slice(0, -1))
  if (word.endsWith('ied')) add(`${word.slice(0, -3)}y`)
  if (word.endsWith('ed')) {
    const stem = word.slice(0, -2)
    add(stem)
    add(`${stem}e`)
    if (/(.)\1$/.test(stem)) add(stem.slice(0, -1))
  }
  if (word.endsWith('ing')) {
    const stem = word.slice(0, -3)
    add(stem)
    add(`${stem}e`)
    if (/(.)\1$/.test(stem)) add(stem.slice(0, -1))
  }
  if (word.endsWith('est')) add(word.slice(0, -3))
  if (word.endsWith('er')) add(word.slice(0, -2))

  return [...forms]
}

async function loadShard(letter: string): Promise<WordnetShard> {
  let shardPromise = loadedShards.get(letter)
  if (!shardPromise) {
    const url = new URL(`${import.meta.env.BASE_URL}wordnet/${letter}.json`, location.href).href
    shardPromise = (async () => {
      const cached = 'caches' in window ? await caches.match(url) : undefined
      const response = cached ?? await fetch(url)
      if (!response.ok) throw new Error(`WordNet shard request failed (${response.status})`)
      return await response.json() as WordnetShard
    })()
    loadedShards.set(letter, shardPromise)
    shardPromise.catch(() => loadedShards.delete(letter))
  }

  return shardPromise
}

function readCachedDefinition(word: string): DictionaryEntry | null {
  try {
    const cached = localStorage.getItem(`${definitionCachePrefix}${word}`)
    return cached ? JSON.parse(cached) as DictionaryEntry : null
  } catch {
    return null
  }
}

function cacheDefinition(word: string, entry: DictionaryEntry): void {
  try {
    localStorage.setItem(`${definitionCachePrefix}${word}`, JSON.stringify(entry))
  } catch {
  }
}

async function lookupOnline(word: string, signal?: AbortSignal): Promise<DictionaryEntry | null> {
  const url = `https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&md=d&max=1`
  const timeoutSignal = AbortSignal.timeout(2500)
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
  const response = await fetch(url, { signal: requestSignal })
  if (!response.ok) return null

  const entries = await response.json() as Array<{ word?: string; defs?: string[] }>
  const exactEntry = entries.find((entry) => entry.word?.toLowerCase() === word)
  const rawDefinition = exactEntry?.defs?.find((value) => value.includes('\t'))
  if (!rawDefinition) return null

  const [partOfSpeechCode, ...definitionParts] = rawDefinition.split('\t')
  const partOfSpeech = ({ n: 'noun', v: 'verb', adj: 'adjective', adv: 'adverb' } as Record<string, string>)[partOfSpeechCode]
  const meaning = definitionParts.join('\t').trim()
  if (!partOfSpeech || !meaning) return null
  return { partOfSpeech, meaning, source: 'Online dictionary' }
}

export async function lookupWord(word: string, signal?: AbortSignal): Promise<DictionaryEntry | null> {
  const term = normalizeWord(word)
  if (!term) return null

  const cachedDefinition = readCachedDefinition(term)
  if (cachedDefinition) return cachedDefinition

  try {
    const onlineDefinition = await lookupOnline(term, signal)
    if (signal?.aborted) return null
    if (onlineDefinition) {
      cacheDefinition(term, onlineDefinition)
      return onlineDefinition
    }
  } catch {
    if (signal?.aborted) return null
  }

  for (const form of wordForms(term)) {
    const shard = await loadShard(form[0])
    const entry = shard[form]
    if (entry) {
      cacheDefinition(term, entry)
      return entry
    }
  }

  return null
}