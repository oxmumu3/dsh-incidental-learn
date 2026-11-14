// @oxmumu3/dsh-incidental-learn — Host entry for DSH 顺带私教.
// Wires atomic $DSH_HOME/incidental-learn/ledger.json storage, authenticated
// /api/incidental_learn/* HTTP routes, learn_* Agent tools, and byte-budgeted
// SHIELD systemPrompt guidance inside ctx.effect lifecycle hooks.

import { createLedgerStore } from './lib/ledger.js'
import { registerLearnRoutes } from './lib/routes.js'
import { installLearnTools } from './lib/tools.js'
import { registerLearnPrompt } from './lib/prompt.js'

export const name = 'dsh-incidental-learn'
export const inject = []

const MOUNTED_CTX = new WeakSet()

export function apply(ctx, config = {}) {
  if (ctx && typeof ctx === 'object') {
    if (MOUNTED_CTX.has(ctx)) return () => {}
    MOUNTED_CTX.add(ctx)
  }

  const log = message => {
    try {
      ctx?.logger?.info?.(`[dsh-incidental-learn] ${message}`)
    } catch {
      // Never disrupt host startup on logger errors.
    }
  }

  const store = createLedgerStore({ dshHome: config?.dshHome, rootDir: config?.rootDir })
  try {
    store.ensureInitialized()
  } catch (err) {
    log(`ledger init warning: ${err instanceof Error ? err.message : String(err)}`)
  }
  log(`loaded; ledger=${store.ledgerFile}`)

  const disposeTools = installLearnTools(ctx, { store }, log)
  const disposePrompt = registerLearnPrompt(ctx, log)

  let disposeRoutes
  try {
    ctx.inject(['connection'], scope => {
      try {
        const off = registerLearnRoutes(scope, { ctx, store })
        if (typeof off === 'function') {
          disposeRoutes = off
          log('routes registered: /api/incidental_learn/view, /api/incidental_learn/action')
          return () => {
            try { off() } catch { /* ignore */ }
            if (disposeRoutes === off) disposeRoutes = undefined
          }
        }
        return undefined
      } catch (err) {
        log(`route registration failed: ${err instanceof Error ? err.message : String(err)}`)
        return undefined
      }
    })
  } catch (err) {
    log(`connection inject unavailable: ${err instanceof Error ? err.message : String(err)}`)
  }

  const dispose = () => {
    try { disposeRoutes?.() } catch { /* ignore */ }
    try { disposePrompt?.() } catch { /* ignore */ }
    try { disposeTools?.() } catch { /* ignore */ }
    if (ctx && typeof ctx === 'object') {
      MOUNTED_CTX.delete(ctx)
    }
  }

  if (typeof ctx?.effect === 'function') {
    ctx.effect(() => dispose)
  }
  return dispose
}
