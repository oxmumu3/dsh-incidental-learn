// Gate 2: Official Signed RC2 & RC3 CLI Plugin Lifecycle Verification (`add`, `list`, `remove`)
// Runs strictly in isolated mkdtempSync DSH_HOME directories; never touches ~/.dsh/profiles/desktop.

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PKG = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const DIST_DIR = process.env.ILP_DIST_DIR || '/Users/shan/Library/Mobile Documents/com~apple~CloudDocs/Agent/output/incidental-learn-v020-2026-11-19/dist'
const OUT_DIR = process.env.ILP_OUT_DIR || '/Users/shan/Library/Mobile Documents/com~apple~CloudDocs/Agent/output/incidental-learn-v020-2026-11-19/rc3-desktop-live'
const TARBALL = path.join(DIST_DIR, `oxmumu3-dsh-incidental-learn-${PKG.version}.tgz`)

const APPS = [
  {
    tag: 'rc2',
    receiptName: 'cli-rc2-receipt.json',
    appPath: '/Users/shan/dsh-dot-scratch/official-dsh-rc2-intake.7DH9RmJP/unpacked/DeepSeek Harness.app',
  },
  {
    tag: 'rc3',
    receiptName: 'cli-rc3-receipt.json',
    appPath: '/Users/shan/dsh-finder-scratch/official-rc3-2026-11-13/apps/DeepSeek Harness.app',
  },
]

const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const LIVE_PROFILE = path.join(os.homedir(), '.dsh', 'profiles', 'desktop')
const liveBefore = fs.existsSync(LIVE_PROFILE) ? fs.readdirSync(LIVE_PROFILE).sort() : null

assert.ok(fs.existsSync(TARBALL), `Missing release tarball at ${TARBALL}`)
const tgzSha = sha256(TARBALL)
fs.mkdirSync(OUT_DIR, { recursive: true })

function verifyAppCli({ tag, receiptName, appPath }) {
  assert.notEqual(appPath, '/Applications/DeepSeek Harness.app')
  assert.ok(fs.existsSync(appPath), `Missing standalone app: ${appPath}`)

  const cs = spawnSync('/usr/bin/codesign', ['--verify', '--strict', appPath], { encoding: 'utf8' })
  assert.equal(cs.status, 0, `codesign failed for ${tag}: ${cs.stderr}`)

  const cli = path.join(appPath, 'Contents', 'Resources', 'runtime', 'cli', 'bin', 'dsh')
  assert.ok(fs.existsSync(cli), `Missing dsh CLI binary at ${cli}`)

  const fix = fs.mkdtempSync(path.join(os.tmpdir(), `ilp-cli-${tag}-`))
  try {
    const home = path.join(fix, 'home')
    const work = path.join(fix, 'work')
    const profileDir = path.join(home, 'profiles', 'desktop')
    fs.mkdirSync(profileDir, { recursive: true })
    fs.mkdirSync(work, { recursive: true })

    fs.writeFileSync(path.join(profileDir, 'package.json'), JSON.stringify({
      name: 'dsh-profile-desktop',
      private: true,
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
    }, null, 2))
    fs.writeFileSync(path.join(profileDir, 'cordis.yml'), '[]\n')
    fs.writeFileSync(path.join(profileDir, 'cordis.patch.yml'), '[]\n')
    fs.writeFileSync(path.join(profileDir, 'pnpm-workspace.yaml'), 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n')

    const env = {
      ...process.env,
      HOME: fix,
      CFFIXED_USER_HOME: fix,
      DSH_HOME: home,
      DSH_TELEMETRY_DISABLED: '1',
      npm_config_offline: 'true',
    }

    const addRes = spawnSync(cli, ['plugin', '--profile', 'desktop', 'add', TARBALL, '--offline'], {
      cwd: work, env, encoding: 'utf8', timeout: 45000,
    })
    assert.equal(addRes.status, 0, `${tag} add failed: ${addRes.stderr}\n${addRes.stdout}`)

    const listRes = spawnSync(cli, ['plugin', '--profile', 'desktop', 'list', '--depth', '0'], {
      cwd: work, env, encoding: 'utf8', timeout: 30000,
    })
    assert.equal(listRes.status, 0, `${tag} list failed: ${listRes.stderr}`)
    assert.match(listRes.stdout, /@oxmumu3\/dsh-incidental-learn/)

    const installedDir = path.join(profileDir, 'node_modules', '@oxmumu3', 'dsh-incidental-learn')
    assert.ok(fs.existsSync(path.join(installedDir, 'client.js')))
    assert.ok(fs.existsSync(path.join(installedDir, 'index.js')))

    const removeRes = spawnSync(cli, ['plugin', '--profile', 'desktop', 'remove', '@oxmumu3/dsh-incidental-learn'], {
      cwd: work, env, encoding: 'utf8', timeout: 30000,
    })
    assert.equal(removeRes.status, 0, `${tag} remove failed: ${removeRes.stderr}`)

    const receipt = {
      ok: true,
      target: tag,
      appPath,
      codesignStrict: true,
      tarball: TARBALL,
      tarballSha256: tgzSha,
      addExit: addRes.status,
      listMatchedPackage: true,
      removeExit: removeRes.status,
      liveDesktopUntouched: true,
    }
    fs.writeFileSync(path.join(OUT_DIR, receiptName), JSON.stringify(receipt, null, 2) + '\n')
    return receipt
  } finally {
    fs.rmSync(fix, { recursive: true, force: true })
  }
}

const results = APPS.map(verifyAppCli)
const liveAfter = fs.existsSync(LIVE_PROFILE) ? fs.readdirSync(LIVE_PROFILE).sort() : null
assert.deepEqual(liveAfter, liveBefore, '~/.dsh/profiles/desktop must remain untouched')
console.log(JSON.stringify({ ok: true, results }, null, 2))
