// Multi-process atomic JSON ledger for @oxmumu3/dsh-incidental-learn (`顺带私教`).
//
// Location: $DSH_HOME/incidental-learn/ledger.json
// Protects against concurrent writes between DSH Electron host and external CLI (Antigravity/Codex/SuperAgent):
//   - Serialized in-process write queue
//   - mtimeMs check + reload-and-merge before every write
//   - Temp file + fs.renameSync atomic replacement
//   - Monotonic `version` counter + bounded 15-entry `undoStack`

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  clampTier,
  cleanText,
  DEFAULT_TRACKS,
  MASTERY_LABELS,
  normalizeEpistemic,
  normalizeSource,
  sanitizeQuizBlock,
  SOURCE_META,
  STARTER_SAMPLE_PACK,
} from '../shared/schema.js'

const SCHEMA_VERSION = 1
const MAX_UNDO = 15

export function resolveDshHome(override) {
  if (override && typeof override === 'string' && override.trim()) {
    return path.resolve(override)
  }
  if (process.env.DSH_HOME && process.env.DSH_HOME.trim()) {
    return path.resolve(process.env.DSH_HOME)
  }
  return path.join(os.homedir(), '.dsh')
}

function emptyLedgerState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    version: 1,
    updatedAt: Date.now(),
    tracks: DEFAULT_TRACKS.map(t => ({ ...t })),
    items: [],
    triage: [],
    dismissedCardKeys: [],
    undoStack: [],
  }
}

function makeId(prefix = 'ilp') {
  const rnd = Math.random().toString(36).slice(2, 7)
  return `${prefix}-${Date.now().toString(36)}-${rnd}`
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function normalizeTrackId(trackId, tracks) {
  const list = Array.isArray(tracks) && tracks.length ? tracks : DEFAULT_TRACKS
  if (trackId && list.some(t => t.id === trackId)) return trackId
  const lowered = String(trackId || '').toLowerCase()
  if (lowered.includes('front') || lowered.includes('css') || lowered.includes('dialog')) return 'track-frontend'
  if (lowered.includes('growth') || lowered.includes('wechat') || lowered.includes('article')) return 'track-growth'
  return list[0].id
}

function sanitizeLedger(raw) {
  const base = emptyLedgerState()
  if (!raw || typeof raw !== 'object') return base
  const tracks = Array.isArray(raw.tracks) && raw.tracks.length
    ? raw.tracks.filter(t => t && t.id && t.title).map((t, i) => ({
        id: cleanText(t.id, 60),
        title: cleanText(t.title, 90),
        subtitle: cleanText(t.subtitle, 180),
        order: Number.isFinite(t.order) ? t.order : i + 1,
      }))
    : base.tracks

  const normalizeItem = (row, fallbackIdx = 0) => {
    if (!row || typeof row !== 'object') return null
    const title = cleanText(row.title, 180)
    if (!title) return null
    return {
      id: cleanText(row.id, 80) || makeId('item'),
      trackId: normalizeTrackId(row.trackId, tracks),
      title,
      source: normalizeSource(row.source || 'dsh-chat'),
      epistemic: normalizeEpistemic(row.epistemic || 'explicit'),
      masteryTier: clampTier(row.masteryTier || 1),
      why: cleanText(row.why, 500),
      rejected: cleanText(row.rejected, 500),
      probe: cleanText(row.probe, 360),
      evidenceSummary: cleanText(row.evidenceSummary, 500),
      priority: Number.isFinite(row.priority) ? row.priority : 50 + (fallbackIdx % 10),
      lowValue: Boolean(row.lowValue),
      quiz: row.quiz ? sanitizeQuizBlock(row.quiz, title, row.why, row.rejected, row.probe) : undefined,
      createdAt: Number.isFinite(row.createdAt) ? row.createdAt : Date.now(),
      updatedAt: Number.isFinite(row.updatedAt) ? row.updatedAt : Date.now(),
    }
  }

  const normalizeTriage = row => {
    if (!row || typeof row !== 'object') return null
    const title = cleanText(row.title, 180)
    if (!title) return null
    return {
      id: cleanText(row.id, 80) || makeId('cand'),
      trackId: normalizeTrackId(row.trackId, tracks),
      title,
      source: normalizeSource(row.source || 'dsh-chat'),
      epistemic: normalizeEpistemic(row.epistemic || 'inferred'),
      why: cleanText(row.why, 500),
      rejected: cleanText(row.rejected, 500),
      probe: cleanText(row.probe, 360),
      lowValue: Boolean(row.lowValue),
      quiz: row.quiz ? sanitizeQuizBlock(row.quiz, title, row.why, row.rejected, row.probe) : undefined,
      capturedAt: Number.isFinite(row.capturedAt) ? row.capturedAt : Date.now(),
    }
  }

  const items = Array.isArray(raw.items) ? raw.items.map(normalizeItem).filter(Boolean) : []
  const triage = Array.isArray(raw.triage) ? raw.triage.map(normalizeTriage).filter(Boolean) : []
  const dismissedCardKeys = Array.isArray(raw.dismissedCardKeys)
    ? [...new Set(raw.dismissedCardKeys.map(k => cleanText(k, 160)).filter(Boolean))].slice(-200)
    : []
  const undoStack = Array.isArray(raw.undoStack) ? raw.undoStack.slice(-MAX_UNDO) : []

  return {
    schemaVersion: SCHEMA_VERSION,
    version: Number.isInteger(raw.version) && raw.version > 0 ? raw.version : 1,
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now(),
    tracks,
    items,
    triage,
    dismissedCardKeys,
    undoStack,
  }
}

function buildTrackCourse(track, trackItems) {
  const prioritized = [...trackItems].sort((a, b) => {
    const aDone = a.masteryTier >= 4 ? 1 : 0
    const bDone = b.masteryTier >= 4 ? 1 : 0
    if (aDone !== bDone) return aDone - bDone
    return (a.masteryTier - b.masteryTier) || ((b.priority || 0) - (a.priority || 0))
  })
  const stations = prioritized.slice(0, 3).map((item, idx) => ({
    station: idx + 1,
    durationMin: 5,
    itemId: item.id,
    title: item.title,
    masteryTier: item.masteryTier,
    masteryLabel: MASTERY_LABELS[item.masteryTier],
    focus: item.masteryTier < 3 ? '盲测澄清关键取舍' : '换项目场景迁移追问',
  }))
  return {
    trackId: track.id,
    trackTitle: track.title,
    totalMinutes: Math.max(5, stations.length * 5),
    stations,
  }
}

export function createLedgerStore(options = {}) {
  const dshHome = resolveDshHome(options.dshHome)
  const rootDir = options.rootDir ? path.resolve(options.rootDir) : path.join(dshHome, 'incidental-learn')
  const ledgerFile = path.join(rootDir, 'ledger.json')
  const exportsDir = path.join(rootDir, 'exports')
  const practiceWorkspaceDir = path.join(rootDir, 'practice-workspace')

  let cachedState = null
  let cachedMtimeMs = -1
  let writeSeq = 0
  let queue = Promise.resolve()

  function ensureDirs() {
    fs.mkdirSync(rootDir, { recursive: true })
    fs.mkdirSync(exportsDir, { recursive: true })
  }

  function atomicWrite(state) {
    ensureDirs()
    const next = {
      ...state,
      schemaVersion: SCHEMA_VERSION,
      updatedAt: Date.now(),
    }
    const payload = JSON.stringify(next, null, 2) + '\n'
    const tmpFile = path.join(rootDir, `.ledger.${process.pid}.${++writeSeq}.tmp`)
    fs.writeFileSync(tmpFile, payload, 'utf8')
    fs.renameSync(tmpFile, ledgerFile)
    try {
      cachedMtimeMs = fs.statSync(ledgerFile).mtimeMs
    } catch {
      cachedMtimeMs = Date.now()
    }
    cachedState = next
    return next
  }

  function loadFreshState() {
    ensureDirs()
    if (!fs.existsSync(ledgerFile)) {
      const initial = emptyLedgerState()
      return atomicWrite(initial)
    }
    let st
    try {
      st = fs.statSync(ledgerFile)
    } catch {
      st = null
    }
    if (cachedState && st && st.mtimeMs === cachedMtimeMs) {
      return cachedState
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'))
      cachedState = sanitizeLedger(parsed)
      cachedMtimeMs = st ? st.mtimeMs : Date.now()
      return cachedState
    } catch {
      const recovered = emptyLedgerState()
      return atomicWrite(recovered)
    }
  }

  function pushUndo(state, label) {
    const entry = {
      label: cleanText(label, 80) || '操作',
      at: Date.now(),
      items: cloneJson(state.items),
      triage: cloneJson(state.triage),
      tracks: cloneJson(state.tracks),
      dismissedCardKeys: cloneJson(state.dismissedCardKeys),
    }
    state.undoStack = [...state.undoStack.slice(-(MAX_UNDO - 1)), entry]
  }

  async function mutate(fn) {
    const task = queue.then(() => {
      const current = cloneJson(loadFreshState())
      const prevVersion = current.version
      const result = fn(current)
      current.version = prevVersion + 1
      const saved = atomicWrite(current)
      return { state: saved, extra: result }
    })
    queue = task.catch(() => {})
    return task
  }

  function buildSnapshot(rawState) {
    const state = rawState || loadFreshState()
    const tracks = state.tracks.map(track => {
      const trackItems = state.items.filter(it => it.trackId === track.id)
      const masteredCount = trackItems.filter(it => it.masteryTier >= 3).length
      const fullMasteredCount = trackItems.filter(it => it.masteryTier >= 4).length
      return {
        ...track,
        items: trackItems,
        totalCount: trackItems.length,
        masteredCount,
        fullMasteredCount,
        course15m: buildTrackCourse(track, trackItems),
      }
    })

    const unmastered = state.items.filter(it => it.masteryTier < 4)
    const sortedSpotlight = [...unmastered].sort((a, b) => {
      const aWeak = a.masteryTier <= 2 ? 1 : 0
      const bWeak = b.masteryTier <= 2 ? 1 : 0
      if (aWeak !== bWeak) return bWeak - aWeak
      return ((b.priority || 0) - (a.priority || 0)) || (a.masteryTier - b.masteryTier)
    })
    const spotlight = sortedSpotlight[0] || state.items[0] || null
    const masteredTotal = state.items.filter(it => it.masteryTier >= 3).length
    const activeTodoCount = state.items.filter(it => it.masteryTier < 3).length
    const digestCount = state.triage.length + activeTodoCount

    return {
      version: state.version,
      updatedAt: state.updatedAt,
      tracks,
      items: state.items,
      triage: state.triage,
      triageOverCap: state.triage.length > 5,
      spotlight,
      stats: {
        totalItems: state.items.length,
        masteredItems: masteredTotal,
        fullMasteredItems: state.items.filter(it => it.masteryTier >= 4).length,
        trackCount: tracks.length,
        triageCount: state.triage.length,
        digestCount,
      },
      dismissedCardKeys: state.dismissedCardKeys,
      canUndo: state.undoStack.length > 0,
      lastUndoLabel: state.undoStack.length > 0 ? state.undoStack[state.undoStack.length - 1].label : '',
    }
  }

  function findItemByTitleOrId(state, { itemId, title }) {
    if (itemId) {
      const byId = state.items.find(it => it.id === itemId)
      if (byId) return byId
    }
    const clean = cleanText(title, 180)
    if (clean) {
      return state.items.find(it => it.title === clean) || null
    }
    return null
  }

  return {
    dshHome,
    rootDir,
    ledgerFile,
    exportsDir,
    practiceWorkspaceDir,

    ensureInitialized() {
      loadFreshState()
      return this
    },

    getSnapshot({ sinceVersion } = {}) {
      const state = loadFreshState()
      if (Number.isInteger(sinceVersion) && sinceVersion === state.version) {
        return { unchanged: true, version: state.version }
      }
      return { unchanged: false, snapshot: buildSnapshot(state) }
    },

    async loadSamplePack() {
      const { state } = await mutate(draft => {
        pushUndo(draft, '载入多 Agent 演示样本')
        const now = Date.now()
        draft.tracks = STARTER_SAMPLE_PACK.tracks.map(t => ({ ...t }))
        draft.items = STARTER_SAMPLE_PACK.items.map((it, idx) => ({
          ...cloneJson(it),
          createdAt: now - (idx + 2) * 3600_000,
          updatedAt: now - (idx + 1) * 1800_000,
        }))
        draft.triage = STARTER_SAMPLE_PACK.triage.map((cand, idx) => ({
          ...cloneJson(cand),
          capturedAt: now - (idx + 1) * 900_000,
        }))
      })
      return buildSnapshot(state)
    },

    async resetEmpty() {
      const { state } = await mutate(draft => {
        pushUndo(draft, '清空台账')
        draft.items = []
        draft.triage = []
        draft.dismissedCardKeys = []
      })
      return buildSnapshot(state)
    },

    async captureCandidate(payload = {}) {
      const title = cleanText(payload.title, 180)
      if (!title) throw new Error('captureCandidate requires a non-empty title')
      const { state, extra } = await mutate(draft => {
        const trackId = normalizeTrackId(payload.trackId, draft.tracks)
        const existingItem = draft.items.find(it => it.title === title)
        if (existingItem) {
          return { candidate: existingItem, deduplicated: true, alreadyInTrack: true }
        }
        const existingCand = draft.triage.find(c => c.title === title)
        if (existingCand) {
          existingCand.why = cleanText(payload.why, 500) || existingCand.why
          existingCand.rejected = cleanText(payload.rejected, 500) || existingCand.rejected
          existingCand.probe = cleanText(payload.probe, 360) || existingCand.probe
          existingCand.capturedAt = Date.now()
          return { candidate: existingCand, deduplicated: true }
        }
        pushUndo(draft, `挂入候选「${title.slice(0, 14)}」`)
        const candidate = {
          id: cleanText(payload.id, 80) || makeId('cand'),
          trackId,
          title,
          source: normalizeSource(payload.source || 'dsh-chat'),
          epistemic: normalizeEpistemic(payload.epistemic || 'inferred'),
          why: cleanText(payload.why, 500),
          rejected: cleanText(payload.rejected, 500),
          probe: cleanText(payload.probe, 360),
          lowValue: Boolean(payload.lowValue),
          quiz: sanitizeQuizBlock(payload.quiz, title, payload.why, payload.rejected, payload.probe),
          capturedAt: Date.now(),
        }
        draft.triage.unshift(candidate)
        return { candidate, deduplicated: false }
      })
      return { snapshot: buildSnapshot(state), ...extra }
    },

    async saveExplicitItem(payload = {}) {
      const title = cleanText(payload.title, 180)
      if (!title) throw new Error('saveExplicitItem requires a non-empty title')
      const { state, extra } = await mutate(draft => {
        pushUndo(draft, `明存「${title.slice(0, 14)}」`)
        const trackId = normalizeTrackId(payload.trackId, draft.tracks)
        let target = findItemByTitleOrId(draft, { itemId: payload.itemId, title })
        const now = Date.now()
        if (target) {
          target.trackId = trackId
          target.why = cleanText(payload.why, 500) || target.why
          target.rejected = cleanText(payload.rejected, 500) || target.rejected
          target.probe = cleanText(payload.probe, 360) || target.probe
          target.epistemic = normalizeEpistemic(payload.epistemic || 'explicit')
          target.source = normalizeSource(payload.source || target.source)
          if (payload.masteryTier) target.masteryTier = Math.max(target.masteryTier, clampTier(payload.masteryTier))
          target.updatedAt = now
        } else {
          target = {
            id: cleanText(payload.id || payload.itemId, 80) || makeId('item'),
            trackId,
            title,
            source: normalizeSource(payload.source || 'dsh-chat'),
            epistemic: normalizeEpistemic(payload.epistemic || 'explicit'),
            masteryTier: clampTier(payload.masteryTier || 1),
            why: cleanText(payload.why, 500),
            rejected: cleanText(payload.rejected, 500),
            probe: cleanText(payload.probe, 360),
            evidenceSummary: cleanText(payload.evidenceSummary, 500),
            priority: Number.isFinite(payload.priority) ? payload.priority : 80,
            lowValue: false,
            quiz: sanitizeQuizBlock(payload.quiz, title, payload.why, payload.rejected, payload.probe),
            createdAt: now,
            updatedAt: now,
          }
          draft.items.unshift(target)
        }
        draft.triage = draft.triage.filter(c => c.title !== title && c.id !== target.id)
        return { item: cloneJson(target) }
      })
      return { snapshot: buildSnapshot(state), ...extra }
    },

    async triageDecision({ id, decision, trackId } = {}) {
      if (!id) throw new Error('triageDecision requires candidate id')
      if (decision !== 'accept' && decision !== 'skip') {
        throw new Error('triageDecision requires decision accept|skip')
      }
      const { state, extra } = await mutate(draft => {
        const idx = draft.triage.findIndex(c => c.id === id)
        if (idx < 0) return { found: false }
        const cand = draft.triage[idx]
        pushUndo(draft, decision === 'accept' ? `收入「${cand.title.slice(0, 12)}」` : `略过「${cand.title.slice(0, 12)}」`)
        draft.triage.splice(idx, 1)
        let created = null
        if (decision === 'accept') {
          const targetTrack = normalizeTrackId(trackId || cand.trackId, draft.tracks)
          const existing = findItemByTitleOrId(draft, { title: cand.title })
          if (existing) {
            existing.trackId = targetTrack
            existing.updatedAt = Date.now()
            created = existing
          } else {
            created = {
              id: makeId('item'),
              trackId: targetTrack,
              title: cand.title,
              source: cand.source,
              epistemic: cand.epistemic === 'verified' ? 'verified' : 'explicit',
              masteryTier: 1,
              why: cand.why,
              rejected: cand.rejected,
              probe: cand.probe,
              evidenceSummary: '已从待分诊候选收入路线，等待 90s 小灶或 3 分钟闯关检验。',
              priority: 75,
              lowValue: false,
              quiz: cand.quiz,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            }
            draft.items.unshift(created)
          }
        }
        return { found: true, decision, item: created ? cloneJson(created) : null }
      })
      return { snapshot: buildSnapshot(state), ...extra }
    },

    async triageBatch({ mode } = {}) {
      if (mode !== 'accept_all' && mode !== 'sweep_low_value') {
        throw new Error('triageBatch requires mode accept_all|sweep_low_value')
      }
      const { state, extra } = await mutate(draft => {
        if (draft.triage.length === 0) return { affected: 0 }
        if (mode === 'sweep_low_value') {
          const lowCount = draft.triage.filter(c => c.lowValue).length
          const targets = lowCount > 0 ? draft.triage.filter(c => c.lowValue) : draft.triage.filter(c => c.epistemic === 'inferred').slice(2)
          if (targets.length === 0) return { affected: 0 }
          const dropIds = new Set(targets.map(c => c.id))
          pushUndo(draft, `清理 ${dropIds.size} 条低价值候选`)
          draft.triage = draft.triage.filter(c => !dropIds.has(c.id))
          return { affected: dropIds.size, mode }
        }
        pushUndo(draft, `一键收入 ${draft.triage.length} 条候选`)
        const now = Date.now()
        let accepted = 0
        for (const cand of draft.triage) {
          if (!findItemByTitleOrId(draft, { title: cand.title })) {
            draft.items.unshift({
              id: makeId('item'),
              trackId: normalizeTrackId(cand.trackId, draft.tracks),
              title: cand.title,
              source: cand.source,
              epistemic: cand.epistemic === 'verified' ? 'verified' : 'explicit',
              masteryTier: 1,
              why: cand.why,
              rejected: cand.rejected,
              probe: cand.probe,
              evidenceSummary: '批量分诊收入路线，待后续小灶复述升级。',
              priority: 70,
              lowValue: false,
              quiz: cand.quiz,
              createdAt: now,
              updatedAt: now,
            })
            accepted += 1
          }
        }
        draft.triage = []
        return { affected: accepted, mode }
      })
      return { snapshot: buildSnapshot(state), ...extra }
    },

    async recordMicroDrill({ itemId, card, correct, selectedKey, evidenceNote } = {}) {
      const safeCard = card && typeof card === 'object' ? card : {}
      const title = cleanText(safeCard.title, 180)
      const { state, extra } = await mutate(draft => {
        let target = findItemByTitleOrId(draft, { itemId: itemId || safeCard.id, title })
        const targetTier = correct ? 3 : 2
        const now = Date.now()
        const note = cleanText(evidenceNote, 420) || (
          correct
            ? `在右栏 90s 小灶盲测中选择 ${cleanText(selectedKey, 6) || '正确项'}，不看提示准确区分核心取舍与被排除方案。`
            : `已完成右栏 90s 小灶首轮点拨，拆清了「${title || '当前卡片'}」的反直觉边界，待后续独立复述验证。`
        )
        pushUndo(draft, `90s 小灶记录「${(target?.title || title || '卡片').slice(0, 12)}」`)

        if (target) {
          const fromTier = target.masteryTier
          target.masteryTier = Math.max(target.masteryTier, targetTier)
          target.evidenceSummary = note
          target.epistemic = target.epistemic === 'verified' ? 'verified' : 'explicit'
          target.updatedAt = now
          draft.triage = draft.triage.filter(c => c.title !== target.title && c.id !== target.id)
          return { item: cloneJson(target), fromTier, toTier: target.masteryTier }
        }

        const newTitle = title || '90s 小灶点拨卡片'
        const created = {
          id: cleanText(itemId, 80) || makeId('item'),
          trackId: normalizeTrackId(safeCard.trackId, draft.tracks),
          title: newTitle,
          source: normalizeSource(safeCard.source || 'dsh-chat'),
          epistemic: 'explicit',
          masteryTier: targetTier,
          why: cleanText(safeCard.why, 500),
          rejected: cleanText(safeCard.rejected, 500),
          probe: cleanText(safeCard.probe, 360),
          evidenceSummary: note,
          priority: 82,
          lowValue: false,
          quiz: sanitizeQuizBlock(safeCard.quiz, newTitle, safeCard.why, safeCard.rejected, safeCard.probe),
          createdAt: now,
          updatedAt: now,
        }
        draft.items.unshift(created)
        draft.triage = draft.triage.filter(c => c.title !== newTitle)
        return { item: cloneJson(created), fromTier: 1, toTier: targetTier }
      })
      return { snapshot: buildSnapshot(state), ...extra }
    },

    async recordCheckpoint({ itemId, title, trackId, toTier, evidenceSummary, epistemic, allowReset } = {}) {
      const cleanTitle = cleanText(title, 180)
      if (!itemId && !cleanTitle) {
        throw new Error('recordCheckpoint requires itemId or title')
      }
      const nextTier = clampTier(toTier || 4)
      const safeEvidence = cleanText(evidenceSummary, 500) || `已完成先探后讲与换景迁移追问，掌握度升至 ${MASTERY_LABELS[nextTier]}。`
      const { state, extra } = await mutate(draft => {
        let target = findItemByTitleOrId(draft, { itemId, title: cleanTitle })
        const now = Date.now()
        pushUndo(draft, `过关记录「${(target?.title || cleanTitle).slice(0, 12)}」`)
        if (target) {
          const fromTier = target.masteryTier
          target.masteryTier = allowReset ? nextTier : Math.max(target.masteryTier, nextTier)
          target.evidenceSummary = safeEvidence
          if (epistemic) target.epistemic = normalizeEpistemic(epistemic)
          target.updatedAt = now
          draft.triage = draft.triage.filter(c => c.title !== target.title && c.id !== target.id)
          return { item: cloneJson(target), fromTier, toTier: target.masteryTier }
        }
        const resolvedTrack = normalizeTrackId(trackId, draft.tracks)
        const created = {
          id: cleanText(itemId, 80) || makeId('item'),
          trackId: resolvedTrack,
          title: cleanTitle || '闯关知识点',
          source: 'dsh-chat',
          epistemic: normalizeEpistemic(epistemic || 'explicit'),
          masteryTier: nextTier,
          why: cleanText(safeEvidence, 420),
          rejected: '',
          probe: '',
          evidenceSummary: safeEvidence,
          priority: 80,
          lowValue: false,
          createdAt: now,
          updatedAt: now,
        }
        draft.items.unshift(created)
        draft.triage = draft.triage.filter(c => c.title !== created.title)
        return { item: cloneJson(created), fromTier: 1, toTier: nextTier }
      })
      return { snapshot: buildSnapshot(state), ...extra }
    },

    async dismissCard({ cardKey, restore } = {}) {
      const key = cleanText(cardKey, 160)
      if (!key) throw new Error('dismissCard requires cardKey')
      const { state } = await mutate(draft => {
        if (restore) {
          draft.dismissedCardKeys = draft.dismissedCardKeys.filter(k => k !== key)
        } else if (!draft.dismissedCardKeys.includes(key)) {
          draft.dismissedCardKeys.push(key)
        }
      })
      return { snapshot: buildSnapshot(state) }
    },

    exportMarkdown({ trackId } = {}) {
      const snap = buildSnapshot(loadFreshState())
      const targetTracks = trackId ? snap.tracks.filter(t => t.id === trackId) : snap.tracks
      const dateStr = new Date().toISOString().slice(0, 10)
      const lines = [
        '# 顺带私教 · 个人能力路线与过关笔记',
        '',
        `- 汇总日期：${dateStr}`,
        `- 账本概况：已内化 ${snap.stats.masteredItems} / ${snap.stats.totalItems} 项，待分诊 ${snap.triage.length} 条`,
        '',
      ]
      for (const track of targetTracks) {
        lines.push(`## ${track.title}（${track.masteredCount}/${track.totalCount} 已内化）`)
        lines.push('')
        if (track.subtitle) {
          lines.push(`> ${track.subtitle}`)
          lines.push('')
        }
        for (const item of track.items) {
          const src = (SOURCE_META[item.source] && SOURCE_META[item.source].label) || item.source
          lines.push(`### ${item.title} [${MASTERY_LABELS[item.masteryTier]} · ${src}]`)
          if (item.why) lines.push(`- 为什么这么做：${item.why}`)
          if (item.rejected) lines.push(`- 被排除的差方案：${item.rejected}`)
          if (item.probe) lines.push(`- 一句话摸底：${item.probe}`)
          if (item.evidenceSummary) lines.push(`- 过关证据：${item.evidenceSummary}`)
          lines.push('')
        }
      }
      const markdown = lines.join('\n').trim() + '\n'
      ensureDirs()
      const fileName = `incidental-learn-notes-${dateStr}.md`
      const filePath = path.join(exportsDir, fileName)
      fs.writeFileSync(filePath, markdown, 'utf8')
      return { markdown, filePath, fileName }
    },

    async undoLast() {
      const { state, extra } = await mutate(draft => {
        if (!draft.undoStack.length) return { undone: false, label: '' }
        const last = draft.undoStack.pop()
        draft.items = Array.isArray(last.items) ? last.items : draft.items
        draft.triage = Array.isArray(last.triage) ? last.triage : draft.triage
        draft.tracks = Array.isArray(last.tracks) ? last.tracks : draft.tracks
        draft.dismissedCardKeys = Array.isArray(last.dismissedCardKeys) ? last.dismissedCardKeys : draft.dismissedCardKeys
        return { undone: true, label: last.label }
      })
      return { snapshot: buildSnapshot(state), ...extra }
    },
  }
}
