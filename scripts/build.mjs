// Build script for @deepseek-ai/dsh-mission: typecheck + emit lib/.
// Resolves a TypeScript compiler from the first available source:
//   1. a local devDependency install (node_modules/typescript/bin/tsc)
//   2. any npx cache under %LOCALAPPDATA%\npm-cache\_npx\* (already on this machine)
//   3. `npx -y -p typescript tsc` (downloads into the npx cache; needs network)
// The junctioned node_modules supplies ONLY the @deepseek-ai/* type closure —
// never run `npm i` in this package while it is a junction, or the install
// writes into the shared npm cache the junction points at.
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Every place a tsc entry JS may live on this machine, in preference order. */
function candidates() {
  const list = [join(root, 'node_modules', 'typescript', 'bin', 'tsc')]
  try {
    const cache = join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'npm-cache', '_npx')
    if (existsSync(cache)) {
      for (const hash of readdirSync(cache)) {
        list.push(join(cache, hash, 'node_modules', 'typescript', 'bin', 'tsc'))
      }
    }
  } catch {
    /* cache unreadable — fall through to the npx fallback */
  }
  return list
}

const tsc = candidates().find(existsSync)
if (tsc) {
  const run = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.json'], { cwd: root, stdio: 'inherit' })
  process.exit(run.status ?? 1)
}

console.error('build: no local TypeScript compiler found; trying `npx -y -p typescript tsc` (needs network)')
const run = spawnSync('npx', ['-y', '-p', 'typescript', 'tsc', '-p', 'tsconfig.json'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})
process.exit(run.status ?? 1)
