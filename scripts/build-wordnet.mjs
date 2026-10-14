import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const databaseDirectory = join(projectRoot, 'node_modules', 'wordnet-db', 'dict')
const outputDirectory = join(projectRoot, 'public', 'wordnet')
const dataFiles = [
  ['noun', 'noun'],
  ['verb', 'verb'],
  ['adj', 'adjective'],
  ['adv', 'adverb'],
]
const shards = new Map(Array.from('abcdefghijklmnopqrstuvwxyz', (letter) => [letter, {}]))

for (const [fileSuffix, label] of dataFiles) {
  const filename = join(databaseDirectory, `data.${fileSuffix}`)
  const content = await readFile(filename, 'utf8')

  for (const line of content.split(/\r?\n/)) {
    const separator = line.indexOf('|')
    if (separator < 0 || !/^\d{8}\s/.test(line)) continue

    const fields = line.slice(0, separator).trim().split(/\s+/)
    const wordCount = Number.parseInt(fields[3], 16)
    const [definitionText, ...exampleParts] = line.slice(separator + 1).trim().split('; ')
    const meaning = definitionText.trim()
    const example = exampleParts.join('; ').trim().replace(/^"|"$/g, '')
    if (!meaning) continue

    for (let index = 0; index < wordCount; index += 1) {
      const word = fields[4 + index * 2].toLowerCase().replaceAll('_', ' ')
      if (!/^[a-z][a-z '-]{1,59}$/.test(word)) continue
      const shard = shards.get(word[0])
      if (shard && !shard[word]) {
        shard[word] = { partOfSpeech: label, meaning, ...(example ? { example } : {}) }
      }
    }
  }
}

rmSync(outputDirectory, { recursive: true, force: true })
mkdirSync(outputDirectory, { recursive: true })

for (const [letter, entries] of shards) {
  if (Object.keys(entries).length) {
    writeFileSync(join(outputDirectory, `${letter}.json`), JSON.stringify(entries))
  }
}

copyFileSync(join(projectRoot, 'node_modules', 'wordnet-db', 'LICENSE'), join(outputDirectory, 'LICENSE'))
const wordCount = [...shards.values()].reduce((total, entries) => total + Object.keys(entries).length, 0)
console.log(`Generated WordNet 3.1 glossary for ${wordCount.toLocaleString()} words in ${shards.size} letter shards.`)