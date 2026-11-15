// Authenticated HTTP routes for @oxmumu3/dsh-incidental-learn (`顺带私教`).
//
// Registered via connection.fetch.register under /api/incidental_learn/*:
//   GET  /api/incidental_learn/view    -> ledger snapshot (or `unchanged: true` via `?sinceVersion=`)
//   POST /api/incidental_learn/action  -> atomic ledger mutations, course plan, export, ensure_practice_workspace
//
// Security guards:
//   - Rejects cross-site POST writes (`Sec-Fetch-Site`, `Origin`) -> 403
//   - Requires JSON Content-Type on POST -> 415
//   - Enforces <= 256KB body limit -> 413

import fs from 'node:fs'
import path from 'node:path'

const MAX_BODY_BYTES = 256 * 1024

const BASE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
}

function jsonReply(payload, status = 200) {
  return Response.json(payload, { status, headers: BASE_HEADERS })
}

export function isCrossSiteWrite(request) {
  const fetchSite = request.headers?.get?.('sec-fetch-site') || ''
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    return true
  }
  const origin = request.headers?.get?.('origin') || ''
  if (origin) {
    try {
      const o = new URL(origin)
      if (!['127.0.0.1', 'localhost', '::1'].includes(o.hostname) && !['dsh-app:', 'app:', 'file:'].includes(o.protocol)) {
        return true
      }
    } catch {
      return true
    }
  }
  return false
}

export function resolveHostWorkspaces(ctx) {
  const reg =
    ctx?.get?.('workspaceRegistry', false) ||
    ctx?.workspaceRegistry ||
    ctx?.get?.('workspaces', false) ||
    ctx?.workspaces ||
    null
  if (!reg) return []
  try {
    const raw = typeof reg.list === 'function'
      ? reg.list()
      : (reg.list?.getSnapshot?.() || [])
    const arr = Array.isArray(raw) ? raw : (Array.isArray(raw?.items) ? raw.items : [])
    return arr
      .filter(w => w && (typeof w.path === 'string' || typeof w.id === 'string'))
      .map(w => ({
        id: String(w.id || w.workspaceId || w.path),
        name: String(w.name || (w.path ? path.basename(w.path) : w.id)),
        path: String(w.path || ''),
      }))
  } catch {
    return []
  }
}

export async function ensurePracticeWorkspace(ctx, store) {
  const existing = resolveHostWorkspaces(ctx)
  if (existing.length > 0) {
    return { workspaceId: existing[0].id, path: existing[0].path, created: false }
  }
  const dir = store.practiceWorkspaceDir
  fs.mkdirSync(dir, { recursive: true })
  const reg =
    ctx?.get?.('workspaceRegistry', false) ||
    ctx?.workspaceRegistry ||
    ctx?.get?.('workspaces', false) ||
    ctx?.workspaces ||
    null
  if (!reg) {
    return { workspaceId: null, path: dir, created: false }
  }
  try {
    if (typeof reg.resolveByPath === 'function') {
      const hit = await reg.resolveByPath(dir)
      if (hit && hit.id) return { workspaceId: String(hit.id), path: dir, created: false }
    }
  } catch {
    // Fall through to create()
  }
  try {
    if (typeof reg.create === 'function') {
      const ws = await reg.create(dir)
      if (ws && ws.id) return { workspaceId: String(ws.id), path: dir, created: true }
    }
  } catch {
    // Fall back to re-listing in case of concurrent creation
  }
  const retryList = resolveHostWorkspaces(ctx)
  if (retryList.length > 0) {
    return { workspaceId: retryList[0].id, path: retryList[0].path, created: false }
  }
  return { workspaceId: null, path: dir, created: false }
}

async function readJsonBody(request) {
  const contentType = request.headers?.get?.('content-type') || ''
  if (!contentType.toLowerCase().includes('application/json')) {
    return { errorStatus: 415, error: 'Content-Type must be application/json' }
  }
  const contentLenHeader = Number(request.headers?.get?.('content-length') || '0')
  if (Number.isFinite(contentLenHeader) && contentLenHeader > MAX_BODY_BYTES) {
    return { errorStatus: 413, error: 'Request payload exceeds 256KB limit' }
  }
  const text = await request.text()
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) {
    return { errorStatus: 413, error: 'Request payload exceeds 256KB limit' }
  }
  try {
    const body = text ? JSON.parse(text) : {}
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return { errorStatus: 400, error: 'JSON body must be an object' }
    }
    return { body }
  } catch {
    return { errorStatus: 400, error: 'Invalid JSON body' }
  }
}

export async function handleViewRequest({ request, ctx, store }) {
  const url = new URL(request.url, 'http://127.0.0.1')
  const rawSince = url.searchParams.get('sinceVersion')
  const sinceVersion = rawSince !== null && rawSince !== '' ? Number(rawSince) : undefined
  const res = store.getSnapshot({
    sinceVersion: Number.isInteger(sinceVersion) ? sinceVersion : undefined,
  })
  if (res.unchanged) {
    return jsonReply({ ok: true, unchanged: true, version: res.version })
  }
  return jsonReply({
    ok: true,
    unchanged: false,
    snapshot: res.snapshot,
    workspaces: resolveHostWorkspaces(ctx),
    capabilities: {
      ledgerFile: store.ledgerFile,
      exportsDir: store.exportsDir,
    },
  })
}

export async function handleActionRequest({ request, ctx, store }) {
  if (isCrossSiteWrite(request)) {
    return jsonReply({ ok: false, error: 'Cross-site write rejected' }, 403)
  }
  const parsed = await readJsonBody(request)
  if (parsed.errorStatus) {
    return jsonReply({ ok: false, error: parsed.error }, parsed.errorStatus)
  }
  const body = parsed.body
  const action = String(body.action || '').trim()
  if (!action) {
    return jsonReply({ ok: false, error: 'Missing action field' }, 400)
  }

  try {
    if (action === 'load_sample_pack') {
      const snapshot = await store.loadSamplePack()
      return jsonReply({ ok: true, action, snapshot })
    }
    if (action === 'reset_empty') {
      const snapshot = await store.resetEmpty()
      return jsonReply({ ok: true, action, snapshot })
    }
    if (action === 'capture_candidate') {
      const res = await store.captureCandidate(body.payload || body, {
        auto: Boolean(body.auto),
        cardKey: body.cardKey,
      })
      return jsonReply({ ok: true, action, ...res })
    }
    if (action === 'save_explicit') {
      const res = await store.saveExplicitItem(body.payload || body)
      return jsonReply({ ok: true, action, ...res })
    }
    if (action === 'triage_item') {
      const res = await store.triageDecision(body)
      return jsonReply({ ok: true, action, ...res })
    }
    if (action === 'triage_batch') {
      const res = await store.triageBatch(body)
      return jsonReply({ ok: true, action, ...res })
    }
    if (action === 'record_micro_drill') {
      const res = await store.recordMicroDrill(body)
      return jsonReply({ ok: true, action, ...res })
    }
    if (action === 'record_checkpoint') {
      const res = await store.recordCheckpoint(body)
      return jsonReply({ ok: true, action, ...res })
    }
    if (action === 'dismiss_card') {
      const res = await store.dismissCard(body)
      return jsonReply({ ok: true, action, ...res })
    }
    if (action === 'undo_last') {
      const res = await store.undoLast()
      return jsonReply({ ok: true, action, ...res })
    }
    if (action === 'build_course') {
      const { snapshot } = store.getSnapshot()
      const trackId = body.trackId || snapshot.tracks[0]?.id
      const track = snapshot.tracks.find(t => t.id === trackId) || snapshot.tracks[0]
      return jsonReply({ ok: true, action, course: track ? track.course15m : null, snapshot })
    }
    if (action === 'export_markdown') {
      const exported = store.exportMarkdown({ trackId: body.trackId })
      const { snapshot } = store.getSnapshot()
      return jsonReply({ ok: true, action, exported, snapshot })
    }
    if (action === 'ensure_practice_workspace') {
      const workspace = await ensurePracticeWorkspace(ctx, store)
      return jsonReply({ ok: true, action, workspace, workspaces: resolveHostWorkspaces(ctx) })
    }
    return jsonReply({ ok: false, error: `Unknown action: ${action}` }, 400)
  } catch (err) {
    return jsonReply({ ok: false, error: err instanceof Error ? err.message : String(err) }, 400)
  }
}

export function registerLearnRoutes(scope, { ctx, store }) {
  const conn = scope?.connection ?? scope?.get?.('connection', false) ?? null
  if (!conn?.fetch?.register) return undefined

  const offView = conn.fetch.register({
    path: '/api/incidental_learn/view',
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: request => handleViewRequest({ request, ctx, store }),
  })

  const offAction = conn.fetch.register({
    path: '/api/incidental_learn/action',
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: request => handleActionRequest({ request, ctx, store }),
  })

  return () => {
    try { offView?.() } catch { /* ignore */ }
    try { offAction?.() } catch { /* ignore */ }
  }
}
