// Deterministic release archive builder for @oxmumu3/dsh-incidental-learn.
// Fixed mtime/uid/gid/sort-order + gzip mtime 0 guarantees reproducible SHA-256.

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const MTIME = 1_794_614_400 // 2026-11-14T00:00:00Z
const MODE = 0o644

function fail(message) {
  console.error(`build-package: ${message}`)
  process.exit(1)
}

function parseArgs(argv) {
  let out = path.join(root, 'dist')
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out' && argv[i + 1]) {
      out = path.resolve(argv[i + 1])
      i += 1
    } else if (argv[i] === '--help') {
      console.log('Usage: node scripts/build-package.mjs [--out <dir>]')
      process.exit(0)
    } else {
      fail(`unknown argument: ${argv[i]}`)
    }
  }
  return { out }
}

function expand(pattern) {
  if (!pattern.endsWith('/')) return [pattern]
  const base = pattern.slice(0, -1)
  const found = []
  const walk = rel => {
    for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const next = `${rel}/${entry.name}`
      if (entry.isDirectory()) walk(next)
      else if (entry.isFile()) found.push(next)
    }
  }
  walk(base)
  return found
}

function listPackageFiles() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const declared = Array.isArray(manifest.files) ? manifest.files : []
  if (declared.length === 0) fail('package.json has no files whitelist')
  const names = new Set(['package.json'])
  for (const pattern of declared) {
    for (const name of expand(pattern)) names.add(name)
  }
  const sorted = [...names].sort()
  for (const name of sorted) {
    if (name.startsWith('/') || name.includes('..')) fail(`unsafe path in whitelist: ${name}`)
    const full = path.join(root, name)
    if (!fs.existsSync(full)) fail(`missing whitelist file: ${name}`)
    if (fs.statSync(full).isDirectory()) fail(`directory in whitelist: ${name}`)
  }
  return { manifest, names: sorted }
}

function header(name, size) {
  if (Buffer.byteLength(name) > 100) fail(`path exceeds 100 bytes for ustar: ${name}`)
  const block = Buffer.alloc(512, 0)
  block.write(name, 0, 100, 'utf8')
  block.write(MODE.toString(8).padStart(7, '0') + '\0', 100, 8, 'ascii')
  block.write('0000000\0', 108, 8, 'ascii')
  block.write('0000000\0', 116, 8, 'ascii')
  block.write(size.toString(8).padStart(11, '0') + '\0', 124, 12, 'ascii')
  block.write(MTIME.toString(8).padStart(11, '0') + '\0', 136, 12, 'ascii')
  block.write('        ', 148, 8, 'ascii')
  block.write('0', 156, 1, 'ascii')
  block.write('ustar\0', 257, 6, 'ascii')
  block.write('00', 263, 2, 'ascii')
  block.write('\0', 329, 1, 'ascii')
  block.write('\0', 337, 1, 'ascii')
  let sum = 0
  for (const b of block) sum += b
  block.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii')
  return block
}

function tar(files) {
  const chunks = []
  for (const { name, body } of files) {
    chunks.push(header(`package/${name}`, body.length))
    chunks.push(body)
    const pad = (512 - (body.length % 512)) % 512
    if (pad) chunks.push(Buffer.alloc(pad, 0))
  }
  chunks.push(Buffer.alloc(1024, 0))
  return Buffer.concat(chunks)
}

function digest(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

const { out } = parseArgs(process.argv.slice(2))
const { manifest, names } = listPackageFiles()
if (manifest.private !== false) fail('package.json must have private: false')
if (manifest.license !== 'MIT') fail('package.json license must be MIT')

const rootReal = fs.realpathSync(root)
if (out === rootReal || rootReal.startsWith(out + path.sep)) fail('refuse to overwrite source directory')

fs.mkdirSync(out, { recursive: true })
const entries = names.map(name => ({ name, body: fs.readFileSync(path.join(root, name)) }))
const tarball = zlib.gzipSync(tar(entries), { level: 9, mtime: 0 })
if (tarball.length >= 10) tarball[9] = 0x03

const slug = manifest.name.replace(/^@/, '').replace(/\//g, '-')
const fileName = `${slug}-${manifest.version}.tgz`
const outPath = path.join(out, fileName)
const sum = digest(tarball)
fs.writeFileSync(outPath, tarball)
fs.writeFileSync(`${outPath}.sha256`, `${sum}  ${fileName}\n`)

console.log(JSON.stringify({
  name: manifest.name,
  version: manifest.version,
  tarball: outPath,
  bytes: tarball.length,
  sha256: sum,
  files: names,
}, null, 2))
