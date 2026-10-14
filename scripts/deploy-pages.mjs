import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distDirectory = join(projectRoot, 'dist')
const deployDirectory = mkdtempSync(join(tmpdir(), 'margin-pages-'))

const gitOutput = (args) => execFileSync('git', args, {
  cwd: projectRoot,
  encoding: 'utf8',
}).trim()

const gitConfig = (key, fallback) => {
  try {
    return gitOutput(['config', '--get', key]) || fallback
  } catch {
    return fallback
  }
}

const remoteUrl = gitOutput(['remote', 'get-url', 'origin'])
const authorName = gitConfig('user.name', 'Margin Pages')
const authorEmail = gitConfig('user.email', 'pages@users.noreply.github.com')
const runGit = (args) => execFileSync('git', args, { cwd: deployDirectory, stdio: 'inherit' })

try {
  for (const entry of readdirSync(distDirectory)) {
    cpSync(join(distDirectory, entry), join(deployDirectory, entry), { recursive: true })
  }

  runGit(['init', '--initial-branch=gh-pages'])
  runGit(['config', 'user.name', authorName])
  runGit(['config', 'user.email', authorEmail])
  runGit(['add', '--all'])
  runGit(['commit', '-m', 'Deploy Margin Reader'])
  runGit(['remote', 'add', 'origin', remoteUrl])
  runGit(['push', '--force', 'origin', 'HEAD:gh-pages'])
} finally {
  rmSync(deployDirectory, { recursive: true, force: true })
}