// Gate 1b client bundle contract & slot lifecycle verification for @oxmumu3/dsh-incidental-learn.
const { strict: assert } = require('node:assert')
const { readFileSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { runInNewContext } = require('node:vm')

const directory = process.argv[2] ? resolve(process.argv[2]) : resolve(__dirname, '..')
const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
assert.equal(manifest.name, '@oxmumu3/dsh-incidental-learn')

const source = readFileSync(join(directory, manifest.exports['./client']), 'utf8')
assert.equal(/^\s*export\s+/m.test(source), false, 'client.js must not contain ESM export statements')

const loaded = []
runInNewContext(source, {
  window: {
    __ModuleLoader__: { load: row => loaded.push(row) },
  },
  document: {
    getElementById: () => null,
    createElement: () => ({ id: '', textContent: '' }),
    head: { appendChild: () => {} },
    documentElement: { appendChild: () => {} },
  },
  fetch: async () => ({ ok: true, json: async () => ({ ok: true, snapshot: null }) }),
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
})

assert.equal(loaded.length, 1, 'exactly one ModuleLoader factory entry')
assert.equal(loaded[0].id, manifest.name, 'factory id must match package name')

const plugin = loaded[0].factory(name => {
  assert.equal(name, 'react')
  return {
    Fragment: 'Fragment',
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState: init => [typeof init === 'function' ? init() : init, () => {}],
    useEffect: () => {},
    useRef: v => ({ current: v }),
  }
})

assert.ok(plugin.inject.includes('slots'), 'client entry waits for slots service')

const mounted = new Map()
const rightTabs = []
const dispose = []

plugin.apply({
  effect(setup) {
    const clean = setup()
    if (typeof clean === 'function') dispose.push(clean)
  },
  sidebarRightTabs: {
    register(def) {
      rightTabs.push(def)
      return () => {
        const i = rightTabs.indexOf(def)
        if (i >= 0) rightTabs.splice(i, 1)
      }
    },
  },
  slots: {
    inject(_name, register) {
      const remove = register()
      assert.equal(typeof remove, 'function')
      return remove
    },
    register(options, Component) {
      const slotId = options.name + ':' + (options.key || options.id || 'default')
      assert.equal(mounted.has(slotId), false, `duplicate slot ${slotId}`)
      mounted.set(slotId, { options, Component })
      return () => mounted.delete(slotId)
    },
  },
})

assert.equal(rightTabs.length, 1, 'sidebarRightTabs definition registered')
assert.equal(rightTabs[0].id, '@oxmumu3/dsh-incidental-learn/coach')
assert.equal(rightTabs[0].kind, 'incidental-learn-coach')

const icon = mounted.get('sidebar.panellist:incidental-learn')
const panel = mounted.get('main:incidental-learn')
const rightPane = mounted.get('sidebar.right.pane.tab:@oxmumu3/dsh-incidental-learn/coach')
const shieldFence = mounted.get('conversation.chat.markdown.fence:shield')
const quizFence = mounted.get('conversation.chat.markdown.fence:learn-quiz')
const passFence = mounted.get('conversation.chat.markdown.fence:learn-pass')
const pill = mounted.get('conversation.input.right:@oxmumu3/dsh-incidental-learn/input-pill')
const saveView = mounted.get('tool.call.toolview:learn_save')
const checkView = mounted.get('tool.call.toolview:learn_checkpoint')
const triageView = mounted.get('tool.call.toolview:learn_triage')

assert.ok(icon && panel, 'sidebar icon + main workbench registered')
assert.equal(icon.options.id, panel.options.key, 'sidebar entry must match main key')
assert.ok(rightPane, 'sidebar.right.pane.tab keyed by COACH_TAB_ID (definition.id)')
assert.ok(shieldFence && quizFence && passFence, 'all 3 markdown fence layers registered')
assert.ok(pill, 'conversation.input.right digest pill registered')
assert.ok(saveView && checkView && triageView, 'all 3 tool.call.toolview receipts registered')

assert.ok(icon.Component({ active: false, size: 18 }))
assert.ok(panel.Component())
assert.ok(shieldFence.Component({ code: '', streaming: true }))
assert.ok(shieldFence.Component({ code: JSON.stringify({ title: 'T', why: 'W', rejected: 'R', probe: 'P' }), streaming: false }))
assert.ok(quizFence.Component({ code: JSON.stringify({ title: 'Q', question: 'Q?', options: [{ key: 'A', label: 'Opt A' }] }), streaming: false }))
assert.ok(passFence.Component({ code: JSON.stringify({ title: 'P', fromTier: 1, toTier: 4, evidenceSummary: 'Done' }), streaming: false }))
assert.ok(rightPane.Component({ sessionId: 's1' }))

for (const cleanup of dispose.reverse()) cleanup()
assert.equal(mounted.size, 0, 'teardown removes all mounted slots')
assert.equal(rightTabs.length, 0, 'teardown removes sidebarRightTabs definition')
console.log('Client bundle contract & 5-surface slot lifecycle OK (@oxmumu3/dsh-incidental-learn)')
