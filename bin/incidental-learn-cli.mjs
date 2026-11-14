#!/usr/bin/env node
// Cross-Agent CLI bridge for @oxmumu3/dsh-incidental-learn (`顺带私教`).
// Lets Antigravity, Codex, Claude Code, and SuperAgent push blind-spot candidates or
// export study notes directly to $DSH_HOME/incidental-learn/ledger.json.

import fs from 'node:fs'
import path from 'node:path'
import { createLedgerStore } from '../lib/ledger.js'

function parseArgs(argv) {
  const args = [...argv]
  const command = args.shift() || 'status'
  const flags = {}
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = args[i + 1]
    if (next !== undefined && !next.startsWith('--')) {
      flags[key] = next
      i += 1
    } else {
      flags[key] = true
    }
  }
  return { command, flags }
}

function usage() {
  console.log([
    'Usage: dsh-incidental-learn <command> [options]',
    '',
    'Commands:',
    '  add       Append a candidate card (or explicit item with --explicit)',
    '            --title <text> --why <text> [--rejected <text>] [--probe <text>]',
    '            [--source antigravity|codex|dsh-chat|superagent-review|manual]',
    '            [--track track-frontend|track-harness|track-growth] [--explicit]',
    '  status    Print ledger summary [--json]',
    '  export    Export study notes [--track <id>] [--out <path>]',
    '',
    'Common option: [--dsh-home <dir>]',
  ].join('\n'))
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2))
  if (command === '--help' || command === '-h' || flags.help) {
    usage()
    return
  }

  const store = createLedgerStore({ dshHome: flags['dsh-home'] })
  store.ensureInitialized()

  if (command === 'add') {
    if (!flags.title) {
      console.error('Error: --title is required')
      process.exitCode = 1
      return
    }
    const payload = {
      title: String(flags.title),
      why: flags.why ? String(flags.why) : '',
      rejected: flags.rejected ? String(flags.rejected) : '',
      probe: flags.probe ? String(flags.probe) : '',
      source: flags.source ? String(flags.source) : 'manual',
      trackId: flags.track ? String(flags.track) : 'track-harness',
      epistemic: flags.explicit ? 'explicit' : 'inferred',
    }
    const res = flags.explicit
      ? await store.saveExplicitItem(payload)
      : await store.captureCandidate(payload)
    console.log(JSON.stringify({
      ok: true,
      mode: flags.explicit ? 'explicit' : 'candidate',
      ledgerFile: store.ledgerFile,
      stats: res.snapshot.stats,
      record: res.item || res.candidate,
    }, null, 2))
    return
  }

  if (command === 'status') {
    const { snapshot } = store.getSnapshot()
    if (flags.json) {
      console.log(JSON.stringify({ ok: true, ledgerFile: store.ledgerFile, snapshot }, null, 2))
      return
    }
    console.log(`账本文件: ${store.ledgerFile}`)
    console.log(`已内化 ${snapshot.stats.masteredItems} / ${snapshot.stats.totalItems} 项 · 待分诊 ${snapshot.stats.triageCount} 条`)
    for (const tr of snapshot.tracks) {
      console.log(`- ${tr.title}: ${tr.masteredCount}/${tr.totalCount}`)
    }
    return
  }

  if (command === 'export') {
    const exported = store.exportMarkdown({ trackId: flags.track ? String(flags.track) : undefined })
    if (flags.out) {
      const target = path.resolve(String(flags.out))
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, exported.markdown, 'utf8')
      console.log(JSON.stringify({ ok: true, filePath: target, bytes: Buffer.byteLength(exported.markdown, 'utf8') }, null, 2))
      return
    }
    console.log(JSON.stringify({ ok: true, filePath: exported.filePath, bytes: Buffer.byteLength(exported.markdown, 'utf8') }, null, 2))
    return
  }

  console.error(`Unknown command: ${command}`)
  usage()
  process.exitCode = 1
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exitCode = 1
})
