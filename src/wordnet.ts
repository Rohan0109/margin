export type DictionaryEntry = {
  partOfSpeech: string
  meaning: string
  example?: string
}

type WordnetShard = Record<string, DictionaryEntry>

const loadedShards = new Map<string, Promise<WordnetShard>>()

export function normalizeWord(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z'-]/g, '')

  return (normalized.match(/[a-z]/g)?.length ?? 0) >= 3 ? normalized : ''
}

export async function lookupWord(word: string, signal?: AbortSignal): Promise<DictionaryEntry | null> {
  const term = normalizeWord(word)
  if (!term) return null

  const letter = term[0]
  let shardPromise = loadedShards.get(letter)
  if (!shardPromise) {
    const url = `${import.meta.env.BASE_URL}wordnet/${letter}.json`
    shardPromise = fetch(url, { signal }).then(async (response) => {
      if (!response.ok) throw new Error(`WordNet shard request failed (${response.status})`)
      return await response.json() as WordnetShard
    })
    loadedShards.set(letter, shardPromise)
    shardPromise.catch(() => loadedShards.delete(letter))
  }

  const shard = await shardPromise
  return shard[term] ?? null
}