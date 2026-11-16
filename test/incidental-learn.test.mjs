// Gate 1 unit, security, schema, prompt byte-budget, CLI, locale, and zero-emoji tests
// for @oxmumu3/dsh-incidental-learn (`顺带私教`).

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createLedgerStore } from '../lib/ledger.js'
import { LEARN_PROMPT_MAX_BYTES, LEARN_SYSTEM_PROMPT, registerLearnPrompt } from '../lib/prompt.js'
import { handleActionRequest, handleViewRequest } from '../lib/routes.js'
import { createLearnTools } from '../lib/tools.js'
import {
  buildDeepLearnStarterPrompt,
  parseLearnPassFence,
  parseLearnQuizFence,
  parseShieldFence,
} from '../shared/schema.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

function makeTempHome(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ilp-test-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

test('fence parsers handle JSON, 4-line text SHIELD fallback, quiz, and pass blocks cleanly', () => {
  const shieldJson = parseShieldFence(JSON.stringify({
    title: '容器查询级联顺序',
    why: '@container 不加权重，写在多列基础规则之后才能在窄宽下覆盖',
    rejected: '使用 @media(max-width:768px) 猜测分屏宽度',
    probe: '如果写在多列网格之前会怎样？',
    trackId: 'track-frontend',
  }))
  assert.equal(shieldJson.title, '容器查询级联顺序')
  assert.equal(shieldJson.quiz.options.length, 3)

  const shieldText = parseShieldFence([
    '标题：原生弹窗显隐边界',
    '- 为什么这么做：将 display: flex 仅挂在 dialog[open]',
    '- 被排除的差方案：直接在 dialog 选择器无条件写 display: flex',
    '- 一句话摸底：为什么原生关闭状态会被破坏？',
  ].join('\n'))
  assert.equal(shieldText.title, '原生弹窗显隐边界')
  assert.match(shieldText.why, /dialog\[open\]/)
  assert.match(shieldText.rejected, /无条件/)

  const shieldPlain = parseShieldFence([
    '顺带学习卡：长列表容器为什么需要 min-height: 0',
    '- 为什么这么做：Flex 子项默认最小高度按内容算，补 min-height: 0 才允许内部出滚动条',
    '- 避开的坑：直接写死 height: 600px 在窄分屏下容易裁切或冒出双滚动条',
    '- 顺手想一下：父容器没给 min-height: 0 时，里面的 overflow-y: auto 为啥没反应？',
  ].join('\n'))
  assert.equal(shieldPlain.title, '长列表容器为什么需要 min-height: 0')
  assert.match(shieldPlain.rejected, /height: 600px/)
  assert.match(shieldPlain.probe, /overflow-y: auto/)

  assert.equal(parseShieldFence('hello plain text without fields'), null)

  const quiz = parseLearnQuizFence(JSON.stringify({
    step: 1,
    totalSteps: 2,
    title: '第一关盲测',
    question: '下面哪种写法在 390px 下依然会横向溢出？',
    before: { label: '错误顺序', code: '@container (max-width:580px){...}\n.grid{grid-template-columns:1fr 1fr}' },
    after: { label: '正确顺序', code: '.grid{grid-template-columns:1fr 1fr}\n@container (max-width:580px){...}' },
    options: [
      { key: 'A', label: '错误顺序', correct: true },
      { key: 'B', label: '正确顺序', correct: false },
    ],
    analogy: { title: '类比', body: '后面盖的章会覆掉前面同一行写的规定。' },
  }))
  assert.equal(quiz.step, 1)
  assert.equal(quiz.before.label, '错误顺序')
  assert.equal(quiz.options.length, 2)

  const pass = parseLearnPassFence(JSON.stringify({
    title: '容器查询级联顺序',
    fromTier: 2,
    toTier: 4,
    evidenceSummary: '独立定位分屏溢出并在制片台右栏场景迁移答对',
  }))
  assert.equal(pass.fromTier, 2)
  assert.equal(pass.toTier, 4)

  const starter = buildDeepLearnStarterPrompt({ id: 'x1', title: 'Test', masteryTier: 2 })
  assert.ok(starter.startsWith('[顺带私教·专心闯关]'))
})

test('atomic ledger, external mtimeMs reload, triage batch >5 & undoStack work across two writers', async t => {
  const home = makeTempHome(t)
  const storeA = createLedgerStore({ dshHome: home }).ensureInitialized()
  const storeB = createLedgerStore({ dshHome: home }).ensureInitialized()

  const initSnap = storeA.getSnapshot().snapshot
  assert.equal(initSnap.stats.totalItems, 0)
  assert.equal(initSnap.triage.length, 0)

  const sampleSnap = await storeA.loadSamplePack()
  assert.equal(sampleSnap.tracks.length, 4)
  assert.equal(sampleSnap.triageOverCap, true, 'starter sample pack carries 6 triage candidates to surface batch sweep')

  // External process (storeB) writes an item without notifying storeA in memory
  await storeB.saveExplicitItem({
    title: '外部 CLI 追加盲区',
    why: '并发修改前比对 mtimeMs 避免覆盖',
    source: 'antigravity',
    trackId: 'track-ai',
  })

  // Ensure mtime granularity notice if same millisecond
  const statBefore = fs.statSync(storeA.ledgerFile)
  fs.utimesSync(storeA.ledgerFile, new Date(statBefore.atimeMs), new Date(statBefore.mtimeMs + 1000))

  // Now storeA mutates; it must reload storeB's item before writing!
  const sweepRes = await storeA.triageBatch({ mode: 'sweep_low_value' })
  assert.ok(sweepRes.affected >= 2)
  const mergedTitles = sweepRes.snapshot.items.map(it => it.title)
  assert.ok(mergedTitles.includes('外部 CLI 追加盲区'), 'storeA must not clobber external storeB item')

  // Undo restores the swept low-value candidates
  const undone = await storeA.undoLast()
  assert.equal(undone.undone, true)
  assert.equal(undone.snapshot.triage.length, 6)

  // Micro-drill & checkpoint progression
  const drillRes = await storeA.recordMicroDrill({
    itemId: 'item-container-cascade',
    card: { id: 'item-container-cascade', title: '容器查询必须在基础多列规则之后声明' },
    correct: true,
    selectedKey: 'A',
  })
  assert.equal(drillRes.toTier, 3)

  const checkRes = await storeA.recordCheckpoint({
    itemId: 'item-container-cascade',
    title: '容器查询必须在基础多列规则之后声明',
    toTier: 4,
    evidenceSummary: '在新项目右侧窄栏复述出规则先后顺序并当场答对追问',
  })
  assert.equal(checkRes.toTier, 4)

  const exported = storeA.exportMarkdown()
  assert.ok(fs.existsSync(exported.filePath))
  assert.match(exported.markdown, /在新项目右侧窄栏复述出规则先后顺序/)
})

test('external CLI bridge add / status / export reads & mutates isolated $DSH_HOME cleanly', t => {
  const home = makeTempHome(t)
  const cli = path.join(ROOT, 'bin', 'incidental-learn-cli.mjs')
  const outNote = path.join(home, 'notes.md')

  const addRes = spawnSync('node', [
    cli, 'add',
    '--dsh-home', home,
    '--source', 'codex',
    '--track', 'track-harness',
    '--title', 'CLI 外部注入盲区',
    '--why', '通过独立 CLI 与 DSH 桌面端共享同一 ledger.json',
    '--rejected', '每个工具各自维护互不相通的本地笔记',
    '--probe', '为什么共享 ledger.json 需要先看 mtimeMs？',
  ], { encoding: 'utf8' })
  assert.equal(addRes.status, 0, addRes.stderr)
  const addJson = JSON.parse(addRes.stdout)
  assert.equal(addJson.ok, true)
  assert.equal(addJson.stats.triageCount, 1)

  const statusRes = spawnSync('node', [cli, 'status', '--dsh-home', home, '--json'], { encoding: 'utf8' })
  assert.equal(statusRes.status, 0, statusRes.stderr)
  assert.equal(JSON.parse(statusRes.stdout).snapshot.triage.length, 1)

  const expRes = spawnSync('node', [cli, 'export', '--dsh-home', home, '--out', outNote], { encoding: 'utf8' })
  assert.equal(expRes.status, 0, expRes.stderr)
  assert.ok(fs.existsSync(outNote))
})

test('legacy v0.1.x ledger tracks migrate seamlessly to universal 4 categories without dropping items', t => {
  const home = makeTempHome(t)
  const dir = path.join(home, 'incidental-learn')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'ledger.json'), JSON.stringify({
    schemaVersion: 1,
    version: 9,
    updatedAt: Date.now(),
    tracks: [
      { id: 'track-frontend', title: '前端与交互品味', order: 1 },
      { id: 'track-harness', title: 'Agent 架构与 DSH Harness 六格主线', order: 2 },
      { id: 'track-growth', title: '增长分发与内容渠道适配', order: 3 },
    ],
    items: [
      { id: 'old-h1', trackId: 'track-harness', title: '旧版 AI 取舍卡', why: '保留旧数据', masteryTier: 3 },
      { id: 'old-g1', trackId: 'track-growth', title: '旧版增长取舍卡', why: '保留增长数据', masteryTier: 2 },
    ],
    triage: [
      { id: 'old-t1', trackId: 'track-harness', title: '旧版待分诊 AI 卡', why: '保留待分诊' },
    ],
  }, null, 2))

  const store = createLedgerStore({ dshHome: home }).ensureInitialized()
  const { snapshot } = store.getSnapshot()
  assert.deepEqual(snapshot.tracks.map(tr => tr.id), ['track-frontend', 'track-engineering', 'track-ai', 'track-product'])
  assert.equal(snapshot.stats.totalItems, 2)
  assert.equal(snapshot.triage.length, 1)
  assert.equal(snapshot.tracks.find(tr => tr.id === 'track-ai').items[0].title, '旧版 AI 取舍卡')
  assert.equal(snapshot.tracks.find(tr => tr.id === 'track-product').items[0].title, '旧版增长取舍卡')
  assert.equal(snapshot.triage[0].trackId, 'track-ai')
})

test('HTTP routes enforce CSRF/403, Content-Type/415, 256KB/413 guards & sinceVersion caching', async t => {
  const home = makeTempHome(t)
  const store = createLedgerStore({ dshHome: home }).ensureInitialized()
  const mockCtx = { workspaceRegistry: { list: () => [{ id: 'ws-1', name: 'Demo', path: home }] } }

  const view1 = await handleViewRequest({
    request: new Request('http://127.0.0.1/api/incidental_learn/view'),
    ctx: mockCtx,
    store,
  })
  assert.equal(view1.status, 200)
  const v1Body = await view1.json()
  assert.equal(v1Body.unchanged, false)

  const viewUnchanged = await handleViewRequest({
    request: new Request(`http://127.0.0.1/api/incidental_learn/view?sinceVersion=${v1Body.snapshot.version}`),
    ctx: mockCtx,
    store,
  })
  const vSame = await viewUnchanged.json()
  assert.equal(vSame.unchanged, true)

  // Cross-site Origin rejected -> 403
  const crossSite = await handleActionRequest({
    request: new Request('http://127.0.0.1/api/incidental_learn/action', {
      method: 'POST',
      headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'load_sample_pack' }),
    }),
    ctx: mockCtx,
    store,
  })
  assert.equal(crossSite.status, 403)

  // Sec-Fetch-Site: cross-site rejected -> 403
  const secFetch = await handleActionRequest({
    request: new Request('http://127.0.0.1/api/incidental_learn/action', {
      method: 'POST',
      headers: { 'Sec-Fetch-Site': 'cross-site', 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'load_sample_pack' }),
    }),
    ctx: mockCtx,
    store,
  })
  assert.equal(secFetch.status, 403)

  // Non-JSON Content-Type rejected -> 415
  const badType = await handleActionRequest({
    request: new Request('http://127.0.0.1/api/incidental_learn/action', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: '{"action":"load_sample_pack"}',
    }),
    ctx: mockCtx,
    store,
  })
  assert.equal(badType.status, 415)

  // Oversized body > 256KB rejected -> 413
  const huge = await handleActionRequest({
    request: new Request('http://127.0.0.1/api/incidental_learn/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'load_sample_pack', pad: 'a'.repeat(270 * 1024) }),
    }),
    ctx: mockCtx,
    store,
  })
  assert.equal(huge.status, 413)

  // Same-origin valid request succeeds
  const okPost = await handleActionRequest({
    request: new Request('http://127.0.0.1/api/incidental_learn/action', {
      method: 'POST',
      headers: { Origin: 'dsh-app://app', 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'load_sample_pack' }),
    }),
    ctx: mockCtx,
    store,
  })
  assert.equal(okPost.status, 200)
  const okBody = await okPost.json()
  assert.equal(okBody.snapshot.tracks.length, 4)
})

test('tool schemas omit required:false and share live mutations cleanly', async t => {
  const home = makeTempHome(t)
  const store = createLedgerStore({ dshHome: home }).ensureInitialized()
  const tools = createLearnTools({ store })
  assert.deepEqual(tools.map(x => x.name), ['learn_board', 'learn_save', 'learn_checkpoint', 'learn_triage'])

  function checkNoRequiredFalse(node, at) {
    if (!node || typeof node !== 'object') return
    if (Object.prototype.hasOwnProperty.call(node, 'required') && typeof node.required === 'boolean') {
      assert.fail(`Schema property at ${at} has invalid boolean required`)
    }
    for (const [k, v] of Object.entries(node)) {
      if (v && typeof v === 'object') checkNoRequiredFalse(v, `${at}.${k}`)
    }
  }
  for (const tl of tools) {
    checkNoRequiredFalse(tl.parameters, tl.name)
  }

  const saveTool = tools.find(x => x.name === 'learn_save')
  const checkTool = tools.find(x => x.name === 'learn_checkpoint')
  const boardTool = tools.find(x => x.name === 'learn_board')

  const saveRes = await saveTool.execute({ title: '测试明存条目', why: '用户明确开口要求保存' })
  assert.equal(saveRes.meta.learnReceipt.kind, 'save')

  const cpRes = await checkTool.execute({
    itemId: saveRes.meta.learnReceipt.itemId,
    title: '测试明存条目',
    toTier: 4,
    evidenceSummary: '在新会话完成跨项目追问并准确复述边界',
  })
  assert.equal(cpRes.meta.learnReceipt.toTier, 4)

  const boardOut = await boardTool.execute({})
  assert.match(boardOut, /测试明存条目/)
  assert.match(boardOut, /4\/4 能接住追问/)
})

test('systemPrompt stays within strict 1150 UTF-8 byte budget and toggles by turn scope', () => {
  const bytes = Buffer.byteLength(LEARN_SYSTEM_PROMPT, 'utf8')
  assert.ok(bytes <= LEARN_PROMPT_MAX_BYTES, `Expected prompt <= ${LEARN_PROMPT_MAX_BYTES} bytes, got ${bytes}`)

  let registeredSpec = null
  const mockCtx = {
    get: name => name === 'tools' ? ({ get: (toolName, scope) => (scope?.allowLearn ? { name: toolName } : null) }) : null,
    inject: (_deps, fn) => fn({ systemPrompt: { section: spec => { registeredSpec = spec; return () => {} } } }),
  }
  registerLearnPrompt(mockCtx)
  assert.ok(registeredSpec)
  assert.equal(registeredSpec.text({ scope: { allowLearn: false } }), '')
  assert.equal(registeredSpec.text({ scope: { allowLearn: true } }), LEARN_SYSTEM_PROMPT)
})

test('locale zh/en key parity holds and entire repository contains zero emoji characters', () => {
  const zh = JSON.parse(fs.readFileSync(path.join(ROOT, 'locale', 'zh.json'), 'utf8'))
  const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'locale', 'en.json'), 'utf8'))

  const collectKeys = (obj, prefix = '') => {
    const out = []
    for (const [k, v] of Object.entries(obj)) {
      const p = prefix ? `${prefix}.${k}` : k
      if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...collectKeys(v, p))
      else out.push(p)
    }
    return out.sort()
  }
  assert.deepEqual(collectKeys(zh), collectKeys(en), 'locale/zh.json and locale/en.json must have identical keys')

  const emojiRe = /[\p{Extended_Pictographic}\uFE0F]/u
  const scanDir = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) scanDir(full)
      else if (/\.(js|mjs|cjs|json|yml|md)$/.test(entry.name)) {
        const text = fs.readFileSync(full, 'utf8')
        assert.equal(emojiRe.test(text), false, `Found prohibited emoji in ${path.relative(ROOT, full)}`)
      }
    }
  }
  scanDir(ROOT)
})

test('zero-click auto-staging deduplicates, avoids undo pollution, and cleans up on dismiss', async t => {
  const home = makeTempHome(t)
  const store = createLedgerStore({ dshHome: home }).ensureInitialized()

  const payload = {
    trackId: 'track-frontend',
    title: 'Flex 列表容器滚动失效',
    source: 'dsh-chat',
    epistemic: 'inferred',
    why: 'Flex 子项默认 min-height: auto 会被内容撑开，导致 overflow-y: auto 无法触发内部滚动',
    rejected: '直接写死 height: 600px，分屏下会截断',
    probe: '为什么写了 overflow-y: auto 还要补 min-height: 0？',
  }

  const first = await store.captureCandidate(payload, { auto: true, cardKey: 'card-flex-scroll-1' })
  assert.equal(first.deduplicated, false)
  assert.equal(first.autoCaptured, true)
  assert.equal(first.snapshot.triage.length, 1)
  assert.equal(first.snapshot.triage[0].cardKey, 'card-flex-scroll-1')
  assert.equal(first.snapshot.canUndo, false, 'auto-capture must not pollute undoStack')
  assert.ok(first.snapshot.autoCapturedKeys.includes('card-flex-scroll-1'))

  // Re-mounting / re-rendering same cardKey must no-op without duplicating triage
  const second = await store.captureCandidate(payload, { auto: true, cardKey: 'card-flex-scroll-1' })
  assert.equal(second.deduplicated, true)
  assert.equal(second.autoSkipped, true)
  assert.equal(second.snapshot.triage.length, 1)

  // Clicking "已掌握，收起" dismisses the card AND removes it from triage inbox
  const dismissed = await store.dismissCard({ cardKey: 'card-flex-scroll-1', title: payload.title, restore: false })
  assert.ok(dismissed.snapshot.dismissedCardKeys.includes('card-flex-scroll-1'))
  assert.equal(dismissed.snapshot.triage.length, 0)

  // Re-evaluating dismissed card must still skip auto-capture
  const third = await store.captureCandidate(payload, { auto: true, cardKey: 'card-flex-scroll-1' })
  assert.equal(third.autoSkipped, true)
  assert.equal(third.snapshot.triage.length, 0)

  // Auto-staged second card promoted via explicit save cleanly removes duplicate from triage
  const payload2 = { ...payload, title: 'Dialog 原生顶层关闭机制' }
  await store.captureCandidate(payload2, { auto: true, cardKey: 'card-dialog-2' })
  const saved = await store.saveExplicitItem({ ...payload2, epistemic: 'explicit' })
  assert.equal(saved.snapshot.items.some(it => it.title === payload2.title), true)
  assert.equal(saved.snapshot.triage.some(c => c.title === payload2.title), false, 'saveExplicitItem must clear auto-staged candidate from triage')
})
