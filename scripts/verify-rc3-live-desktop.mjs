// Gate 3 & 4: Isolated Official Signed RC3 Electron Live E2E Verification
// Covers:
//   - Boot 1: Empty zero-token onboarding -> sample pack load -> <dialog closedby="any"> modal
//     -> triage expand + >5 batch sweep + undo -> 4 workbench @2x PNGs (1440 light/dark, 680 split, 390 narrow)
//     -> Probe P1+P2: real /v1/messages SSE streaming ````shield```` (mid-stream placeholder -> settled card)
//        -> click "右侧接招 90s" (sidebarRight.openTab) -> preserve main composer draft -> answer -> tier 3/4
//        -> click "挂入盲区账本" -> verify conversation.input.right digest pill updates -> rc3-05 @2x PNG
//     -> Probe P3: click "开始 3 分钟闯关" -> opens native session -> SSE streams Round 1 ````learn-quiz````
//        -> non-empty composer draft guard test -> empty-draft click "B" uses inputActions.setDraft+submit()
//        -> SSE invokes real learn_checkpoint tool (folded) + ````learn-pass```` permanent graduation card
//        -> verify tier 4/4 in ledger.json + rc3-06 @2x PNG
//   - Boot 2: Cold restart isolated RC3 Electron -> confirm persisted 4/4 mastery + human evidenceSummary
//   - Boot 3: Real live cordisInspect (Creator Mode) across Host + 5 Client providers
//   - Strict invariant: ~/.dsh/profiles/desktop & /Applications/DeepSeek Harness.app remain 100% untouched.

import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const PKG = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const TARBALL = process.env.ILP_TARBALL || `/Users/shan/Library/Mobile Documents/com~apple~CloudDocs/Agent/output/incidental-learn-v020-2026-11-19/dist/oxmumu3-dsh-incidental-learn-${PKG.version}.tgz`
const APP = '/Users/shan/dsh-finder-scratch/official-rc3-2026-11-13/apps/DeepSeek Harness.app'
const OUT_DIR = process.env.ILP_OUT_DIR || '/Users/shan/Library/Mobile Documents/com~apple~CloudDocs/Agent/output/incidental-learn-v020-2026-11-19/rc3-desktop-live'

const LIVE_PROFILE = path.join(os.homedir(), '.dsh', 'profiles', 'desktop')
const LIVE_PKG = path.join(LIVE_PROFILE, 'package.json')
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

function statSnap(p) {
  if (!fs.existsSync(p)) return { exists: false }
  const s = fs.statSync(p)
  return { exists: true, mtimeMs: s.mtimeMs, size: s.size }
}

const liveBefore = {
  profile: statSnap(LIVE_PROFILE),
  pkg: statSnap(LIVE_PKG),
  pkgSha: fs.existsSync(LIVE_PKG) ? sha256(LIVE_PKG) : null,
}

assert.notEqual(APP, '/Applications/DeepSeek Harness.app')
assert.equal(spawnSync('/usr/bin/codesign', ['--verify', '--strict', APP]).status, 0, 'RC3 bundle signature must be valid')
assert.ok(fs.existsSync(TARBALL), `Missing release tarball: ${TARBALL}`)
const EXPECTED_SHA = sha256(TARBALL)

fs.mkdirSync(OUT_DIR, { recursive: true })
const FIX = fs.mkdtempSync(path.join(os.tmpdir(), 'ilp-rc3-live-'))
const HOME = path.join(FIX, 'home')
const WORK = path.join(FIX, 'workspace')
const PROFILE = path.join(HOME, 'profiles', 'desktop')
const LEDGER = path.join(HOME, 'incidental-learn', 'ledger.json')
const LINK = path.join(PROFILE, 'node_modules', '@oxmumu3', 'dsh-incidental-learn')

// 1. Null-route all external traffic; allow ONLY local loopback 127.0.0.1 SSE mock
let hangServer
const proxySockets = new Set()
const hangPort = await new Promise(resolve => {
  hangServer = net.createServer(sock => {
    proxySockets.add(sock)
    sock.on('error', () => {})
    sock.on('close', () => proxySockets.delete(sock))
  })
  hangServer.listen(0, '127.0.0.1', () => resolve(hangServer.address().port))
})
const PROXY = `http://127.0.0.1:${hangPort}`

// 2. Local Anthropic Messages SSE Mock Server for genuine Host LLM + Tool Execution turns
const llmRequests = []
let sawShieldStreaming = false
let shieldHoldRelease = null
let shieldHoldReleased = false

function sendSseEvent(res, type, payload) {
  res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...payload })}\n\n`)
}

const llmServer = http.createServer(async (req, res) => {
  if (req.method === 'GET' && (req.url?.startsWith('/models') || req.url?.startsWith('/v1/models'))) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ object: 'list', data: [] }))
    return
  }
  const chunks = []
  for await (const c of req) chunks.push(c)
  const rawBody = Buffer.concat(chunks).toString('utf8')
  let body = {}
  try { body = JSON.parse(rawBody) } catch {}

  const messages = Array.isArray(body.messages) ? body.messages : []
  const lastMsg = messages[messages.length - 1]
  const extractText = m => {
    if (!m) return ''
    if (typeof m.content === 'string') return m.content
    if (Array.isArray(m.content)) {
      return m.content.map(b => (b?.type === 'text' ? b.text : b?.type === 'tool_result' ? `TOOL_RESULT:${b.tool_use_id}` : b?.type || '')).join('\n')
    }
    return ''
  }
  const lastText = extractText(lastMsg)
  const allText = messages.map(extractText).join('\n')
  const toolNames = Array.isArray(body.tools) ? body.tools.map(t => t.name) : []
  const systemText = typeof body.system === 'string'
    ? body.system
    : Array.isArray(body.system)
      ? body.system.map(s => s?.text || '').join('\n')
      : ''
  const modelId = body.model || 'deepseek-chat'

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })

  // Background session-title generator sends a request with no tools; keep it isolated from agent turns.
  if (toolNames.length === 0) {
    sendSseEvent(res, 'message_start', {
      message: { id: 'msg-title-1', type: 'message', role: 'assistant', model: modelId, content: [], stop_reason: null, usage: { input_tokens: 40, output_tokens: 2 } },
    })
    sendSseEvent(res, 'content_block_start', { index: 0, content_block: { type: 'text', text: '' } })
    sendSseEvent(res, 'content_block_delta', { index: 0, delta: { type: 'text_delta', text: '布局与容器查询复盘' } })
    sendSseEvent(res, 'content_block_stop', { index: 0 })
    sendSseEvent(res, 'message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 12 } })
    sendSseEvent(res, 'message_stop', {})
    res.end()
    return
  }

  llmRequests.push({
    url: req.url,
    model: modelId,
    msgCount: messages.length,
    toolCount: toolNames.length,
    hasLearnTools: toolNames.includes('learn_checkpoint') && toolNames.includes('learn_board'),
    hasLearnPrompt: systemText.includes('SHIELD') || allText.includes('SHIELD'),
    lastPreview: lastText.slice(0, 140),
  })

  const hasToolResult = Array.isArray(lastMsg?.content) && lastMsg.content.some(b => b?.type === 'tool_result')
  if (hasToolResult) {
    sendSseEvent(res, 'message_start', {
      message: { id: 'msg-pass-1', type: 'message', role: 'assistant', model: modelId, content: [], stop_reason: null, usage: { input_tokens: 120, output_tokens: 10 } },
    })
    sendSseEvent(res, 'content_block_start', { index: 0, content_block: { type: 'text', text: '' } })
    const passPayload = JSON.stringify({
      itemId: 'item-container-cascade',
      title: '容器查询必须在基础多列规则之后声明',
      trackId: 'track-frontend',
      trackTitle: '前端与界面体验',
      fromTier: 3,
      toTier: 4,
      evidenceSummary: '在制片台右侧栏宽屏分屏迁移场景中独立选对 @container 与基础规则先后顺序，完成过关。',
    })
    sendSseEvent(res, 'content_block_delta', {
      index: 0,
      delta: { type: 'text_delta', text: `太稳了，你直接跨项目迁过去了！过关凭证已归档：\n\n\`\`\`learn-pass\n${passPayload}\n\`\`\`` },
    })
    sendSseEvent(res, 'content_block_stop', { index: 0 })
    sendSseEvent(res, 'message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 90 } })
    sendSseEvent(res, 'message_stop', {})
    res.end()
    return
  }

  if (lastText.includes('我选 ') || (allText.includes('[顺带私教·专心闯关]') && messages.length >= 3)) {
    sendSseEvent(res, 'message_start', {
      message: { id: 'msg-cp-1', type: 'message', role: 'assistant', model: modelId, content: [], stop_reason: null, usage: { input_tokens: 140, output_tokens: 10 } },
    })
    sendSseEvent(res, 'content_block_start', {
      index: 0,
      content_block: {
        type: 'tool_use',
        id: 'toolu_learn_cp_01',
        name: 'learn_checkpoint',
        input: {},
      },
    })
    const toolArgs = JSON.stringify({
      itemId: 'item-container-cascade',
      title: '容器查询必须在基础多列规则之后声明',
      trackId: 'track-frontend',
      toTier: 4,
      evidenceSummary: '在制片台右侧栏宽屏分屏迁移场景中独立选对 @container 与基础规则先后顺序，完成过关。',
    })
    sendSseEvent(res, 'content_block_delta', {
      index: 0,
      delta: { type: 'input_json_delta', partial_json: toolArgs },
    })
    sendSseEvent(res, 'content_block_stop', { index: 0 })
    sendSseEvent(res, 'message_delta', { delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 45 } })
    sendSseEvent(res, 'message_stop', {})
    res.end()
    return
  }

  if (lastText.includes('[顺带私教·专心闯关]')) {
    sendSseEvent(res, 'message_start', {
      message: { id: 'msg-quiz-1', type: 'message', role: 'assistant', model: modelId, content: [], stop_reason: null, usage: { input_tokens: 110, output_tokens: 10 } },
    })
    sendSseEvent(res, 'content_block_start', { index: 0, content_block: { type: 'text', text: '' } })
    const quizPayload = JSON.stringify({
      itemId: 'item-container-cascade',
      step: 1,
      totalSteps: 2,
      trackTitle: '前端与界面体验',
      title: '换景盲测：制片台分屏为什么照样把双列挤爆？',
      scenario: '桌面窗口宽 1440px，但右侧面板只有 420px。下列两段 CSS 里只有一段会生效成单列：',
      question: '请先盲选判断：为什么把 @container 写在基础两列之前依然会横向溢出？',
      before: {
        label: 'A 方案（提前写 @container）',
        code: '@container ilp (max-width: 580px) { .grid { grid-template-columns: 1fr } }\n.grid { grid-template-columns: repeat(2, 1fr) }',
      },
      after: {
        label: 'B 方案（后置写 @container）',
        code: '.grid { grid-template-columns: repeat(2, 1fr) }\n@container ilp (max-width: 580px) { .grid { grid-template-columns: 1fr } }',
      },
      options: [
        { key: 'A', label: '选 A 方案即可，@container 优先级本来就高于普通类规则', correct: false },
        { key: 'B', label: '必须选 B 方案，因为 @container 不增加优先级，同权重靠后覆盖', correct: true },
        { key: 'C', label: '两段都行，改成 @media (max-width: 580px) 更保险', correct: false },
      ],
      analogy: {
        title: '外行类比：合同补充条款写在前面还是后面？',
        body: '容器查询就像“如果房屋面积小于 50 平则按一居算”，但它和标准条款同等级——写在后面的条款才会生效覆盖前面的通用条款。',
      },
    })
    sendSseEvent(res, 'content_block_delta', {
      index: 0,
      delta: { type: 'text_delta', text: `先不剧透，拿你做过的真实布局场景盲测一轮：\n\n\`\`\`learn-quiz\n${quizPayload}\n\`\`\`` },
    })
    sendSseEvent(res, 'content_block_stop', { index: 0 })
    sendSseEvent(res, 'message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 130 } })
    sendSseEvent(res, 'message_stop', {})
    res.end()
    return
  }

  // Case D (Probe P1): Normal work chat turn -> wait for Host Session follow controller, then split shield fence cleanly mid-stream
  shieldHoldRelease = null
  shieldHoldReleased = false
  await delay(450)
  sendSseEvent(res, 'message_start', {
    message: { id: 'msg-shield-1', type: 'message', role: 'assistant', model: modelId, content: [], stop_reason: null, usage: { input_tokens: 95, output_tokens: 10 } },
  })
  sendSseEvent(res, 'content_block_start', { index: 0, content_block: { type: 'text', text: '' } })
  const shieldJson = JSON.stringify({
    title: '长列表滚动区用 flex:1 与 min-height:0 代替绝对定位',
    why: 'flex:1 + min-height:0 让内部滚动区严格贴合宿主可视高，弹 dialog:modal 时不会出现背景飘移。',
    rejected: '在面板外层写 position: absolute; inset: 0 硬占高度（在分屏与模态弹窗里易脱流遮挡标题栏）。',
    probe: '如果父容器忘了加 min-height: 0，内部的 overflow-y: auto 为什么往往滚动不起来？',
    trackId: 'track-frontend',
    source: 'dsh-chat',
    epistemic: 'inferred',
    quiz: {
      question: 'Flex 子元素默认 min-height: auto 时，把滚动容器设为 flex: 1 为何仍可能撑破视口？',
      options: [
        { key: 'A', label: '因为 min-height: auto 允许子项至少撑到内容高度，必须显式 min-height: 0 才允许收缩出滚动条', correct: true, feedback: '正解！min-height: 0 是让 flex 子容器低于内容高度并触发内部滚动的关键开关。' },
        { key: 'B', label: '因为 overflow-y: auto 只对 position: fixed 有效', correct: false, feedback: '并非如此，overflow-y: auto 只需要盒高度有确定约束即可生效。' },
        { key: 'C', label: '因为 CSS Grid 比 Flex 更省内存', correct: false, feedback: '两者都能约束高度，关键在 min-height: 0 是否解除最小内容撑高约束。' },
      ],
    },
  })
  const half = Math.floor(shieldJson.length / 2)
  const firstCut = Math.min(60, half)
  let sentLen = firstCut
  sendSseEvent(res, 'content_block_delta', {
    index: 0,
    delta: { type: 'text_delta', text: `已经把宿主路由鉴权与状态存储落好。\n\n\`\`\`shield\n${shieldJson.slice(0, sentLen)}` },
  })
  const sliceSize = Math.max(1, Math.ceil((half - firstCut) / 3))
  for (let i = 0; i < 3 && sentLen < half && !shieldHoldReleased; i++) {
    await delay(180)
    if (shieldHoldReleased) break
    const nextLen = i === 2 ? half : Math.min(half, sentLen + sliceSize)
    if (nextLen > sentLen) {
      sendSseEvent(res, 'content_block_delta', {
        index: 0,
        delta: { type: 'text_delta', text: shieldJson.slice(sentLen, nextLen) },
      })
      sentLen = nextLen
    }
  }
  if (!shieldHoldReleased) {
    await new Promise(resolve => {
      shieldHoldRelease = () => {
        shieldHoldReleased = true
        resolve()
      }
      setTimeout(resolve, 12000)
    })
  }
  sendSseEvent(res, 'content_block_delta', {
    index: 0,
    delta: { type: 'text_delta', text: `${shieldJson.slice(sentLen)}\n\`\`\`\n` },
  })
  sendSseEvent(res, 'content_block_stop', { index: 0 })
  sendSseEvent(res, 'message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 140 } })
  sendSseEvent(res, 'message_stop', {})
  res.end()
})

const llmPort = await new Promise(resolve => llmServer.listen(0, '127.0.0.1', () => resolve(llmServer.address().port)))
const LLM_BASE = `http://127.0.0.1:${llmPort}`

const baseEnv = {
  PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
  USER: 'shan',
  LANG: 'en_US.UTF-8',
  CFFIXED_USER_HOME: FIX,
  HOME: FIX,
  TMPDIR: path.join(FIX, 'tmp'),
  DSH_HOME: HOME,
  DSH_AGENTS_HOME: path.join(FIX, 'agents'),
  XDG_CONFIG_HOME: path.join(FIX, 'xdg-config'),
  XDG_DATA_HOME: path.join(FIX, 'xdg-data'),
  XDG_CACHE_HOME: path.join(FIX, 'xdg-cache'),
  DSH_TELEMETRY_DISABLED: '1',
  DSH_DESKTOP_DIAGNOSTIC_FILE: path.join(FIX, 'desktop.json'),
  DSH_DESKTOP_UPDATE_JOURNAL_DIR: path.join(FIX, 'logs'),
  HTTP_PROXY: PROXY,
  HTTPS_PROXY: PROXY,
  ALL_PROXY: PROXY,
  NODE_USE_ENV_PROXY: '1',
  NO_PROXY: 'localhost,127.0.0.1',
  DEEPSEEK_API_KEY: 'sk-rc3-isolated-mock-key',
  DEEPSEEK_BASE_URL: LLM_BASE,
}

function prepareProfile() {
  fs.rmSync(PROFILE, { recursive: true, force: true })
  for (const dir of [HOME, WORK, path.join(FIX, 'tmp'), path.join(FIX, 'xdg-config'),
    path.join(FIX, 'xdg-data'), path.join(FIX, 'xdg-cache'), path.join(FIX, 'agents'), PROFILE]) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(path.join(PROFILE, 'package.json'), JSON.stringify({
    name: 'dsh-profile-desktop',
    private: true,
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
  }, null, 2))
  fs.writeFileSync(path.join(PROFILE, 'cordis.yml'), '[]\n')
  fs.writeFileSync(path.join(PROFILE, 'cordis.patch.yml'), '[]\n')
  fs.writeFileSync(path.join(PROFILE, 'pnpm-workspace.yaml'), 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n')

  const cli = path.join(APP, 'Contents', 'Resources', 'runtime', 'cli', 'bin', 'dsh')
  const res = spawnSync(cli, ['plugin', '--profile', 'desktop', 'add', TARBALL, '--offline'], {
    env: { ...baseEnv, npm_config_offline: 'true' },
    cwd: WORK,
    encoding: 'utf8',
    timeout: 45000,
  })
  assert.equal(res.status, 0, res.stderr + res.stdout)
  const manifestPath = path.join(PROFILE, 'package.json')
  const prof = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  if (!prof.dsh.profile.bundles.includes('@oxmumu3/dsh-incidental-learn')) {
    prof.dsh.profile.bundles.push('@oxmumu3/dsh-incidental-learn')
  }
  fs.writeFileSync(manifestPath, JSON.stringify(prof, null, 2) + '\n')
  assert.ok(fs.existsSync(path.join(LINK, 'client.js')))
  assert.ok(fs.existsSync(path.join(LINK, 'index.js')))
}

function openApp(label) {
  const userData = path.join(FIX, `electron-${label}`)
  fs.mkdirSync(userData, { recursive: true })
  fs.rmSync(path.join(userData, 'DevToolsActivePort'), { force: true })
  const child = spawn(path.join(APP, 'Contents', 'MacOS', 'DeepSeek Harness'), [
    `--user-data-dir=${userData}`,
    `--log-file=${path.join(FIX, `electron-${label}.log`)}`,
    `--proxy-server=${PROXY}`,
    '--remote-debugging-port=0',
    '--remote-debugging-address=127.0.0.1',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
  ], { cwd: WORK, env: baseEnv, stdio: ['ignore', 'pipe', 'pipe'] })
  let log = ''
  child.stdout.on('data', d => { log = (log + d).slice(-60000) })
  child.stderr.on('data', d => { log = (log + d).slice(-60000) })
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })))
  async function waitFor(what, fn, budget = 120000) {
    const end = Date.now() + budget
    let last = null
    while (Date.now() < end) {
      if (child.exitCode !== null) throw new Error(`app exited before ${what}: ${log.slice(-2500)}`)
      try { const v = await fn(); if (v) return v } catch (e) { last = e }
      await delay(200)
    }
    throw new Error(`timeout waiting for ${what}${last ? `: ${last.message}` : ''}`)
  }
  return { child, exited, waitFor, log: () => log, userData, label }
}

async function attachApp(app, consoleRows) {
  const devtools = async p => (await fetch(`http://127.0.0.1:${app.port}${p}`, { signal: AbortSignal.timeout(5000) })).json()
  async function attach(endpoint) {
    const socket = new WebSocket(endpoint)
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('ws timeout')), 8000)
      socket.addEventListener('open', () => { clearTimeout(t); resolve() }, { once: true })
      socket.addEventListener('error', () => { clearTimeout(t); reject(new Error('ws error')) }, { once: true })
    })
    let next = 0
    const pending = new Map()
    const listeners = new Map()
    socket.addEventListener('message', ({ data }) => {
      const ev = JSON.parse(data)
      if (ev.id !== undefined && pending.has(ev.id)) {
        const resolve = pending.get(ev.id)
        pending.delete(ev.id)
        resolve(ev)
        return
      }
      if (ev.method) for (const fn of listeners.get(ev.method) ?? []) fn(ev.params)
    })
    return {
      close: () => socket.close(),
      on(m, fn) { listeners.set(m, [...(listeners.get(m) ?? []), fn]) },
      command(method, params = {}) {
        return new Promise((resolve, reject) => {
          const id = ++next
          const t = setTimeout(() => { pending.delete(id); reject(new Error(`cdp timeout ${method}`)) }, 25000)
          pending.set(id, ev => {
            clearTimeout(t)
            if (ev.error) reject(new Error(`${method}: ${ev.error.message}`))
            else resolve(ev.result)
          })
          socket.send(JSON.stringify({ id, method, params }))
        })
      },
    }
  }
  app.port = await app.waitFor('devtools', () => {
    const file = path.join(app.userData, 'DevToolsActivePort')
    if (!fs.existsSync(file)) return 0
    const value = Number(fs.readFileSync(file, 'utf8').split('\n')[0])
    return value > 0 ? value : 0
  }, 45000)
  const target = await app.waitFor('renderer', async () => (await devtools('/json/list')).find(r => r.type === 'page' && r.url === 'dsh-app://app/'), 90000)
  const page = await attach(target.webSocketDebuggerUrl)
  page.on('Runtime.exceptionThrown', p => {
    consoleRows.push({ kind: 'exception', text: String(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text ?? '').slice(0, 2000) })
  })
  await page.command('Runtime.enable').catch(() => {})
  await page.command('Page.enable').catch(() => {})
  await page.command('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {})
  const evaluate = async expression => {
    const r = await page.command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error(`evaluate: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text ?? ''}`)
    return r.result.value
  }
  async function close() {
    try { page.close() } catch {}
    try {
      const browser = await attach((await devtools('/json/version')).webSocketDebuggerUrl)
      await browser.command('Browser.close')
      browser.close()
    } catch { app.child.kill('SIGTERM') }
    let ended = await Promise.race([app.exited, delay(20000).then(() => null)])
    if (!ended) {
      app.child.kill('SIGKILL')
      ended = await Promise.race([app.exited, delay(5000)])
    }
    assert.equal(ended.code, 0, `${app.label} must exit 0`)
    return ended
  }
  return { evaluate, command: page.command, close, waitFor: app.waitFor }
}

async function openLearnWorkbench(ui) {
  const boot = await ui.waitFor('boot', () => ui.evaluate(`(() => {
    const rows = (globalThis.__DSH_BOOT__?.entries ?? []).filter(r => r.id === '@oxmumu3/dsh-incidental-learn')
    return rows.length ? { count: rows.length, release: globalThis.__DSH_BOOT__?.release?.version } : null
  })()`))
  assert.equal(boot.count, 1)
  assert.equal(boot.release, '0.2.2-rc.3')

  let lastClickAt = 0
  await ui.waitFor('workbench mounted', async () => {
    const mounted = await ui.evaluate(`Boolean(document.querySelector('[data-testid="ilp-workbench"] .ilp-h1'))`)
    if (mounted) return true
    const hasWb = await ui.evaluate(`Boolean(document.querySelector('.ilp-wb'))`)
    if (!hasWb && Date.now() - lastClickAt >= 900) {
      lastClickAt = Date.now()
      await ui.evaluate(`(() => {
        const el = [...document.querySelectorAll('button,[role=button],a')].find(n => n.getBoundingClientRect().height > 0 && (n.getAttribute('aria-label') === '顺带私教' || n.textContent?.trim() === '顺带私教'))
        if (el) el.click()
      })()`)
    }
    return false
  }, 30000)
  return boot
}

async function setHostTheme(ui, theme) {
  await ui.command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] })
  await ui.waitFor(`host theme settled to ${theme}`, () => ui.evaluate(`document.body.hasAttribute('data-ds-dark-theme') === ${theme === 'dark' ? 'true' : 'false'}`), 5000)
  await ui.evaluate(`document.getAnimations({ subtree: true }).forEach(a => { try { a.finish() } catch {} })`)
  await delay(80)
}

async function toggleHostSidebar(ui, wantCollapsed) {
  await ui.evaluate(`document.getAnimations({ subtree: true }).forEach(a => { try { a.finish() } catch {} })`)
  await delay(150)
  const res = await ui.evaluate(`(() => {
    const wbRect = document.querySelector('[data-testid="ilp-workbench"], .ilp-wb, [contenteditable="true"]')?.getBoundingClientRect()
    const isCollapsed = wbRect ? wbRect.left < 70 : false
    if (isCollapsed === ${wantCollapsed ? 'true' : 'false'}) {
      return { toggled: false, isCollapsed }
    }
    const byLabel = [...document.querySelectorAll('button,[role=button]')].find(el => /展开／收起左侧栏|Toggle left sidebar|收起侧边栏|展开侧边栏|toggle sidebar|collapse sidebar|expand sidebar/i.test((el.getAttribute('aria-label') || '') + ' ' + (el.title || '')))
    const topLeftButtons = [...document.querySelectorAll('button,[role=button]')].filter(el => {
      const r = el.getBoundingClientRect()
      return r.width >= 16 && r.width <= 48 && r.height >= 16 && r.height <= 48 && r.top >= 4 && r.top <= 48 && r.left >= 8 && r.left <= 280
    }).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)
    const collapseBtn = byLabel
      || (isCollapsed ? topLeftButtons[0] : (topLeftButtons.find(el => el.getBoundingClientRect().left >= 200) || topLeftButtons[topLeftButtons.length - 1]))
    if (collapseBtn) {
      collapseBtn.click()
      return { toggled: true, isCollapsed }
    }
    return { toggled: false, isCollapsed }
  })()`)
  if (res.toggled) {
    await ui.waitFor(`sidebar ${wantCollapsed ? 'collapsed' : 'expanded'}`, () => ui.evaluate(`(() => {
      if (window.innerWidth < 900) return true
      const wb = document.querySelector('[data-testid="ilp-workbench"], .ilp-wb')
      if (!wb) return true
      const left = wb.getBoundingClientRect().left
      return ${wantCollapsed ? 'left < 70' : 'left >= 180'}
    })()`), 6000)
    await ui.evaluate(`document.getAnimations({ subtree: true }).forEach(a => { try { a.finish() } catch {} })`)
    await delay(80)
  }
  return res
}

async function typeIntoLexicalAndSend(ui, text) {
  const pos = await ui.waitFor('chat composer', () => ui.evaluate(`(() => {
    const ed = document.querySelector('[contenteditable="true"]')
    if (!ed) return null
    const r = ed.getBoundingClientRect()
    if (r.height <= 0) return null
    return { x: r.left + Math.min(80, r.width / 2), y: r.top + r.height / 2 }
  })()`), 20000)
  for (const type of ['mousePressed', 'mouseReleased']) {
    await ui.command('Input.dispatchMouseEvent', { type, button: 'left', clickCount: 1, ...pos })
  }
  await delay(100)
  await ui.command('Input.insertText', { text })
  await delay(120)
  await ui.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await ui.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
}

const receipt = { ok: false, tarball: TARBALL, sha256: EXPECTED_SHA, host: '0.2.2-rc.3', exceptions: [] }
let app
let ui

try {
  prepareProfile()

  // ================= BOOT 1: Isolated Official RC3 Electron Live E2E =================
  app = openApp('boot1')
  ui = await attachApp(app, receipt.exceptions)
  receipt.boot1Plugin = await openLearnWorkbench(ui)

  // 1. Beginner Welcome Tutorial (0/0 Empty State) -> Screenshot & Layout Checks -> Load Samples
  await ui.waitFor('empty onboarding visible', () => ui.evaluate(`Boolean(document.querySelector('[data-testid="ilp-empty-onboarding"]'))`), 15000)

  const shots = []
  const captureShot = async (name, width, height, theme, collapseSidebar) => {
    if (collapseSidebar && width < 900) {
      await ui.command('Emulation.setDeviceMetricsOverride', { width: 1440, height, deviceScaleFactor: 2, mobile: false })
      await delay(100)
      await toggleHostSidebar(ui, true)
      await delay(200)
    }
    await ui.command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: false })
    await setHostTheme(ui, theme)
    if (!collapseSidebar || width >= 900) {
      await toggleHostSidebar(ui, collapseSidebar)
    }
    const metrics = await ui.evaluate(`({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      wbColorScheme: getComputedStyle(document.querySelector('[data-testid="ilp-workbench"]')).colorScheme,
    })`)
    assert.ok(metrics.scrollWidth <= metrics.innerWidth, `${name} overflow: ${metrics.scrollWidth} > ${metrics.innerWidth}`)
    const shot = await ui.command('Page.captureScreenshot', { format: 'png', fromSurface: true })
    fs.writeFileSync(path.join(OUT_DIR, name), Buffer.from(shot.data, 'base64'))
    shots.push({ name, width, height, theme, ...metrics })
  }

  const emptyHeaderCheck = await ui.evaluate(`(() => {
    const wb = document.querySelector('[data-testid="ilp-workbench"]')
    const emptyRoot = document.querySelector('[data-testid="ilp-empty-onboarding"]')
    const guide = document.querySelector('[data-testid="ilp-visual-guide"]')
    const cta = document.querySelector('[data-testid="ilp-start-chat-cta"]')
    const details = document.querySelector('[data-testid="ilp-welcome-preview"]')
    const btns = [...wb.querySelectorAll('.ilp-header-acts button')].map(b => b.textContent?.trim())
    const h1Rect = wb.querySelector('.ilp-h1')?.getBoundingClientRect()
    const sumRect = wb.querySelector('.ilp-summary')?.getBoundingClientRect()
    const idleBtn = document.querySelector('[data-testid="ilp-sim-btn-idle"]')
    const visiblePriCount = emptyRoot ? [...emptyRoot.querySelectorAll('.ilp-btn.solid')].filter(el => el.offsetHeight > 0).length : 0
    return {
      headerBtnCount: btns.length,
      visiblePriCount,
      guideMode: guide?.getAttribute('data-guide-mode'),
      guideBorderTop: guide ? getComputedStyle(guide).borderTopWidth : null,
      hasStartChatCta: Boolean(cta),
      ctaBottom: cta ? Math.round(cta.getBoundingClientRect().bottom) : null,
      hasWelcomePreview: Boolean(details),
      simDetailsOpen: details ? Boolean(details.open) : null,
      hasVisualGuide: Boolean(guide),
      hasToggleGuideBtnOnEmpty: Boolean(document.querySelector('[data-testid="ilp-toggle-guide-btn"]')),
      stepCardsCount: document.querySelectorAll('.ilp-onb-step').length,
      connectorCount: document.querySelectorAll('.ilp-step-connector').length,
      sceneCount: document.querySelectorAll('.ilp-scene').length,
      idleBtnPressed: idleBtn?.getAttribute('aria-pressed'),
      outcomeMode: document.querySelector('[data-testid="ilp-sim-outcome"]')?.getAttribute('data-mode'),
      summaryGapFromH1: (h1Rect && sumRect) ? Math.round(sumRect.left - h1Rect.right) : null,
    }
  })()`)
  assert.equal(emptyHeaderCheck.headerBtnCount, 0, '0/0 empty header must hide 15m course and export buttons')
  assert.equal(emptyHeaderCheck.visiblePriCount, 1, 'welcome page must have strictly 1 visible .ilp-btn.solid CTA')
  assert.equal(emptyHeaderCheck.guideMode, 'empty', 'welcome page must render unboxed empty mode')
  assert.equal(emptyHeaderCheck.guideBorderTop, '0px', 'empty editorial hero stack must be unboxed')
  assert.equal(emptyHeaderCheck.hasStartChatCta, true, 'welcome page must expose start-chat CTA')
  assert.ok(emptyHeaderCheck.ctaBottom !== null && emptyHeaderCheck.ctaBottom <= 900, `CTA must fit above fold at 900px, got bottom=${emptyHeaderCheck.ctaBottom}`)
  assert.equal(emptyHeaderCheck.hasWelcomePreview, true, 'welcome page must expose collapsible simulation preview')
  assert.equal(emptyHeaderCheck.simDetailsOpen, false, 'Tier-3 simulation <details> must start closed by default')
  assert.equal(emptyHeaderCheck.hasVisualGuide, true, 'welcome page must render visual guide')
  assert.equal(emptyHeaderCheck.hasToggleGuideBtnOnEmpty, false, '0/0 empty header must not show redundant toggle guide button')
  assert.equal(emptyHeaderCheck.stepCardsCount, 3, 'welcome page must show 3 step cards')
  assert.equal(emptyHeaderCheck.connectorCount, 2, 'welcome page must show 2 step connectors')
  assert.equal(emptyHeaderCheck.sceneCount, 3, 'welcome page must render 3 UI-miniature scene previews')
  assert.equal(emptyHeaderCheck.idleBtnPressed, 'true', 'default simulator button must be idle (no button clicked)')
  assert.equal(emptyHeaderCheck.outcomeMode, 'idle', 'default simulator outcome must show idle')
  assert.ok(emptyHeaderCheck.summaryGapFromH1 !== null && emptyHeaderCheck.summaryGapFromH1 <= 64, `summary must align left beside h1, got gap=${emptyHeaderCheck.summaryGapFromH1}`)

  // Interactive Scene Simulator assertions (before any Emulation device override so mouseWheel later uses untouched compositor)
  await ui.evaluate(`document.querySelector('[data-testid="ilp-sim-summary"]').click()`)
  await ui.waitFor('welcome preview details opened', () => ui.evaluate(`document.querySelector('[data-testid="ilp-welcome-preview"]')?.open === true`), 5000)
  await ui.evaluate(`document.querySelector('[data-testid="ilp-sim-btn-coach"]').click()`)
  const simCoachState = await ui.waitFor('simulator coach button active', () => ui.evaluate(`(() => {
    const btn = document.querySelector('[data-testid="ilp-sim-btn-coach"]')
    const cta = document.querySelector('[data-testid="ilp-start-chat-cta"]')
    const out = document.querySelector('[data-testid="ilp-sim-outcome"]')
    if (!btn || btn.getAttribute('aria-pressed') !== 'true' || !out) return null
    return {
      pressed: btn.getAttribute('aria-pressed'),
      mode: out.getAttribute('data-mode'),
      text: out.textContent || '',
      btnBg: getComputedStyle(btn).backgroundColor,
      priBg: cta ? getComputedStyle(cta).backgroundColor : null,
    }
  })()`), 6000)
  assert.equal(simCoachState.pressed, 'true')
  assert.equal(simCoachState.mode, 'coach')
  assert.ok(simCoachState.text.includes('对话右侧学习栏'), 'coach outcome must explain right sidebar learning panel')
  assert.notEqual(simCoachState.btnBg, simCoachState.priBg, 'active toolbar button must use soft blue/amber tint, never --ilp-pri black fill')
  await ui.evaluate(`document.querySelector('[data-testid="ilp-sim-btn-save"]').click()`)
  await ui.waitFor('sim save mode active', () => ui.evaluate(`document.querySelector('[data-testid="ilp-sim-outcome"]')?.getAttribute('data-mode') === 'save' && document.querySelector('[data-testid="ilp-sim-btn-save"]')?.getAttribute('aria-pressed') === 'true'`), 4000)
  await ui.evaluate(`document.querySelector('[data-testid="ilp-sim-btn-dismiss"]').click()`)
  await ui.waitFor('sim dismiss mode active', () => ui.evaluate(`document.querySelector('[data-testid="ilp-sim-outcome"]')?.getAttribute('data-mode') === 'dismiss' && document.querySelector('[data-testid="ilp-sim-btn-dismiss"]')?.getAttribute('aria-pressed') === 'true'`), 4000)
  await ui.evaluate(`document.querySelector('[data-testid="ilp-sim-btn-idle"]').click()`)
  await ui.waitFor('sim idle restored', () => ui.evaluate(`document.querySelector('[data-testid="ilp-sim-outcome"]')?.getAttribute('data-mode') === 'idle' && document.querySelector('[data-testid="ilp-sim-btn-idle"]')?.getAttribute('aria-pressed') === 'true'`), 4000)
  await ui.evaluate(`document.querySelector('[data-testid="ilp-sim-summary"]').click()`)
  await ui.waitFor('welcome preview details closed cleanly', () => ui.evaluate(`document.querySelector('[data-testid="ilp-welcome-preview"]')?.open === false`), 4000)

  // Verify 0 + 3 (`user03`) Plan A direct-unfold + inline 10s quick-quiz 0/4 -> 2/4 upgrade + Undo, then clear_all -> 0/0
  await ui.evaluate(`(async () => {
    const seeds = [
      { title: '三数一行的主次排版取舍', why: '主数字左上大号与辅助右上次号拉开第一眼层级', rejected: '保留占一整行的 7 天趋势柱状图' },
      { title: '渐进披露决定默认态只留三项', why: '默认态只留高频决策项，低频细节按需悬停展开', rejected: '把全部历史明细塞进默认小窗' },
      { title: '悬浮层按触发锚点而不是盒子定位', why: '展开时固定触发边不动并向可用空间延伸，贴边不溢出', rejected: '固定向下弹出再加内部滚动条' },
    ]
    for (const s of seeds) {
      const res = await fetch('/api/incidental_learn/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'capture_candidate',
          auto: false,
          payload: { ...s, trackId: 'track-frontend', source: 'dsh-chat' },
        }),
      })
      if (!res.ok) throw new Error('capture_candidate failed: ' + res.status)
    }
  })()`)
  await ui.waitFor('0 + 3 Plan A unified sheet renders 3 directly unfolded unread rows with zero 0/0 tracks', () => ui.evaluate(`(
    Boolean(document.querySelector('[data-testid="ilp-direct-study"]')) &&
    Boolean(document.querySelector('[data-testid="ilp-sheet"]')) &&
    document.querySelectorAll('.ilp-row.is-unread').length === 3 &&
    document.querySelectorAll('.ilp-track').length === 0 &&
    !document.querySelector('[data-testid="ilp-overflow-bar"]')
  )`), 15000)

  const inlineQuizCheck = await ui.evaluate(`(() => {
    const row = document.querySelector('.ilp-row.is-unread')
    return row ? row.getAttribute('data-testid').replace(/^ilp-row-/, '') : null
  })()`)
  assert.ok(inlineQuizCheck, 'expected an unread row id for inline 10s quiz')
  await ui.evaluate(`document.querySelector('[data-testid="ilp-row-quiz-btn-${inlineQuizCheck}"]').click()`)
  await ui.waitFor('inline 10s quiz opened inside row', () => ui.evaluate(`Boolean(document.querySelector('[data-testid="ilp-inline-quiz-${inlineQuizCheck}"]'))`), 6000)
  await ui.evaluate(`document.querySelector('[data-testid="ilp-inline-opt-${inlineQuizCheck}-B"]').click()`)
  await ui.waitFor('inline quiz feedback and 2/4 upgrade button shown', () => ui.evaluate(`Boolean(document.querySelector('[data-testid="ilp-inline-upgrade-${inlineQuizCheck}"]'))`), 6000)
  await ui.evaluate(`document.querySelector('[data-testid="ilp-inline-upgrade-${inlineQuizCheck}"]').click()`)
  await ui.waitFor('unread row promoted in-place to 2/4 saved row', () => ui.evaluate(`(
    document.querySelectorAll('.ilp-row.is-unread').length === 2 &&
    document.querySelectorAll('.ilp-row[data-row-kind="saved"]').length === 1 &&
    Boolean(document.querySelector('[data-testid="ilp-toast-undo"]'))
  )`), 8000)
  await ui.evaluate(`document.querySelector('[data-testid="ilp-toast-undo"]').click()`)
  await ui.waitFor('undo restores 0 + 3 unread rows', () => ui.evaluate(`(
    document.querySelectorAll('.ilp-row.is-unread').length === 3 &&
    document.querySelectorAll('.ilp-row[data-row-kind="saved"]').length === 0
  )`), 8000)

  await ui.evaluate(`document.querySelector('[data-testid="ilp-triage-clear-all"]').click()`)
  await ui.waitFor('clear_all returns to welcome screen', () => ui.evaluate(`Boolean(document.querySelector('[data-testid="ilp-load-samples-btn"]'))`), 15000)

  // Dismiss any residual toast, then load sample pack (5 items + 6 triage -> 3 unfolded + overflow bar + 5 saved!)
  await ui.evaluate(`document.querySelector('[data-testid="ilp-toast-close"]')?.click()`)
  await ui.evaluate(`document.querySelector('[data-testid="ilp-load-samples-btn"]').click()`)
  await ui.waitFor('sample spotlight + unified sheet + overflow bar (>3 unread) loaded', () => ui.evaluate(`(
    Boolean(document.querySelector('[data-testid="ilp-direct-study"]')) &&
    Boolean(document.querySelector('[data-testid="ilp-spotlight"]')) &&
    Boolean(document.querySelector('[data-testid="ilp-preview-banner"]')) &&
    Boolean(document.querySelector('[data-testid="ilp-sheet"]')) &&
    Boolean(document.querySelector('[data-testid="ilp-overflow-bar"]')) &&
    document.querySelectorAll('.ilp-row.is-unread').length === 3 &&
    document.querySelectorAll('.ilp-row[data-row-kind="saved"]').length === 5 &&
    document.querySelectorAll('.ilp-track').length === 0
  )`), 15000)

  // Verify non-empty header exposes non-destructive diagram toggle (`工作原理图`) without wiping accumulated ledger
  const guideCollapsedCheck = await ui.evaluate(`(() => {
    const btn = document.querySelector('[data-testid="ilp-toggle-guide-btn"]')
    return {
      exists: Boolean(btn),
      expanded: btn?.getAttribute('aria-expanded'),
      text: btn?.textContent?.trim(),
      guideVisible: Boolean(document.querySelector('[data-testid="ilp-visual-guide"]')),
    }
  })()`)
  assert.equal(guideCollapsedCheck.exists, true, 'non-empty header must show 工作原理图 toggle')
  assert.equal(guideCollapsedCheck.expanded, 'false', '工作原理图 toggle must start collapsed')
  assert.equal(guideCollapsedCheck.guideVisible, false)
  await ui.evaluate(`document.querySelector('[data-testid="ilp-toggle-guide-btn"]').click()`)
  const guideOpenedCheck = await ui.waitFor('工作原理图 opened alongside spotlight', () => ui.evaluate(`(() => {
    const g = document.querySelector('[data-testid="ilp-visual-guide"]')
    const s = document.querySelector('[data-testid="ilp-spotlight"]')
    const btn = document.querySelector('[data-testid="ilp-toggle-guide-btn"]')
    if (!g || !s || !btn || btn.getAttribute('aria-expanded') !== 'true') return null
    return {
      expanded: btn.getAttribute('aria-expanded'),
      mode: g.getAttribute('data-guide-mode'),
      borderTop: getComputedStyle(g).borderTopWidth,
      guideVisible: g.offsetHeight > 0,
      spotlightVisible: s.offsetHeight > 0,
      hasCloseBtn: Boolean(document.querySelector('[data-testid="ilp-close-guide-btn"]')),
    }
  })()`), 6000)
  assert.equal(guideOpenedCheck.guideVisible, true)
  assert.equal(guideOpenedCheck.mode, 'accumulated')
  assert.notEqual(guideOpenedCheck.borderTop, '0px', 'accumulated guide mode must wrap inside soft container')
  assert.equal(guideOpenedCheck.spotlightVisible, true, 'opening 工作原理图 must preserve accumulated spotlight below')
  assert.equal(guideOpenedCheck.hasCloseBtn, true)
  await ui.evaluate(`document.querySelector('[data-testid="ilp-toggle-guide-btn"]').click()`)
  await ui.waitFor('工作原理图 collapsed cleanly', () => ui.evaluate(`!document.querySelector('[data-testid="ilp-visual-guide"]') && document.querySelector('[data-testid="ilp-toggle-guide-btn"]')?.getAttribute('aria-expanded') === 'false'`), 6000)

  // Verify Layer 3 overflow bar: expand remaining older unread (3 -> 6 unread, 11 total rows), clear_older -> 3 unread -> Undo restores 6!
  await ui.evaluate(`document.querySelector('[data-testid="ilp-toggle-older-unread"]').click()`)
  await ui.waitFor('older unread expanded to 6 unread + 5 saved', () => ui.evaluate(`(
    document.querySelectorAll('.ilp-row.is-unread').length === 6 &&
    document.querySelectorAll('.ilp-row').length === 11 &&
    document.querySelector('[data-testid="ilp-toggle-older-unread"]')?.getAttribute('aria-expanded') === 'true'
  )`), 6000)

  // Real mouseWheel vertical scroll check BEFORE Emulation device metrics override (11 rows + spotlight + intent box overflows 900px cleanly)
  const wheelBox = await ui.waitFor('workbench scrollable overflow', () => ui.evaluate(`(() => {
    const wb = document.querySelector('.ilp-wb')
    if (!wb || wb.scrollHeight <= wb.clientHeight) return null
    const r = wb.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), clientHeight: wb.clientHeight, scrollHeight: wb.scrollHeight }
  })()`), 8000)
  await ui.command('Input.dispatchMouseEvent', { type: 'mouseWheel', x: wheelBox.x, y: wheelBox.y, deltaX: 0, deltaY: 360 })
  const wheelScroll = await ui.waitFor('wheel scrollTop > 0', () => ui.evaluate(`(() => {
    const wb = document.querySelector('.ilp-wb')
    return wb && wb.scrollTop > 0 ? { clientHeight: wb.clientHeight, scrollHeight: wb.scrollHeight, wheelScrollTop: wb.scrollTop } : null
  })()`), 8000)
  assert.ok(wheelScroll.wheelScrollTop > 0, 'workbench vertical wheel scroll must advance scrollTop')
  await ui.evaluate(`(() => {
    const wb = document.querySelector('.ilp-wb')
    if (wb) wb.scrollTop = 0
  })()`)

  // Clear older 3 unread -> Undo restores back to 6 unread, then fold older bar & dismiss toast for crisp screenshots
  await ui.evaluate(`document.querySelector('[data-testid="ilp-clear-older-unread"]').click()`)
  await ui.waitFor('clear_older trims to 3 unread with undo toast', () => ui.evaluate(`(
    document.querySelectorAll('.ilp-row.is-unread').length === 3 &&
    !document.querySelector('[data-testid="ilp-overflow-bar"]') &&
    Boolean(document.querySelector('[data-testid="ilp-toast-undo"]'))
  )`), 8000)
  await ui.evaluate(`document.querySelector('[data-testid="ilp-toast-undo"]').click()`)
  await ui.waitFor('undo restores 6 unread + overflow bar', () => ui.evaluate(`Boolean(document.querySelector('[data-testid="ilp-overflow-bar"]'))`), 8000)
  await ui.evaluate(`(() => {
    const btn = document.querySelector('[data-testid="ilp-toggle-older-unread"]')
    if (btn && btn.getAttribute('aria-expanded') === 'true') btn.click()
    document.querySelector('[data-testid="ilp-toast-close"]')?.click()
  })()`)
  receipt.workbenchInteractions = {
    emptyOnboardingLoaded: true,
    inlineQuickQuizUpgradeUndoOk: true,
    overflowFoldClearOlderUndoOk: true,
    wheelScrollCheck: wheelScroll,
  }

  // 2. Native <dialog closedby="any"> showModal() checks: EvidenceDialog (#ilp-skill-dialog) & SprintDialog (#ilp-sprint-dialog)
  await ui.evaluate(`document.querySelector('[data-testid="ilp-open-evidence-modal"]').click()`)
  const modalState = await ui.waitFor('native skill dialog open', () => ui.evaluate(`(() => {
    const d = document.querySelector('[data-testid="ilp-skill-dialog"]');
    if (!d || !d.open) return null;
    return {
      open: d.open,
      closedby: d.getAttribute('closedby'),
      overscroll: getComputedStyle(d).overscrollBehavior,
      hasRoleAttr: d.hasAttribute('role'),
      hasAriaModal: d.hasAttribute('aria-modal'),
    };
  })()`), 8000)
  assert.equal(modalState.open, true)
  assert.equal(modalState.closedby, 'any')
  assert.equal(modalState.hasRoleAttr, false, '<dialog> must not carry redundant role="dialog"')
  assert.equal(modalState.hasAriaModal, false, '<dialog> showModal must not carry redundant aria-modal')
  await ui.evaluate(`document.querySelector('[data-testid="ilp-skill-dialog-close"]').click()`)
  await ui.waitFor('native skill dialog closed', () => ui.evaluate(`!document.querySelector('[data-testid="ilp-skill-dialog"]')?.open`), 5000)

  await ui.evaluate(`document.querySelector('[data-testid="ilp-sprint-open-btn"]').click()`)
  const sprintModalState = await ui.waitFor('native sprint dialog open', () => ui.evaluate(`(() => {
    const d = document.querySelector('[data-testid="ilp-sprint-dialog"]');
    if (!d || !d.open) return null;
    return {
      open: d.open,
      closedby: d.getAttribute('closedby'),
      stationsCount: d.querySelectorAll('.ilp-station').length,
      hasRoleAttr: d.hasAttribute('role'),
      hasAriaModal: d.hasAttribute('aria-modal'),
    };
  })()`), 8000)
  assert.equal(sprintModalState.open, true)
  assert.equal(sprintModalState.closedby, 'any')
  assert.equal(sprintModalState.stationsCount, 3, 'sprint dialog must show 3 stations')
  assert.equal(sprintModalState.hasRoleAttr, false)
  assert.equal(sprintModalState.hasAriaModal, false)
  receipt.nativeDialogCheck = { skillDialog: modalState, sprintDialog: sprintModalState }
  await ui.evaluate(`document.querySelector('[data-testid="ilp-sprint-close-btn"]').click()`)
  await ui.waitFor('native sprint dialog closed', () => ui.evaluate(`!document.querySelector('[data-testid="ilp-sprint-dialog"]')?.open`), 5000)

  // 3. Capture 4 Workbench @2x Screenshots (Light 1440, Dark 1440, Dark 680 split, Dark 390 narrow)
  await captureShot('rc3-01-workbench-1440-light.png', 1440, 900, 'light', false)
  await captureShot('rc3-02-workbench-1440-dark.png', 1440, 900, 'dark', false)
  await captureShot('rc3-03-workbench-split-680-dark.png', 680, 900, 'dark', true)
  await captureShot('rc3-04-workbench-narrow-390-dark.png', 390, 844, 'dark', true)
  const narrowInputH = await ui.evaluate(`Math.round(document.querySelector('.ilp-intent-input')?.getBoundingClientRect().height || 0)`)
  assert.ok(narrowInputH >= 30 && narrowInputH <= 52, `narrow 390px .ilp-intent-input must stay single-line (<=52px), got ${narrowInputH}`)

  // Restore empty state temporarily to capture 0/0 Visual Onboarding @2x Screenshots, then re-load samples for Probes P1..P3
  await ui.command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false })
  await setHostTheme(ui, 'light')
  await delay(350)
  await toggleHostSidebar(ui, false)
  await delay(150)
  await ui.evaluate(`document.querySelector('[data-testid="ilp-clear-preview-btn"]').click()`)
  await ui.waitFor('empty onboarding restored', () => ui.evaluate(`Boolean(document.querySelector('[data-testid="ilp-empty-onboarding"]'))`), 10000)
  await ui.evaluate(`(() => {
    const closeBtn = [...document.querySelectorAll('.ilp-toast button')].find(b => b.textContent?.trim() === '关闭')
    if (closeBtn) closeBtn.click()
  })()`)
  await delay(100)

  await captureShot('rc3-00-welcome-1440-light.png', 1440, 900, 'light', false)
  const lightBtnCheck = await ui.evaluate(`(() => {
    const parseLum = (css) => {
      const m = /rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/.exec(css || '')
      if (!m) return null
      const s = [Number(m[1]), Number(m[2]), Number(m[3])].map(v => {
        const c = v / 255
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
      })
      return Number((0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2]).toFixed(3))
    }
    const pri = document.querySelector('[data-testid="ilp-start-chat-cta"]')
    const sec = document.querySelector('[data-testid="ilp-load-samples-btn"]')
    const priStyle = getComputedStyle(pri)
    const secStyle = getComputedStyle(sec)
    return {
      isDarkTheme: document.body.hasAttribute('data-ds-dark-theme'),
      priBg: priStyle.backgroundColor,
      priFg: priStyle.color,
      secBg: secStyle.backgroundColor,
      secFg: secStyle.color,
      priBgLum: parseLum(priStyle.backgroundColor),
      priFgLum: parseLum(priStyle.color),
      secBgLum: parseLum(secStyle.backgroundColor),
    }
  })()`)
  assert.equal(lightBtnCheck.isDarkTheme, false, 'light welcome screenshot must settle out of dark mode')
  assert.ok(lightBtnCheck.priBgLum !== null && lightBtnCheck.priBgLum < 0.05, `light primary CTA bg must be dark solid, got ${lightBtnCheck.priBg} (lum=${lightBtnCheck.priBgLum})`)
  assert.ok(lightBtnCheck.priFgLum !== null && lightBtnCheck.priFgLum > 0.85, `light primary CTA text must be light, got ${lightBtnCheck.priFg} (lum=${lightBtnCheck.priFgLum})`)
  assert.ok(lightBtnCheck.secBgLum !== null && lightBtnCheck.secBgLum > 0.85, `light secondary button bg must be bright panel, got ${lightBtnCheck.secBg} (lum=${lightBtnCheck.secBgLum})`)

  await captureShot('rc3-00-welcome-1440-dark.png', 1440, 900, 'dark', false)
  await captureShot('rc3-00b-welcome-680-dark.png', 680, 900, 'dark', true)
  const splitWelcomeCols = await ui.evaluate(`getComputedStyle(document.querySelector('.ilp-story-grid')).gridTemplateColumns.trim()`)
  assert.equal(splitWelcomeCols.includes(' '), false, `680px welcome storyboard must stack to 1 column, got gridTemplateColumns=${splitWelcomeCols}`)

  await ui.evaluate(`document.querySelector('[data-testid="ilp-sim-summary"]').click()`)
  await ui.waitFor('sim details opened for screenshot', () => ui.evaluate(`document.querySelector('[data-testid="ilp-welcome-preview"]')?.open === true`), 5000)
  await ui.evaluate(`document.querySelector('[data-testid="ilp-sim-btn-coach"]').click()`)
  await ui.waitFor('sim coach active for screenshot', () => ui.evaluate(`document.querySelector('[data-testid="ilp-sim-outcome"]')?.getAttribute('data-mode') === 'coach'`), 5000)
  await captureShot('rc3-00c-welcome-sim-coach-1440-dark.png', 1440, 900, 'dark', false)
  await ui.evaluate(`document.querySelector('[data-testid="ilp-sim-btn-idle"]').click()`)
  await ui.evaluate(`document.querySelector('[data-testid="ilp-sim-summary"]').click()`)

  // Restore 1440x900 light + expanded sidebar + sample ledger for Probes P1, P2, P3
  await ui.command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false })
  await setHostTheme(ui, 'light')
  await toggleHostSidebar(ui, false)
  await ui.evaluate(`document.querySelector('[data-testid="ilp-load-samples-btn"]').click()`)
  await ui.waitFor('sample ledger restored for probes', () => ui.evaluate(`Boolean(document.querySelector('[data-testid="ilp-spotlight"]'))`), 10000)

  // 4. Probe P1 + P2: Ensure practice workspace -> open clean session -> send normal work prompt -> observe streaming -> settled shield -> open right sidebar drawer!
  const wsPrep = await ui.evaluate(`fetch('/api/incidental_learn/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'ensure_practice_workspace' }),
  }).then(r => r.json())`)
  assert.ok(wsPrep.ok && wsPrep.workspace?.workspaceId, 'practice workspace must resolve cleanly')

  // Open chat session by clicking New Chat button until composer is visible
  let lastNewChatClickAt = 0
  await ui.waitFor('chat composer visible', async () => {
    const ready = await ui.evaluate(`(() => {
      const ed = document.querySelector('[contenteditable="true"]')
      return Boolean(ed && ed.getBoundingClientRect().height > 0)
    })()`)
    if (ready) return true
    if (Date.now() - lastNewChatClickAt >= 700) {
      lastNewChatClickAt = Date.now()
      await ui.evaluate(`(() => {
        const newBtn = [...document.querySelectorAll('button,[role=button]')].find(el => {
          const aria = el.getAttribute('aria-label') || ''
          const txt = el.textContent?.trim() || ''
          return aria === '新会话' || txt.startsWith('新会话') || /新建对话|New Chat|New Session/i.test(aria + ' ' + txt)
        })
        if (newBtn) newBtn.click()
      })()`)
    }
    return false
  }, 15000)

  await typeIntoLexicalAndSend(ui, '帮我核对一下长列表滚动布局的 flex:1 与 min-height:0 取舍。')
  sawShieldStreaming = await ui.waitFor('shield streaming placeholder', () => ui.evaluate(`Boolean(document.querySelector('[data-testid="ilp-shield-streaming"]'))`), 15000)
  shieldHoldReleased = true
  if (shieldHoldRelease) shieldHoldRelease()
  await ui.waitFor('settled shield strip card', () => ui.evaluate(`Boolean(document.querySelector('[data-testid="ilp-shield-card"]'))`), 15000)

  const measureStripStyle = `(() => {
    const details = document.querySelector('[data-testid="ilp-shield-card"]')
    const fence = details.closest('.ilp-fence.is-shield')
    const psHead = fence.querySelector('.ilp-ps-head')
    const topic = fence.querySelector('.ilp-strip-topic')
    const badge = fence.querySelector('.ilp-badge-card')
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const ctx2d = canvas.getContext('2d')
    const toRgba = (css) => {
      ctx2d.clearRect(0, 0, 1, 1)
      ctx2d.fillStyle = '#000000'
      ctx2d.fillStyle = css
      ctx2d.fillRect(0, 0, 1, 1)
      return [...ctx2d.getImageData(0, 0, 1, 1).data]
    }
    const blend = (bg, fg) => {
      const a = fg[3] / 255
      return [
        Math.round(fg[0] * a + bg[0] * (1 - a)),
        Math.round(fg[1] * a + bg[1] * (1 - a)),
        Math.round(fg[2] * a + bg[2] * (1 - a)),
        255,
      ]
    }
    const chain = []
    for (let cur = details; cur; cur = cur.parentElement) chain.unshift(cur)
    let surface = toRgba(document.body.hasAttribute('data-ds-dark-theme') ? '#151517' : '#ffffff')
    for (const node of chain) {
      const bg = getComputedStyle(node).backgroundColor
      if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') continue
      surface = blend(surface, toRgba(bg))
    }
    const fg = blend(surface, toRgba(getComputedStyle(topic).color))
    const badgeColor = blend(surface, toRgba(getComputedStyle(badge).color))
    const badgeBg = blend(surface, toRgba(getComputedStyle(badge).backgroundColor))
    const lum = (rgb) => {
      const s = rgb.slice(0, 3).map(v => {
        const c = v / 255
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
      })
      return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2]
    }
    const l1 = lum(surface)
    const l2 = lum(fg)
    const contrast = Number(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2))
    const badgeChroma = Math.max(badgeColor[0], badgeColor[1], badgeColor[2]) - Math.min(badgeColor[0], badgeColor[1], badgeColor[2])
    const badgeBgChroma = Math.max(badgeBg[0], badgeBg[1], badgeBg[2]) - Math.min(badgeBg[0], badgeBg[1], badgeBg[2])
    return {
      tagName: details.tagName,
      open: Boolean(details.open),
      psVisible: Boolean(psHead && psHead.offsetHeight > 0),
      psText: psHead ? psHead.textContent : '',
      fenceWidth: Math.round(fence.getBoundingClientRect().width),
      topicFontWeight: getComputedStyle(topic).fontWeight,
      topicFontSize: getComputedStyle(topic).fontSize,
      contrast,
      badgeChroma: Math.max(badgeChroma, badgeBgChroma),
      topicColorCss: getComputedStyle(topic).color,
    }
  })()`

  const collapsedLightCheck = await ui.evaluate(measureStripStyle)
  assert.equal(collapsedLightCheck.tagName, 'DETAILS', 'shield strip must use native <details>')
  assert.equal(collapsedLightCheck.open, false, 'shield strip must start collapsed by default')
  assert.equal(collapsedLightCheck.psVisible, true, 'postscript divider header must be visible')
  assert.ok(collapsedLightCheck.psText.includes('顺带补充'), 'postscript header must label card as incidental')
  assert.ok(collapsedLightCheck.fenceWidth <= 609, `shield strip must be narrower than prose (<= 609px), got ${collapsedLightCheck.fenceWidth}`)
  assert.equal(collapsedLightCheck.topicFontWeight, '400', 'strip topic must be unbolded (400)')
  assert.equal(collapsedLightCheck.topicFontSize, '12.5px', 'strip topic fontSize must be 12.5px')
  assert.ok(collapsedLightCheck.contrast >= 4.5, `light topic contrast on strip must be >= 4.5, got ${collapsedLightCheck.contrast}`)
  assert.ok(collapsedLightCheck.badgeChroma <= 28, `resting badge must be monochrome neutral slate gray, got chroma=${collapsedLightCheck.badgeChroma}`)

  // Verify zero-click auto-staging persists into LEDGER on disk EVEN WHILE <details> IS COLLAPSED
  const undoCountBeforeAuto = JSON.parse(fs.readFileSync(LEDGER, 'utf8')).undoStack?.length || 0
  const autoCapturedEntry = await ui.waitFor('zero-click auto-staged triage candidate on disk while collapsed', () => {
    const raw = JSON.parse(fs.readFileSync(LEDGER, 'utf8'))
    const match = (raw.triage || []).find(c => /flex:1|min-height:0/.test(c.title || ''))
    if (!match) return null
    return {
      id: match.id,
      title: match.title,
      cardKey: match.cardKey,
      autoCapturedKeysCount: (raw.autoCapturedKeys || []).length,
      undoStackLen: (raw.undoStack || []).length,
    }
  }, 8000)
  assert.ok(autoCapturedEntry.autoCapturedKeysCount >= 1, 'autoCapturedKeys must record cardKey')
  assert.equal(autoCapturedEntry.undoStackLen, undoCountBeforeAuto, 'auto-capture must not add undoStack entries')

  // Capture @2x collapsed strip in Light & Dark, checking WCAG contrast in Dark too, then restore Light
  await delay(150)
  const shot05a = await ui.command('Page.captureScreenshot', { format: 'png', fromSurface: true })
  fs.writeFileSync(path.join(OUT_DIR, 'rc3-05a-chat-strip-collapsed-1440-light.png'), Buffer.from(shot05a.data, 'base64'))
  shots.push({ name: 'rc3-05a-chat-strip-collapsed-1440-light.png', width: 1440, height: 900, theme: 'light' })

  await setHostTheme(ui, 'dark')
  const collapsedDarkCheck = await ui.evaluate(measureStripStyle)
  assert.ok(collapsedDarkCheck.contrast >= 4.5, `dark topic contrast on strip must be >= 4.5, got ${collapsedDarkCheck.contrast}`)
  const shot05b = await ui.command('Page.captureScreenshot', { format: 'png', fromSurface: true })
  fs.writeFileSync(path.join(OUT_DIR, 'rc3-05b-chat-strip-collapsed-1440-dark.png'), Buffer.from(shot05b.data, 'base64'))
  shots.push({ name: 'rc3-05b-chat-strip-collapsed-1440-dark.png', width: 1440, height: 900, theme: 'dark' })
  await setHostTheme(ui, 'light')

  // Verify composer draft protection + click <summary> to expand + non-destructive right-drawer trigger
  const composerPos = await ui.evaluate(`(() => {
    const ed = document.querySelector('[contenteditable="true"]');
    const r = ed.getBoundingClientRect();
    return { x: r.left + 24, y: r.top + r.height / 2 };
  })()`)
  for (const type of ['mousePressed', 'mouseReleased']) {
    await ui.command('Input.dispatchMouseEvent', { type, button: 'left', clickCount: 1, ...composerPos })
  }
  await ui.command('Input.insertText', { text: '正在写的业务代码说明' })
  await delay(100)

  await ui.evaluate(`document.querySelector('[data-testid="ilp-strip-summary"]').click()`)
  const expandedLightCheck = await ui.waitFor('strip details expanded', () => ui.evaluate(`(() => {
    const details = document.querySelector('[data-testid="ilp-shield-card"]')
    if (!details || !details.open) return null
    const topic = details.querySelector('.ilp-strip-topic')
    return {
      open: details.open,
      topicFontWeight: getComputedStyle(topic).fontWeight,
      topicColorCss: getComputedStyle(topic).color,
    }
  })()`), 6000)
  assert.equal(expandedLightCheck.open, true, 'clicking summary must expand strip details')
  assert.equal(expandedLightCheck.topicFontWeight, '400', 'expanded strip topic must stay unbolded (400)')
  assert.equal(expandedLightCheck.topicColorCss, collapsedLightCheck.topicColorCss, 'expanded strip topic must stay muted gray')

  await ui.evaluate(`document.querySelector('[data-testid="ilp-shield-coach-btn"]').click()`)
  await ui.waitFor('right sidebar learning drawer mounted and slid open', () => ui.evaluate(`(() => {
    const el = document.querySelector('[data-testid="ilp-coach-drawer"]')
    if (!el) return false
    const r = el.getBoundingClientRect()
    return r.width >= 260 && r.height >= 200
  })()`), 10000)
  await delay(250)

  // Capture @2x screenshot of live chat + expanded strip + right learning drawer + preserved draft
  const shot05 = await ui.command('Page.captureScreenshot', { format: 'png', fromSurface: true })
  fs.writeFileSync(path.join(OUT_DIR, 'rc3-05-chat-shield-drawer-1440-light.png'), Buffer.from(shot05.data, 'base64'))
  shots.push({ name: 'rc3-05-chat-shield-drawer-1440-light.png', width: 1440, height: 900, theme: 'light' })

  // Answer option A in right drawer -> verify tier upgrades & main composer draft stays untouched!
  await ui.evaluate(`document.querySelector('[data-testid="ilp-drawer-opt-A"]').click()`)
  await ui.waitFor('drawer feedback shown', () => ui.evaluate(`Boolean(document.querySelector('[data-testid="ilp-drawer-feedback"]'))`), 8000)
  const draftAfterDrawer = await ui.evaluate(`document.querySelector('[contenteditable="true"]')?.innerText?.trim()`)
  assert.ok(draftAfterDrawer.includes('正在写的业务代码说明'), `Right drawer must not disturb main composer draft; got: ${draftAfterDrawer}`)

  // Click 「存进技能库」 -> promotes via save_explicit & updates digest pill in conversation.input.right!
  await ui.evaluate(`document.querySelector('[data-testid="ilp-shield-capture-btn"]').click()`)
  const shieldFb = await ui.waitFor('shield direct save feedback', () => ui.evaluate(`document.querySelector('[data-testid="ilp-shield-feedback"]')?.textContent || null`), 8000)
  assert.match(shieldFb, /已存进顺带私教手账|已在技能手账中|已存进个人技能库|已在技能库中/)
  const pillText = await ui.waitFor('composer right pill present', () => ui.evaluate(`document.querySelector('[data-testid="ilp-composer-pill"]')?.textContent || null`), 8000)
  assert.match(pillText, /^顺带学习 · 已存 \d+ 张$/)
  receipt.probeP1P2 = {
    emptyWelcomeCheck: emptyHeaderCheck,
    stripCollapsedLight: collapsedLightCheck,
    stripCollapsedDark: collapsedDarkCheck,
    stripExpandedLight: expandedLightCheck,
    zeroClickAutoCaptured: autoCapturedEntry,
    sawShieldStreaming: Boolean(sawShieldStreaming),
    settledShieldRendered: true,
    rightDrawerMounted: true,
    mainDraftPreserved: draftAfterDrawer,
    directSaveFeedback: shieldFb,
    composerPillText: pillText,
  }

  // Clear composer draft cleanly so no unsent draft lingers before switching to workbench
  for (const type of ['mousePressed', 'mouseReleased']) {
    await ui.command('Input.dispatchMouseEvent', { type, button: 'left', clickCount: 1, ...composerPos })
  }
  await ui.evaluate(`(() => {
    const ed = document.querySelector('[contenteditable="true"]')
    if (!ed) return
    ed.focus()
    const sel = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(ed)
    sel.removeAllRanges()
    sel.addRange(range)
  })()`)
  await ui.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 })
  await ui.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 })
  await delay(100)

  // Switch back to 顺带私教 workbench -> Probe P3!
  await ui.evaluate(`document.querySelector('[data-testid="ilp-composer-pill"]').click()`)
  await ui.waitFor('back on workbench', () => ui.evaluate(`Boolean(document.querySelector('[data-testid="ilp-start-deep-learn"]'))`), 10000)

  // 5. Probe P3: Click 「开始 3 分钟闯关」 -> opens native session & receives Round 1 learn-quiz -> test draft guard -> submit option B -> learn_checkpoint + learn-pass!
  await ui.evaluate(`document.querySelector('[data-testid="ilp-start-deep-learn"]').click()`)
  await ui.waitFor('learn-quiz fence rendered', () => ui.evaluate(`Boolean(document.querySelector('[data-testid="ilp-learn-quiz-card"]'))`), 20000)

  // First verify non-empty draft guard: insert draft into visible composer, confirm it landed in editor, then click option B -> draft is NOT overwritten & guard banner appears!
  const qComposerPos = await ui.waitFor('visible quiz composer', () => ui.evaluate(`(() => {
    const eds = [...document.querySelectorAll('[contenteditable="true"]')].filter(n => n.getBoundingClientRect().height > 0);
    const ed = eds[eds.length - 1];
    if (!ed) return null;
    ed.scrollIntoView({ block: 'nearest' });
    const r = ed.getBoundingClientRect();
    return { x: r.left + Math.min(120, r.width / 2), y: r.top + r.height / 2 };
  })()`), 8000)
  for (const type of ['mousePressed', 'mouseReleased']) {
    await ui.command('Input.dispatchMouseEvent', { type, button: 'left', clickCount: 1, ...qComposerPos })
  }
  await delay(100)
  await ui.command('Input.insertText', { text: '未发完的草稿' })
  await ui.waitFor('composer draft 未发完的草稿 visible', () => ui.evaluate(`(() => {
    const eds = [...document.querySelectorAll('[contenteditable="true"]')].filter(n => n.getBoundingClientRect().height > 0);
    const ed = eds[eds.length - 1];
    return Boolean(ed && ed.innerText && ed.innerText.includes('未发完的草稿'));
  })()`), 5000)
  await delay(150)
  await ui.evaluate(`document.querySelector('[data-testid="ilp-quiz-opt-B"]').click()`)
  await ui.waitFor('draft guard banner appeared', () => ui.evaluate(`Boolean(document.querySelector('[data-testid="ilp-draft-guard"]'))`), 8000)
  const guardedDraft = await ui.evaluate(`(() => {
    const eds = [...document.querySelectorAll('[contenteditable="true"]')].filter(n => n.getBoundingClientRect().height > 0);
    return eds[eds.length - 1]?.innerText?.trim() || '';
  })()`)
  assert.ok(guardedDraft.includes('未发完的草稿'), 'Draft guard must preserve existing composer text!')

  // Now click 「替换草稿并发送」 -> sends real user message via inputActions.setDraft+submit -> triggers learn_checkpoint tool + learn-pass!
  await ui.evaluate(`document.querySelector('[data-testid="ilp-draft-guard-replace"]').click()`)
  await ui.waitFor('learn-pass permanent graduation fence rendered', () => ui.evaluate(`Boolean(document.querySelector('[data-testid="ilp-learn-pass-card"]'))`), 25000)

  await setHostTheme(ui, 'dark')
  await delay(150)
  const shot06 = await ui.command('Page.captureScreenshot', { format: 'png', fromSurface: true })
  fs.writeFileSync(path.join(OUT_DIR, 'rc3-06-deep-learn-pass-1440-dark.png'), Buffer.from(shot06.data, 'base64'))
  shots.push({ name: 'rc3-06-deep-learn-pass-1440-dark.png', width: 1440, height: 900, theme: 'dark' })

  const passView = await ui.evaluate(`fetch('/api/incidental_learn/view').then(r => r.json())`)
  const upgraded = passView.snapshot.items.find(it => it.id === 'item-container-cascade')
  assert.equal(upgraded.masteryTier, 4, 'item-container-cascade must be upgraded to 4/4 in ledger after learn_checkpoint')

  receipt.probeP3 = {
    draftGuardPreservedText: guardedDraft,
    setDraftSubmitDispatched: true,
    learnCheckpointToolRan: true,
    learnPassFenceRendered: true,
    upgradedTier: upgraded.masteryTier,
    upgradedEvidence: upgraded.evidenceSummary,
    llmTurnCount: llmRequests.length,
    learnPromptInjectedInLlm: llmRequests.some(r => r.hasLearnPrompt && r.hasLearnTools),
  }
  receipt.screenshots = shots
  receipt.boot1Exit = await ui.close()
  ui = null
  app = null

  // ================= BOOT 2: Cold Restart Persistence =================
  app = openApp('boot2-cold-restart')
  ui = await attachApp(app, receipt.exceptions)
  await openLearnWorkbench(ui)
  const coldView = await ui.evaluate(`fetch('/api/incidental_learn/view').then(r => r.json())`)
  const coldItem = coldView.snapshot.items.find(it => it.id === 'item-container-cascade')
  assert.equal(coldItem.masteryTier, 4, 'cold restart must retain 4/4 masteryTier')
  assert.match(coldItem.evidenceSummary, /制片台右侧栏宽屏分屏迁移场景/)
  receipt.coldRestartCheck = {
    version: coldView.snapshot.version,
    masteryTier: coldItem.masteryTier,
    evidenceSummary: coldItem.evidenceSummary,
  }
  receipt.boot2Exit = await ui.close()
  ui = null
  app = null

  // ================= BOOT 3: Live cordisInspect Audit =================
  const probeDir = path.join(PROFILE, 'node_modules', 'local-cordis-probe')
  fs.mkdirSync(probeDir, { recursive: true })
  fs.writeFileSync(path.join(probeDir, 'package.json'), JSON.stringify({
    name: 'local-cordis-probe',
    version: '0.0.1',
    type: 'module',
    main: 'index.js',
    exports: { '.': './index.js', './package.json': './package.json' },
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }, null, 2))
  fs.writeFileSync(path.join(probeDir, 'cordis.patch.yml'), '- insert:\n    - id: local-cordis-probe\n      name: "local-cordis-probe"\n')
  fs.writeFileSync(path.join(probeDir, 'index.js'), `
export const name = 'local-cordis-probe'
export const inject = ['cordisInspect', 'connection']

export function apply(ctx) {
  const conn = ctx.get('connection')
  const inspect = ctx.get('cordisInspect')
  const off = conn.fetch.register({
    path: '/api/local-cordis-probe',
    methods: ['GET'],
    requestBody: 'buffered',
    async fetch() {
      let handle
      try {
        let providers = []
        for (let i = 0; i < 40; i += 1) {
          providers = inspect.list()
          if (providers.some(p => p.platform === 'client')) break
          await new Promise(r => setTimeout(r, 200))
        }
        const agents = ctx.get('agents', false)
        const presets = ctx.get('agentPresets', false)
        const sessionId = 'session-cordis-probe-' + Date.now().toString(36)
        const payload = {
          sessionId,
          meta: { agentPreset: 'cordis' },
          ...(presets && typeof presets.mount === 'function'
            ? { setup: async agentCtx => { await presets.mount(agentCtx, 'cordis') } }
            : {}),
        }
        if (typeof agents?.create === 'function') handle = await agents.create(payload)
        else if (typeof agents?.createAgent === 'function') handle = await agents.createAgent(ctx, payload)
        const agent = handle?.agent ?? handle
        const learnConfig = await inspect.query('host', 'Config', 'listConfigs', { name: '@oxmumu3/dsh-incidental-learn' }, agent, AbortSignal.timeout(8000))
        const creatorTools = await inspect.query('host', 'Tool', 'listTools', undefined, agent, AbortSignal.timeout(8000))
        const clientResults = []
        for (const p of providers.filter(x => x.platform === 'client')) {
          for (const m of p.methods || []) {
            try {
              const data = await inspect.query('client', p.id, m.name, undefined, agent, AbortSignal.timeout(8000))
              clientResults.push({ provider: p.id, method: m.name, ok: true, data })
            } catch (err) {
              clientResults.push({ provider: p.id, method: m.name, ok: false, error: err?.message || String(err) })
            }
          }
        }
        return Response.json({ providers, learnConfig, creatorTools, clientResults })
      } finally {
        await handle?.dispose?.().catch(() => {})
      }
    },
  })
  ctx.effect(() => off)
}
`)
  const profPath = path.join(PROFILE, 'package.json')
  const prof = JSON.parse(fs.readFileSync(profPath, 'utf8'))
  prof.dependencies = { ...(prof.dependencies || {}), 'local-cordis-probe': '0.0.1' }
  prof.dsh.profile.bundles.push('local-cordis-probe')
  fs.writeFileSync(profPath, JSON.stringify(prof, null, 2) + '\n')

  app = openApp('boot3-cordis-probe')
  ui = await attachApp(app, receipt.exceptions)
  await openLearnWorkbench(ui)
  const cordisProbe = await ui.evaluate(`fetch('/api/local-cordis-probe').then(async r => ({ status: r.status, body: await r.json() }))`)
  assert.equal(cordisProbe.status, 200)
  const toolNames = (cordisProbe.body.creatorTools?.tools || []).map(t => t.name)
  for (const name of ['learn_board', 'learn_save', 'learn_checkpoint', 'learn_triage']) {
    assert.ok(toolNames.includes(name), `Host tools missing ${name}`)
  }
  const clientOk = cordisProbe.body.clientResults.filter(x => x.ok).length
  const clientTotal = cordisProbe.body.clientResults.length
  assert.equal(clientOk, clientTotal, 'All client cordisInspect queries must succeed')

  fs.writeFileSync(path.join(OUT_DIR, 'cordis-inspect-receipt.json'), JSON.stringify({
    host: '0.2.2-rc.3',
    plugin: `${PKG.name}@${PKG.version}`,
    learnToolsPresent: ['learn_board', 'learn_save', 'learn_checkpoint', 'learn_triage'],
    clientQueriesOk: clientOk,
    clientQueriesTotal: clientTotal,
    clientResults: cordisProbe.body.clientResults,
  }, null, 2) + '\n')

  receipt.cordisInspect = {
    learnToolsPresent: ['learn_board', 'learn_save', 'learn_checkpoint', 'learn_triage'],
    clientQueriesOk: clientOk,
    clientQueriesTotal: clientTotal,
  }
  receipt.boot3Exit = await ui.close()
  ui = null
  app = null

  assert.equal(receipt.exceptions.length, 0, 'expected 0 uncaught renderer exceptions: ' + JSON.stringify(receipt.exceptions))
  receipt.ok = true
} catch (err) {
  let domDiag = null
  if (ui) {
    try {
      domDiag = await ui.evaluate(`({
        wbExists: Boolean(document.querySelector('.ilp-wb')),
        quizCardExists: Boolean(document.querySelector('[data-testid="ilp-learn-quiz-card"]')),
        draftGuardExists: Boolean(document.querySelector('[data-testid="ilp-draft-guard"]')),
        quizStatus: document.querySelector('[data-testid="ilp-quiz-status"]')?.textContent || null,
        editables: [...document.querySelectorAll('[contenteditable="true"]')].map(n => ({ h: n.getBoundingClientRect().height, text: n.innerText })),
        bodyText: (document.body?.innerText || '').slice(0, 600),
      })`)
    } catch {}
  }
  receipt.lastDomDiag = { ...(domDiag || {}), appLogTail: app ? app.log().slice(-1500) : null }
  receipt.error = { message: err.message, stack: String(err.stack || '').split('\n').slice(0, 10) }
  receipt.llmRequests = llmRequests
  process.exitCode = 1
} finally {
  if (ui) {
    try { await ui.close() } catch {}
  }
  if (app && app.child.exitCode === null) app.child.kill('SIGTERM')
  for (const s of proxySockets) s.destroy()
  hangServer.close()
  llmServer.close()
  receipt.isolatedLedgerExisted = fs.existsSync(LEDGER)
  fs.rmSync(FIX, { recursive: true, force: true })
  const liveAfter = {
    profile: statSnap(LIVE_PROFILE),
    pkg: statSnap(LIVE_PKG),
    pkgSha: fs.existsSync(LIVE_PKG) ? sha256(LIVE_PKG) : null,
  }
  receipt.liveDesktopCheck = { liveBefore, liveAfter }
  receipt.liveDesktopUntouched = JSON.stringify(liveAfter) === JSON.stringify(liveBefore)
  fs.writeFileSync(path.join(OUT_DIR, 'rc3-live-e2e-receipt.json'), JSON.stringify(receipt, null, 2) + '\n')
  console.log(JSON.stringify(receipt, null, 2))
  assert.equal(receipt.liveDesktopUntouched, true, '~/.dsh/profiles/desktop must remain untouched!')
}
