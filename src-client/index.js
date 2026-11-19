// Client assembly for @oxmumu3/dsh-incidental-learn (`顺带私教`).
// Bundled by scripts/build-client.mjs together with shared/schema.js and src-client/styles.js
// inside window.__ModuleLoader__.load(...) with zero ESM export statements.

var VIEW_URL = '/api/incidental_learn/view'
var ACTION_URL = '/api/incidental_learn/action'

function loadReact() {
  try {
    var mod = require('react')
    return mod && mod.createElement ? mod : (mod && mod.default) || null
  } catch (_e) {
    return null
  }
}

function getHostService(ctx, name) {
  try {
    return (ctx && typeof ctx.get === 'function' ? ctx.get(name, false) : null) || (ctx && ctx[name]) || null
  } catch (_e) {
    return (ctx && ctx[name]) || null
  }
}

function ensureStyleInjected() {
  if (typeof document === 'undefined') return
  if (document.getElementById(ILP_STYLE_ID)) return
  var el = document.createElement('style')
  el.id = ILP_STYLE_ID
  el.textContent = ILP_CSS
  ;(document.head || document.documentElement).appendChild(el)
}

function fetchJson(url, options) {
  return fetch(url, options).then(function (res) {
    return res.json().catch(function () { return {} }).then(function (data) {
      if (!res.ok || (data && data.ok === false)) {
        throw new Error((data && data.error) || ('HTTP ' + res.status))
      }
      return data
    })
  })
}

function postLearnAction(action, payload) {
  var body = Object.assign({ action: action }, payload || {})
  return fetchJson(ACTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
}

// Reactive client snapshot store shared by workbench, pill, fences, and right-sidebar drawer.
var AUTO_CAPTURED_KEYS = new Set()

function createClientLedgerBridge() {
  var snapshot = null
  var workspaces = []
  var loading = false
  var error = null
  var listeners = new Set()
  var versionSeen = null

  function emit() {
    listeners.forEach(function (fn) {
      try { fn({ snapshot: snapshot, workspaces: workspaces, loading: loading, error: error }) } catch (_e) {}
    })
  }

  function setSnapshot(next, nextWorkspaces) {
    if (!next) return
    snapshot = next
    if (Array.isArray(nextWorkspaces)) workspaces = nextWorkspaces
    versionSeen = next.version
    error = null
    loading = false
    emit()
  }

  function refresh(force) {
    var qs = (!force && typeof versionSeen === 'number') ? ('?sinceVersion=' + versionSeen) : ''
    loading = !snapshot
    return fetchJson(VIEW_URL + qs, { headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (!res.unchanged && res.snapshot) {
          setSnapshot(res.snapshot, res.workspaces)
        } else {
          if (Array.isArray(res.workspaces)) workspaces = res.workspaces
          loading = false
          error = null
          emit()
        }
        return res
      })
      .catch(function (err) {
        loading = false
        error = err && err.message ? err.message : String(err)
        emit()
        throw err
      })
  }

  function runAction(action, payload) {
    return postLearnAction(action, payload).then(function (res) {
      if (res && res.snapshot) setSnapshot(res.snapshot, res.workspaces)
      return res
    })
  }

  function subscribe(fn) {
    listeners.add(fn)
    return function () { listeners.delete(fn) }
  }

  return {
    getState: function () { return { snapshot: snapshot, workspaces: workspaces, loading: loading, error: error } },
    refresh: refresh,
    runAction: runAction,
    subscribe: subscribe,
    setSnapshot: setSnapshot,
  }
}

// Reactive per-session + latest store for right-sidebar 90s drawer payloads.
function createCoachSessionStore() {
  var bySession = new Map()
  var latestPayload = null
  var listeners = new Set()

  function notify() {
    listeners.forEach(function (fn) {
      try { fn() } catch (_e) {}
    })
  }

  return {
    setPayload: function (sessionId, cardKey, cardData) {
      var record = { sessionId: sessionId || '', cardKey: cardKey || '', card: cardData }
      if (sessionId) bySession.set(sessionId, record)
      latestPayload = record
      notify()
      return record
    },
    getPayload: function (sessionId) {
      if (sessionId && bySession.has(sessionId)) return bySession.get(sessionId)
      return latestPayload
    },
    subscribe: function (fn) {
      listeners.add(fn)
      return function () { listeners.delete(fn) }
    },
  }
}

function makeMasteryMeter(h, tier, customLabel) {
  var isZero = tier === 0 || tier === '0'
  var safeTier = isZero ? 0 : clampTier(tier || 1)
  var label = customLabel || (isZero ? '0/4 新抓到 · 未看' : (MASTERY_LABELS[safeTier] || MASTERY_LABELS[1]))
  return h('span', { className: 'ilp-meter', 'data-tier': String(safeTier) },
    h('span', { className: 'ilp-bars', 'aria-hidden': 'true' },
      h('span', null),
      h('span', null),
      h('span', null),
      h('span', null),
    ),
    h('span', { className: 'ilp-meter-label' }, label),
  )
}

function sourceTag(h, source) {
  var info = SOURCE_META[normalizeSource(source)] || SOURCE_META.manual
  return h('span', { className: 'ilp-tag outline' }, info.label)
}

function epistemicTag(h, epistemic) {
  var norm = normalizeEpistemic(epistemic)
  var info = EPISTEMIC_META[norm] || EPISTEMIC_META.inferred
  var tone = norm === 'verified' ? 'ok' : (norm === 'explicit' ? 'run' : 'wait')
  return h('span', { className: 'ilp-tag ' + tone }, info.label)
}

function hashCardKey(parsed, fallbackSeed) {
  var base = (parsed && (parsed.id || parsed.title)) || fallbackSeed || 'shield-card'
  var hVal = 0
  for (var i = 0; i < base.length; i += 1) {
    hVal = ((hVal << 5) - hVal + base.charCodeAt(i)) | 0
  }
  return 'card-' + Math.abs(hVal).toString(36)
}

function openDeepLearnSession(ctx, item, preferredWorkspaceId) {
  var prompt = (item && typeof item.promptOverride === 'string')
    ? item.promptOverride
    : buildDeepLearnStarterPrompt(item)
  return postLearnAction('ensure_practice_workspace', {}).then(function (res) {
    var wsId = preferredWorkspaceId || (res && res.workspace && res.workspace.workspaceId)
    var layout = getHostService(ctx, 'layout')
    var uiWorkspace = getHostService(ctx, 'uiWorkspace')
    var sessions = getHostService(ctx, 'sessions')
    var conv = getHostService(ctx, 'conversation')

    if (layout && typeof layout.selectPanel === 'function') {
      try { layout.selectPanel(null) } catch (_e) {}
    }

    if (uiWorkspace && typeof uiWorkspace.openWorkspace === 'function' && sessions && conv && conv.input && wsId) {
      return uiWorkspace.openWorkspace(wsId, function (sessionId) {
        try {
          var binding = typeof sessions.binding === 'function' ? sessions.binding(sessionId) : null
          if (binding && typeof conv.input.requestDraftInitialization === 'function') {
            conv.input.requestDraftInitialization(binding, {
              prompt: prompt,
              whenDraftExists: 'replace',
            })
          }
          setTimeout(function () {
            try {
              if (conv.input && typeof conv.input.shell === 'function') {
                conv.input.shell(sessionId).submit('queue', 'click')
              }
            } catch (_e2) {}
          }, 90)
        } catch (_e3) {}
      })
    }

    if (uiWorkspace && typeof uiWorkspace.startSession === 'function') {
      uiWorkspace.startSession(wsId || undefined, {
        prompt: prompt,
        whenDraftExists: 'replace',
      })
    }
    return { workspaceId: wsId, prompt: prompt }
  })
}

// 1. Sidebar icon (`sidebar.panellist`)
function makeIconComponent(React) {
  return function IncidentalLearnIcon(props) {
    var h = React.createElement
    var size = (props && props.size) || 18
    var active = !!(props && props.active)
    return h('svg', {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: active ? '2' : '1.75',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': 'true',
    },
      h('path', { d: 'M12 3L4.5 6.5v5.2c0 4.6 3.2 8.7 7.5 9.8 4.3-1.1 7.5-5.2 7.5-9.8V6.5L12 3z' }),
      h('path', { d: 'M9 12.2l2 2 4-4.2' }),
    )
  }
}

// Native <dialog closedby="any"> Modal #1: Experience Card Details & Evidence
function makeEvidenceDialog(React) {
  return function EvidenceDialog(props) {
    var h = React.createElement
    var dlgRef = React.useRef(null)
    var item = props.item

    React.useEffect(function () {
      var el = dlgRef.current
      if (!el) return
      if (item) {
        if (!el.open && typeof el.showModal === 'function') {
          try { el.showModal() } catch (_e) {}
        }
      } else if (el.open && typeof el.close === 'function') {
        try { el.close() } catch (_e) {}
      }
    }, [item])

    function handleNativeClose() {
      if (props.onClose) props.onClose()
    }

    function handleDialogClick(e) {
      var el = dlgRef.current
      if (!el || !item) return
      // Fallback light-dismiss only where browser lacks HTMLDialogElement closedBy support
      if (typeof HTMLDialogElement !== 'undefined' && !('closedBy' in HTMLDialogElement.prototype)) {
        var rect = el.getBoundingClientRect()
        var inside = e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top && e.clientY <= rect.bottom
        if (!inside && props.onClose) props.onClose()
      }
    }

    var stages = ['1/4 攒下了', '2/4 讲过一轮', '3/4 能复述', '4/4 能接住追问']
    var currTier = item ? clampTier(item.masteryTier || 1) : 1
    var trackTitle = (item && item.trackTitle) || ''

    return h('dialog', {
      ref: dlgRef,
      id: 'ilp-skill-dialog',
      className: 'ilp-dialog',
      'data-testid': 'ilp-skill-dialog',
      closedby: 'any',
      'aria-labelledby': item ? 'ilp-dlg-heading' : undefined,
      onClose: handleNativeClose,
      onClick: handleDialogClick,
    },
      item ? h(React.Fragment, null,
        h('div', { className: 'ilp-dlg-head' },
          h('div', null,
            h('div', { className: 'ilp-eyebrow' },
              (trackTitle ? (trackTitle + ' · ') : '') + '经验手卡',
            ),
            h('h2', { id: 'ilp-dlg-heading', className: 'ilp-dlg-title', style: { marginTop: '3px' } }, item.title),
          ),
          h('button', {
            type: 'button',
            className: 'ilp-btn ghost sm',
            'data-testid': 'ilp-skill-dialog-x',
            onClick: function () { if (props.onClose) props.onClose() },
          }, '关闭'),
        ),
        h('div', { className: 'ilp-dlg-body' },
          h('div', { className: 'ilp-item-badges', style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' } },
            sourceTag(h, item.source),
            epistemicTag(h, item.epistemic),
            makeMasteryMeter(h, item.masteryTier),
          ),
          h('div', { className: 'ilp-stage-track' },
            stages.map(function (lbl, idx) {
              var n = idx + 1
              var cls = 'ilp-stage-node'
              if (n < currTier || (n === 4 && currTier >= 4)) cls += ' done'
              else if (n === currTier) cls += ' curr'
              return h('div', { key: String(n), className: cls }, lbl)
            }),
          ),
          (item.why || item.rejected) ? h('div', { className: 'ilp-compare-grid' },
            item.why ? h('div', { className: 'ilp-compare-card good' },
              h('div', { className: 'ilp-compare-k' }, '核心取舍'),
              item.why,
            ) : null,
            item.rejected ? h('div', { className: 'ilp-compare-card bad' },
              h('div', { className: 'ilp-compare-k' }, '被排除的坑'),
              item.rejected,
            ) : null,
          ) : null,
          item.probe ? h('div', { className: 'ilp-drawer-q' },
            h('span', { className: 'ilp-shield-k', style: { marginRight: '6px' } }, '顺手想一下'),
            item.probe,
          ) : null,
          item.evidenceSummary ? h('div', { className: 'ilp-drawer-fb' },
            h('div', { className: 'ilp-shield-k' }, '学习与过关记录'),
            h('p', null, item.evidenceSummary),
          ) : null,
        ),
        h('div', { className: 'ilp-dlg-foot' },
          h('div', { className: 'ilp-dlg-foot-main' },
            h('button', {
              type: 'button',
              className: 'ilp-btn solid sm',
              'data-testid': 'ilp-skill-dialog-drill',
              onClick: function () {
                var chosen = item
                if (props.onClose) props.onClose()
                if (props.onStartDrill) props.onStartDrill(chosen)
              },
            }, '去会话 1 对 1 闯关升级'),
            h('button', {
              type: 'button',
              className: 'ilp-btn ghost sm',
              'data-testid': 'ilp-skill-dialog-copy',
              onClick: function () {
                var summaryText = [item.title, item.why ? ('核心取舍：' + item.why) : '', item.rejected ? ('避开的坑：' + item.rejected) : ''].filter(Boolean).join('\n')
                if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
                  navigator.clipboard.writeText(summaryText).catch(function () {})
                }
                if (props.onCopied) props.onCopied(item.title)
              },
            }, '复制手卡摘要'),
          ),
          h('button', {
            type: 'button',
            className: 'ilp-btn line sm',
            'data-testid': 'ilp-skill-dialog-close',
            onClick: function () { if (props.onClose) props.onClose() },
          }, '完成收起'),
        ),
      ) : null,
    )
  }
}

// Native <dialog closedby="any"> Modal #2: 15-Minute Cross-Topic Sprint Action (replaces old separate Tab)
function makeSprintDialog(React) {
  return function SprintDialog(props) {
    var h = React.createElement
    var dlgRef = React.useRef(null)
    var open = !!(props && props.open)
    var stations = (props && Array.isArray(props.stations)) ? props.stations : []

    React.useEffect(function () {
      var el = dlgRef.current
      if (!el) return
      if (open && stations.length > 0) {
        if (!el.open && typeof el.showModal === 'function') {
          try { el.showModal() } catch (_e) {}
        }
      } else if (el.open && typeof el.close === 'function') {
        try { el.close() } catch (_e) {}
      }
    }, [open, stations.length])

    function handleNativeClose() {
      if (props.onClose) props.onClose()
    }

    function handleDialogClick(e) {
      var el = dlgRef.current
      if (!el || !open) return
      if (typeof HTMLDialogElement !== 'undefined' && !('closedBy' in HTMLDialogElement.prototype)) {
        var rect = el.getBoundingClientRect()
        var inside = e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top && e.clientY <= rect.bottom
        if (!inside && props.onClose) props.onClose()
      }
    }

    var totalMins = Math.max(5, stations.length * 5)

    return h('dialog', {
      ref: dlgRef,
      id: 'ilp-sprint-dialog',
      className: 'ilp-dialog',
      'data-testid': 'ilp-sprint-dialog',
      closedby: 'any',
      'aria-labelledby': open ? 'ilp-sprint-heading' : undefined,
      onClose: handleNativeClose,
      onClick: handleDialogClick,
    },
      open && stations.length > 0 ? h(React.Fragment, null,
        h('div', { className: 'ilp-dlg-head' },
          h('div', null,
            h('div', { className: 'ilp-eyebrow' }, '动作化串联复盘 · 不单占标签页'),
            h('h2', { id: 'ilp-sprint-heading', className: 'ilp-dlg-title', style: { marginTop: '3px' } },
              '连抽 ' + stations.length + ' 条考考我（约 ' + totalMins + ' 分钟）',
            ),
          ),
          h('button', {
            type: 'button',
            className: 'ilp-btn ghost sm',
            onClick: function () { if (props.onClose) props.onClose() },
          }, '关闭'),
        ),
        h('div', { className: 'ilp-dlg-body' },
          h('p', { style: { fontSize: '13px', color: 'var(--ilp-ink2)' } },
            '系统按你当前的未吃透手账，自动抽了下面 ' + stations.length + ' 条组成连续闯关：',
          ),
          stations.map(function (st, idx) {
            return h('div', { key: String(st.itemId || idx), className: 'ilp-station' },
              h('div', { className: 'ilp-station-num' }, String(st.station || (idx + 1))),
              h('div', { style: { minWidth: 0 } },
                h('div', { style: { fontSize: '13.5px', fontWeight: 600, color: 'var(--ilp-ink)', overflowWrap: 'anywhere' } }, st.title),
                h('div', { className: 'ilp-row-sub' }, (st.masteryLabel || '') + ' · ' + (st.focus || '盲测澄清关键取舍')),
              ),
              h('span', { className: 'ilp-eyebrow' }, '约 ' + (st.durationMin || 5) + ' 分钟'),
            )
          }),
        ),
        h('div', { className: 'ilp-dlg-foot' },
          h('button', {
            type: 'button',
            className: 'ilp-btn solid sm',
            'data-testid': 'ilp-sprint-start-btn',
            onClick: function () {
              var picked = stations.slice()
              if (props.onClose) props.onClose()
              if (props.onStartSprint) props.onStartSprint(picked)
            },
          }, '去新会话连考这几条 ->'),
          h('button', {
            type: 'button',
            className: 'ilp-btn line sm',
            'data-testid': 'ilp-sprint-close-btn',
            onClick: function () { if (props.onClose) props.onClose() },
          }, '先不考'),
        ),
      ) : null,
    )
  }
}

function openStarterChatSession(ctx) {
  var layout = getHostService(ctx, 'layout')
  if (layout && typeof layout.selectPanel === 'function') {
    try { layout.selectPanel(null) } catch (_e) {}
  }
  var uiWorkspace = getHostService(ctx, 'uiWorkspace')
  var sessions = getHostService(ctx, 'sessions')
  var conv = getHostService(ctx, 'conversation') || getHostService(ctx, 'conversations')
  var starterPrompt = '帮我检查一下当前项目的结构与改动方案，如果遇到值得留心的反直觉踩坑或架构设计取舍，干完顺手附一张顺带学习卡。'
  return postLearnAction('ensure_practice_workspace', {}).catch(function () { return null }).then(function (res) {
    var wsId = (res && res.workspace && res.workspace.workspaceId) || undefined
    if (uiWorkspace && typeof uiWorkspace.openWorkspace === 'function' && wsId) {
      uiWorkspace.openWorkspace(wsId, function (sessionId) {
        var binding = (sessions && typeof sessions.binding === 'function' && sessionId) ? sessions.binding(sessionId) : null
        if (binding && conv && conv.input && typeof conv.input.requestDraftInitialization === 'function') {
          conv.input.requestDraftInitialization(binding, { prompt: starterPrompt, whenDraftExists: 'preserve' })
        }
      })
      return
    }
    if (uiWorkspace && typeof uiWorkspace.startSession === 'function') {
      uiWorkspace.startSession(wsId, { prompt: starterPrompt, whenDraftExists: 'preserve' })
    }
  })
}

var SIM_OUTCOMES = {
  idle: {
    chatBadge: '放在那没点',
    chatBadgeClass: 'ilp-tag',
    collapsed: false,
    wbTitle: '顺带私教 · 一本手账',
    wbBadge: '手账顶部 +1 · 新抓到未看',
    wbBadgeClass: 'ilp-tag wait',
    wbHeading: '直接铺进手账顶部（少点一次直达）',
    wbLine1: '严选确认属于反直觉踩坑或架构权衡后，自动放到唯一手账最顶部，左琥珀条标为「新抓到 · 未看」',
    wbLine2: '单会话限频防刷屏；如果以后积压超 3 条，第 4 条起自动收进一行折叠条，绝不淹没已学技能',
    takeaway: '平时正忙着干活时完全不用管它：高价值经验直接落进同一本手账顶部，闲下来不用跨页搬家，原地就能测。',
  },
  coach: {
    chatBadge: '右侧边聊边测',
    chatBadgeClass: 'ilp-tag run',
    collapsed: false,
    wbTitle: '对话右侧学习栏',
    wbBadge: '原地升到 2/4 · 零打扰',
    wbBadgeClass: 'ilp-tag run',
    wbHeading: '在右边 1 分钟做道盲选题弄透',
    wbLine1: '只在右侧划开独立抽屉问一题，绝不覆写你底部正在打字的原生对话草稿',
    wbLine2: '答完自动标为「2/4 讲过一轮」，顺滑留在你的同一本手账里',
    takeaway: '手头刚好有空时点一下，直接在右侧抽屉 1 分钟摸底学透，不影响主对话流。',
  },
  save: {
    chatBadge: '已标优先留存',
    chatBadgeClass: 'ilp-tag run',
    collapsed: false,
    wbTitle: '顺带私教 · 一本手账',
    wbBadge: '计入 1/4 留存学习',
    wbBadgeClass: 'ilp-tag run',
    wbHeading: '直接转正进手账「学习中」优先列',
    wbLine1: '不再只是自动抓的「未看」，直接作为你明确要学的技能排进「今日优先吃透」候选',
    wbLine2: '随时点「10 秒快测」或进新会话 1 对 1 闯关升级到 4/4',
    takeaway: '眼下赶工没空细读、但一眼认定必须学会的经验，点一下直接标成自己要学的正式项。',
  },
  dismiss: {
    chatBadge: '已学会 · 折成窄条',
    chatBadgeClass: 'ilp-tag ok',
    collapsed: true,
    wbTitle: '顺带私教 · 一本手账',
    wbBadge: '写入防重抓名单',
    wbBadgeClass: 'ilp-tag ok',
    wbHeading: '从手账隐藏，以后同坑不再重复抓',
    wbLine1: '对话里的卡片立即折成一条细虚线，界面保持清清爽爽',
    wbLine2: 'cardKey 进入后台去重黑名单，后续对话也不会再反复提醒你早就熟的内容',
    takeaway: '早就驾轻就熟的东西点一下「已掌握」，当场收起，手账也不会越攒越乱。',
  },
}

function makeVisualGuideComponent(React) {
  return function VisualGuide(props) {
    var h = React.createElement
    var isEmpty = !!(props && props.isEmpty)
    var simTuple = React.useState('idle')
    var simMode = simTuple[0]
    var setSimMode = simTuple[1]
    var toolbarRef = React.useRef(null)
    var activeSim = SIM_OUTCOMES[simMode] || SIM_OUTCOMES.idle
    var supportsFocusGroup = typeof HTMLElement !== 'undefined' && ('focusGroup' in HTMLElement.prototype)

    React.useEffect(function () {
      var bar = toolbarRef.current
      if (!bar || typeof HTMLElement === 'undefined' || ('focusGroup' in HTMLElement.prototype)) return undefined
      function onKeyDown(e) {
        var btns = Array.prototype.slice.call(bar.querySelectorAll('button'))
        var idx = btns.indexOf(document.activeElement)
        if (idx === -1) return
        var next = idx
        if (e.key === 'ArrowRight') next = (idx + 1) % btns.length
        else if (e.key === 'ArrowLeft') next = (idx - 1 + btns.length) % btns.length
        else if (e.key === 'Home') next = 0
        else if (e.key === 'End') next = btns.length - 1
        else return
        e.preventDefault()
        for (var i = 0; i < btns.length; i += 1) {
          btns[i].tabIndex = i === next ? 0 : -1
        }
        btns[next].focus()
      }
      bar.addEventListener('keydown', onKeyDown)
      return function () { bar.removeEventListener('keydown', onKeyDown) }
    }, [])

    function makeSimToolbarButton(modeKey, label, extraClass) {
      var pressed = simMode === modeKey
      return h('button', {
        type: 'button',
        className: 'ilp-sim-btn' + (extraClass ? (' ' + extraClass) : ''),
        'data-testid': 'ilp-sim-btn-' + modeKey,
        'aria-pressed': pressed ? 'true' : 'false',
        tabIndex: supportsFocusGroup ? undefined : (pressed ? 0 : -1),
        onClick: function () { setSimMode(modeKey) },
      },
        h('svg', {
          className: 'ilp-sim-check',
          width: 11,
          height: 11,
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: '2.2',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
        }, h('path', { d: 'M3.5 8.5l3 3 6-7' })),
        h('span', null, label),
      )
    }

    function makeConnectorSvg(key) {
      return h('div', { key: key, className: 'ilp-step-connector ' + key, 'aria-hidden': 'true' },
        h('span', { className: 'ilp-conn-badge' },
          h('svg', {
            width: 13,
            height: 13,
            viewBox: '0 0 16 16',
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: '1.8',
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
          },
            h('path', { d: 'M3.5 8h9' }),
            h('path', { d: 'M9 4.5L12.5 8 9 11.5' }),
          ),
        ),
      )
    }

    return h('div', {
      className: 'ilp-guide-stack',
      'data-testid': 'ilp-visual-guide',
      'data-guide-mode': isEmpty ? 'empty' : 'accumulated',
    },
      // Tier 1: Open Editorial Hero
      h('section', { className: 'ilp-hero' },
        h('div', { className: 'ilp-hero-top' },
          h('span', { className: 'ilp-hero-kicker' }, isEmpty ? '刚装好 · 一眼看懂怎么用' : '工作原理图 · 看完可随时收起'),
          !isEmpty && props && props.onClose ? h('button', {
            type: 'button',
            className: 'ilp-btn ghost xs',
            'data-testid': 'ilp-close-guide-btn',
            onClick: props.onClose,
          }, '收起原理图') : null,
        ),
        h('h2', { className: 'ilp-hero-lead' }, '平时跟 Agent 协作干活，顺手攒下关键经验、10 秒测成自己的本事'),
        h('p', { className: 'ilp-hero-sub' }, '不用专门抽空上课，也不用跨页搬卡片；严选门禁只在「反直觉踩坑 / 架构权衡」时附卡，直接落进同一本手账。'),
        h('div', { className: 'ilp-onb-cta' },
          h('button', {
            type: 'button',
            className: isEmpty ? 'ilp-btn solid sm' : 'ilp-btn line sm',
            'data-testid': 'ilp-start-chat-cta',
            onClick: function () { if (props && props.onStartChat) props.onStartChat() },
          },
            h('svg', {
              width: 14,
              height: 14,
              viewBox: '0 0 16 16',
              fill: 'none',
              stroke: 'currentColor',
              strokeWidth: '1.8',
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
              'aria-hidden': 'true',
            }, h('path', { d: 'M3 13l1.2-3.6L11.4 2.2a1.4 1.4 0 0 1 2 2L6.2 11.4 3 13z' })),
            h('span', null, '去新会话派个活试试'),
          ),
          isEmpty ? h('button', {
            type: 'button',
            className: 'ilp-btn line sm',
            'data-testid': 'ilp-load-samples-btn',
            onClick: function () { if (props && props.onLoadSamples) props.onLoadSamples() },
          }, '看看日常攒卡与防刷屏效果（不耗 Token）') : null,
        ),
      ),

      // Tier 2: Connected 3-Step Visual Storyboard (01 -> 02 -> 03 with subgrid)
      h('div', { className: 'ilp-story-grid' },
        h('article', { className: 'ilp-onb-step ilp-step-col-1' },
          h('div', { className: 'ilp-scene', 'aria-hidden': 'true' },
            h('div', { className: 'ilp-wf-user' },
              h('span', { className: 'ilp-wf-u-pill' },
                h('span', { className: 'ilp-wf-dot-role' }, '你'),
                '帮修列表滚动卡顿',
              ),
              h('span', { className: 'ilp-wf-quiet' }, '普通杂活 0 打扰'),
            ),
            h('div', { className: 'ilp-wf-card' },
              h('div', { className: 'ilp-wf-card-head' },
                h('span', null, '顺带学习卡 · 严选'),
                h('svg', {
                  width: 11,
                  height: 11,
                  viewBox: '0 0 16 16',
                  fill: 'none',
                  stroke: 'currentColor',
                  strokeWidth: '1.7',
                  strokeLinecap: 'round',
                  strokeLinejoin: 'round',
                }, h('path', { d: 'M4 2.5h8a1 1 0 0 1 1 1v10.5l-5-3-5 3V3.5a1 1 0 0 1 1-1z' })),
              ),
              h('div', { className: 'ilp-wf-lines' },
                h('span', { className: 'ilp-wf-skel w82' }),
                h('span', { className: 'ilp-wf-skel w62' }),
              ),
              h('div', { className: 'ilp-wf-btn-row' },
                h('span', { className: 'ilp-wf-mini-btn' }, '边聊边测'),
                h('span', { className: 'ilp-wf-mini-btn' }, '存进手账'),
                h('span', { className: 'ilp-wf-mini-btn' }, '已掌握'),
              ),
            ),
          ),
          h('header', { className: 'ilp-step-head' },
            h('span', { className: 'ilp-onb-num' }, '01 · 严选不刷屏'),
            h('h3', { className: 'ilp-onb-step-h' }, '回答末尾附张小学习卡'),
          ),
          h('p', { className: 'ilp-onb-step-p' }, '只在遇到反直觉踩坑或跨项目取舍时附卡（单会话限频去重），日常改字查资料不打扰。'),
        ),

        makeConnectorSvg('ilp-conn-col-1'),

        h('article', { className: 'ilp-onb-step ilp-step-col-2' },
          h('div', { className: 'ilp-scene', 'aria-hidden': 'true' },
            h('div', { className: 'ilp-branch-diag' },
              h('div', { className: 'ilp-branch-in' },
                h('span', { className: 'ilp-branch-in-k' }, '看到小卡'),
                h('div', { className: 'ilp-branch-dots' },
                  h('span', null),
                  h('span', null),
                  h('span', null),
                ),
              ),
              h('svg', {
                className: 'ilp-branch-svg',
                width: 22,
                height: 76,
                viewBox: '0 0 22 76',
                fill: 'none',
              },
                h('path', { d: 'M0 38 C 9 38, 10 17, 20 17', stroke: 'var(--ilp-run)', strokeWidth: '1.5', strokeLinecap: 'round' }),
                h('path', { d: 'M16.5 13.8 L20.5 17 L16.5 20.2', stroke: 'var(--ilp-run)', strokeWidth: '1.4', strokeLinecap: 'round', strokeLinejoin: 'round' }),
                h('path', { d: 'M0 38 C 9 38, 10 59, 20 59', stroke: 'var(--ilp-wait)', strokeWidth: '1.6', strokeLinecap: 'round' }),
                h('path', { d: 'M16.5 55.8 L20.5 59 L16.5 62.2', stroke: 'var(--ilp-wait)', strokeWidth: '1.5', strokeLinecap: 'round', strokeLinejoin: 'round' }),
              ),
              h('div', { className: 'ilp-branch-outs' },
                h('div', { className: 'ilp-branch-pill' },
                  h('b', null, '有空顺手点'),
                  h('span', null, '右侧栏 1 分钟测透'),
                ),
                h('div', { className: 'ilp-branch-pill is-idle' },
                  h('b', null, '正忙先不管'),
                  h('span', null, '落入顶部 · 限铺 3'),
                ),
              ),
            ),
          ),
          h('header', { className: 'ilp-step-head' },
            h('span', { className: 'ilp-onb-num' }, '02 · 一本手账零搬运'),
            h('h3', { className: 'ilp-onb-step-h' }, '直接落进同一列表顶栏'),
          ),
          h('p', { className: 'ilp-onb-step-p' }, '不去第二个存档页来回倒腾；平时 1–3 张直接铺开少点一次，攒超 3 张自动折叠旧卡。'),
        ),

        makeConnectorSvg('ilp-conn-col-2'),

        h('article', { className: 'ilp-onb-step ilp-step-col-3' },
          h('div', { className: 'ilp-scene', 'aria-hidden': 'true' },
            h('div', { className: 'ilp-funnel-sources' },
              h('span', { className: 'ilp-source-badge is-local' },
                h('span', { className: 'ilp-source-dot' }),
                'DSH',
              ),
              h('span', { className: 'ilp-source-badge' }, 'Antigravity'),
              h('span', { className: 'ilp-source-badge' }, 'Codex'),
            ),
            h('svg', {
              className: 'ilp-funnel-svg',
              viewBox: '0 0 220 18',
              preserveAspectRatio: 'none',
              fill: 'none',
            },
              h('path', { d: 'M30 0 C30 10, 110 7, 110 15', stroke: 'currentColor', strokeWidth: '1.2' }),
              h('path', { d: 'M110 0 L110 15', stroke: 'currentColor', strokeWidth: '1.2' }),
              h('path', { d: 'M190 0 C190 10, 110 7, 110 15', stroke: 'currentColor', strokeWidth: '1.2' }),
              h('path', { d: 'M106 11 L110 16 L114 11', stroke: 'currentColor', strokeWidth: '1.3', strokeLinecap: 'round', strokeLinejoin: 'round' }),
            ),
            h('div', { className: 'ilp-delta-track' },
              h('div', { className: 'ilp-delta-node' },
                makeMasteryMeter(h, 0, '0/4 新抓到'),
              ),
              h('div', { className: 'ilp-delta-mid' },
                h('span', null, '10s 快测'),
                h('svg', {
                  width: 14,
                  height: 10,
                  viewBox: '0 0 14 10',
                  fill: 'none',
                  stroke: 'currentColor',
                  strokeWidth: '1.4',
                  strokeLinecap: 'round',
                  strokeLinejoin: 'round',
                },
                  h('path', { d: 'M1 5h11' }),
                  h('path', { d: 'M9 2l3 3-3 3' }),
                ),
              ),
              h('div', { className: 'ilp-delta-node' },
                makeMasteryMeter(h, 4, '4/4 已吃透'),
              ),
            ),
          ),
          h('header', { className: 'ilp-step-head' },
            h('span', { className: 'ilp-onb-num' }, '03 · 测过才算数'),
            h('h3', { className: 'ilp-onb-step-h' }, '10 秒快测或 1 对 1 闯关'),
          ),
          h('p', { className: 'ilp-onb-step-p' }, '行内答对盲选题原地升 2/4；彻底吃透要靠新会话换项目追问过关。'),
        ),
      ),

      // Tier 3: Default-Collapsed Native <details> + role="toolbar" focusgroup
      h('details', { className: 'ilp-sim-disclosure', 'data-testid': 'ilp-welcome-preview' },
        h('summary', { className: 'ilp-sim-summary', 'data-testid': 'ilp-sim-summary' },
          h('span', { className: 'ilp-sim-summary-left' },
            h('svg', {
              className: 'ilp-summary-chevron',
              width: 14,
              height: 14,
              viewBox: '0 0 16 16',
              fill: 'none',
              stroke: 'currentColor',
              strokeWidth: '1.8',
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
              'aria-hidden': 'true',
            }, h('path', { d: 'M6 3.5l4.5 4.5-4.5 4.5' })),
            h('span', null, '想先试试对话里那张小卡片点完会怎样？（点开体验）'),
          ),
          h('span', { className: 'ilp-tag' }, '点按实时预览'),
        ),
        h('div', { className: 'ilp-sim-body' },
          h('div', {
            ref: toolbarRef,
            className: 'ilp-sim-toolbar',
            role: 'toolbar',
            'aria-label': '学习卡按钮效果预览',
            'aria-controls': 'ilp-sim-outcome-stage',
            focusgroup: 'toolbar wrap',
          },
            h('div', { className: 'ilp-sim-group', role: 'group', 'aria-label': '学习卡操作按钮' },
              makeSimToolbarButton('coach', '右侧边聊边测', ''),
              makeSimToolbarButton('save', '标为优先学', ''),
              makeSimToolbarButton('dismiss', '已掌握，收起', ''),
            ),
            h('span', { role: 'separator', 'aria-orientation': 'vertical', className: 'ilp-sim-sep' }),
            makeSimToolbarButton('idle', '正忙先不管（默认）', 'is-idle'),
          ),
          h('div', {
            id: 'ilp-sim-outcome-stage',
            className: 'ilp-sim-stage',
            'data-testid': 'ilp-sim-outcome',
            'data-mode': simMode,
            'aria-live': 'polite',
          },
            h('div', { className: 'ilp-sim-mini-grid' },
              h('div', { className: 'ilp-mini-win' },
                h('div', { className: 'ilp-mini-win-bar' },
                  h('span', null, '对话窗口里会怎样'),
                  h('span', { className: activeSim.chatBadgeClass }, activeSim.chatBadge),
                ),
                h('div', { className: 'ilp-mini-win-body' },
                  h('div', { className: 'ilp-mini-prose' }, 'AI 回复：列表滚动卡顿已修好，关键补了一行容器约束。'),
                  h('div', { className: 'ilp-mini-embed', hidden: activeSim.collapsed },
                    h('span', { className: 'ilp-mini-embed-title' }, 'flex:1 与 min-height:0 怎么配合才不卡'),
                    h('div', { className: 'ilp-wf-lines' },
                      h('span', { className: 'ilp-wf-skel w82' }),
                      h('span', { className: 'ilp-wf-skel w62' }),
                    ),
                    h('div', { className: 'ilp-mini-embed-pills' },
                      h('span', { className: 'ilp-mini-pill' + (simMode === 'coach' ? ' is-hi' : '') }, '右侧边聊边测'),
                      h('span', { className: 'ilp-mini-pill' + (simMode === 'save' ? ' is-hi' : '') }, '标为优先学'),
                      h('span', { className: 'ilp-mini-pill' + (simMode === 'dismiss' ? ' is-hi' : '') }, '已掌握，收起'),
                    ),
                  ),
                  h('div', { className: 'ilp-mini-collapsed', hidden: !activeSim.collapsed },
                    h('span', null, '已掌握并收起：flex:1 与 min-height:0'),
                    h('span', null, '重新展开'),
                  ),
                ),
              ),
              h('div', { className: 'ilp-sim-arrow', 'aria-hidden': 'true' },
                h('svg', {
                  width: 16,
                  height: 16,
                  viewBox: '0 0 16 16',
                  fill: 'none',
                  stroke: 'currentColor',
                  strokeWidth: '1.6',
                  strokeLinecap: 'round',
                  strokeLinejoin: 'round',
                },
                  h('path', { d: 'M3 8h9' }),
                  h('path', { d: 'M9 4l4 4-4 4' }),
                ),
              ),
              h('div', { className: 'ilp-mini-win' },
                h('div', { className: 'ilp-mini-win-bar' },
                  h('span', null, activeSim.wbTitle),
                  h('span', { className: activeSim.wbBadgeClass }, activeSim.wbBadge),
                ),
                h('div', { className: 'ilp-mini-win-body' },
                  h('div', { className: 'ilp-mini-embed' },
                    h('span', { className: 'ilp-mini-embed-title' }, activeSim.wbHeading),
                    h('span', { style: { fontSize: '11.5px', color: 'var(--ilp-ink2)' } }, activeSim.wbLine1),
                    h('span', { style: { fontSize: '11px', color: 'var(--ilp-ink3)' } }, activeSim.wbLine2),
                  ),
                ),
              ),
            ),
            h('p', { className: 'ilp-sim-takeaway' }, activeSim.takeaway),
          ),
        ),
      ),
    )
  }
}

// 2. Main Workbench (`main`, key: 'incidental-learn') — Plan A Unified Single-Ledger Workbench
function makeWorkbenchComponent(React, ctx, bridge) {
  var EvidenceDialog = makeEvidenceDialog(React)
  var SprintDialog = makeSprintDialog(React)
  var VisualGuide = makeVisualGuideComponent(React)

  return function IncidentalLearnWorkbench() {
    var h = React.createElement
    var stateTuple = React.useState(bridge.getState())
    var bridgeState = stateTuple[0]
    var setBridgeState = stateTuple[1]

    var directTopicTuple = React.useState('')
    var directTopic = directTopicTuple[0]
    var setDirectTopic = directTopicTuple[1]

    var selectedWsTuple = React.useState('')
    var selectedWsId = selectedWsTuple[0]
    var setSelectedWsId = selectedWsTuple[1]

    var startingDirectTuple = React.useState(false)
    var startingDirect = startingDirectTuple[0]
    var setStartingDirect = startingDirectTuple[1]

    var statusFilterTuple = React.useState('all')
    var statusFilter = statusFilterTuple[0]
    var setStatusFilter = statusFilterTuple[1]

    var trackFilterTuple = React.useState('all')
    var trackFilter = trackFilterTuple[0]
    var setTrackFilter = trackFilterTuple[1]

    var olderOpenTuple = React.useState(false)
    var olderUnreadOpen = olderOpenTuple[0]
    var setOlderUnreadOpen = olderOpenTuple[1]

    var expandedQuizTuple = React.useState(null)
    var expandedQuizId = expandedQuizTuple[0]
    var setExpandedQuizId = expandedQuizTuple[1]

    var quizAnsTuple = React.useState({})
    var quizAnswers = quizAnsTuple[0]
    var setQuizAnswers = quizAnsTuple[1]

    var sprintOpenTuple = React.useState(false)
    var sprintOpen = sprintOpenTuple[0]
    var setSprintOpen = sprintOpenTuple[1]

    var sprintStationsTuple = React.useState([])
    var sprintStations = sprintStationsTuple[0]
    var setSprintStations = sprintStationsTuple[1]

    var modalItemTuple = React.useState(null)
    var modalItem = modalItemTuple[0]
    var setModalItem = modalItemTuple[1]

    var toastTuple = React.useState(null)
    var toast = toastTuple[0]
    var setToast = toastTuple[1]

    var exportTextTuple = React.useState(null)
    var exportInfo = exportTextTuple[0]
    var setExportInfo = exportTextTuple[1]

    var previewSamplesTuple = React.useState(false)
    var isPreviewSamples = previewSamplesTuple[0]
    var setIsPreviewSamples = previewSamplesTuple[1]

    var guideOpenTuple = React.useState(false)
    var guideOpen = guideOpenTuple[0]
    var setGuideOpen = guideOpenTuple[1]

    var intentInputRef = React.useRef(null)

    React.useEffect(function () {
      ensureStyleInjected()
      var off = bridge.subscribe(function (next) { setBridgeState(next) })
      bridge.refresh(true).catch(function () {})
      var timer = setInterval(function () {
        bridge.refresh(false).catch(function () {})
      }, 15000)
      return function () {
        off()
        clearInterval(timer)
      }
    }, [])

    function showToast(text, canUndo) {
      setToast({ text: text, canUndo: !!canUndo })
    }

    var workspaces = Array.isArray(bridgeState.workspaces) ? bridgeState.workspaces : []
    var effectiveWsId = selectedWsId || (workspaces[0] && workspaces[0].id) || undefined

    var DIRECT_TOPICS = [
      '复盘刚才改过的关键取舍',
      'CSS 容器查询与 Flex 避坑',
      '接口边界与并发写盘',
      'Agent 提示词省流',
    ]

    function handleStartDirectStudy(e) {
      if (e && e.preventDefault) e.preventDefault()
      if (startingDirect) return
      var topicTitle = directTopic.trim() || '结合当前工作区最近一次关键改动，挑一个核心取舍带我专心闯关'
      setStartingDirect(true)
      bridge.runAction('save_explicit', {
        payload: {
          title: topicTitle,
          trackId: inferTrackIdFromTopic(topicTitle),
          source: 'manual',
          epistemic: 'explicit',
          why: '由顺带私教工作台主动发起专心学习，通过一问一答闯关沉淀证据。',
        },
      }).then(function (res) {
        var item = (res && res.item) || { title: topicTitle }
        setDirectTopic('')
        return openDeepLearnSession(ctx, item, effectiveWsId)
      }).then(function () {
        setStartingDirect(false)
      }).catch(function (err) {
        setStartingDirect(false)
        showToast('开启专心学习失败：' + err.message, false)
      })
    }

    function handleDrillRow(row) {
      if (!row) return
      if (row.kind === 'unread') {
        bridge.runAction('triage_item', { id: row.id, decision: 'accept' }).then(function (res) {
          var item = (res && res.item) || row.raw
          return openDeepLearnSession(ctx, item, effectiveWsId)
        }).catch(function (err) {
          showToast('开启专心学习失败：' + err.message, false)
        })
        return
      }
      openDeepLearnSession(ctx, row.raw, effectiveWsId).catch(function (err) {
        showToast('打开闯关会话失败：' + err.message, false)
      })
    }

    function handleLoadSamples() {
      bridge.runAction('load_sample_pack', {}).then(function () {
        setIsPreviewSamples(true)
        setGuideOpen(false)
        setStatusFilter('all')
        setTrackFilter('all')
        setOlderUnreadOpen(false)
        setExpandedQuizId(null)
        showToast('已载入多 Agent 演示样本（含 6 条未看防刷屏示范）', true)
      }).catch(function (err) {
        showToast('加载失败：' + err.message, false)
      })
    }

    function handleResetEmpty() {
      bridge.runAction('reset_empty', {}).then(function () {
        setIsPreviewSamples(false)
        setGuideOpen(false)
        setSprintOpen(false)
        setExportInfo(null)
        setOlderUnreadOpen(false)
        setExpandedQuizId(null)
        setQuizAnswers({})
        setStatusFilter('all')
        setTrackFilter('all')
        setDirectTopic('')
        showToast('已清空恢复空台账', true)
      }).catch(function () {})
    }

    function handleDeleteUnread(row) {
      if (!row) return
      bridge.runAction('triage_item', { id: row.id, decision: 'skip' }).then(function (res) {
        if (expandedQuizId === row.id) setExpandedQuizId(null)
        showToast('已从手账删掉该条', !!(res && res.snapshot && res.snapshot.canUndo))
      }).catch(function (err) {
        showToast('删除失败：' + err.message, false)
      })
    }

    function handleClearAllUnread() {
      bridge.runAction('triage_batch', { mode: 'clear_all' }).then(function (res) {
        var count = (res && res.affected) || 0
        setStatusFilter('all')
        setOlderUnreadOpen(false)
        setExpandedQuizId(null)
        showToast('已清掉 ' + count + ' 条未看', true)
      }).catch(function (err) {
        showToast('清理失败：' + err.message, false)
      })
    }

    function handleClearOlderUnread() {
      bridge.runAction('triage_batch', { mode: 'clear_older', keep: MAX_DIRECT_UNREAD }).then(function (res) {
        var count = (res && res.affected) || 0
        setOlderUnreadOpen(false)
        showToast('已清掉 ' + count + ' 条较早未看，保留最新 ' + MAX_DIRECT_UNREAD + ' 条', true)
      }).catch(function (err) {
        showToast('清理失败：' + err.message, false)
      })
    }

    function handleUpgradeInlineQuiz(row, ans) {
      if (!row || !ans) return
      var note = '在手账行内 10 秒快测选出 ' + ans.key + '：' + (ans.fb || row.why || '已拆清核心取舍与避开的坑。')
      bridge.runAction('record_micro_drill', {
        candId: row.id,
        card: row.raw,
        correct: !!ans.ok,
        toTier: 2,
        selectedKey: ans.key,
        evidenceNote: note,
      }).then(function (res) {
        setExpandedQuizId(null)
        setQuizAnswers(function (prev) {
          var next = Object.assign({}, prev)
          delete next[row.id]
          return next
        })
        showToast('已原地记为 2/4 讲过一轮，零搬运', !!(res && res.snapshot && res.snapshot.canUndo))
      }).catch(function (err) {
        showToast('升级记录失败：' + err.message, false)
      })
    }

    function handleOpenSprintModal() {
      bridge.runAction('build_course', {}).then(function (res) {
        var course = res && res.course
        var stations = (course && Array.isArray(course.stations) && course.stations.length > 0)
          ? course.stations
          : []
        setSprintStations(stations)
        setSprintOpen(true)
      }).catch(function (err) {
        showToast('连抽生成失败：' + err.message, false)
      })
    }

    function handleExportNotes() {
      bridge.runAction('export_markdown', {}).then(function (res) {
        setExportInfo(res && res.exported ? res.exported : null)
        if (res && res.exported && res.exported.fileName) {
          showToast('已导出笔记：' + res.exported.fileName, false)
        }
      }).catch(function (err) {
        showToast('导出失败：' + err.message, false)
      })
    }

    function handleUndo() {
      bridge.runAction('undo_last', {}).then(function (res) {
        if (res && res.undone) {
          showToast('已撤销：' + (res.label || '上一步操作'), !!(res.snapshot && res.snapshot.canUndo))
        } else {
          setToast(null)
        }
      }).catch(function (err) {
        showToast('撤销失败：' + err.message, false)
      })
    }

    var snap = bridgeState.snapshot
    if (!snap) {
      return h('div', { className: 'ilp-wb' },
        h('div', { className: 'ilp-wb-inner' },
          h('div', { className: 'ilp-eyebrow' }, '平时协作攒经验 · 一本手账零搬运'),
          h('h1', { className: 'ilp-h1' }, '顺带私教'),
          bridgeState.error
            ? h('div', { className: 'ilp-empty-card' },
                h('p', null, '读取个人技能手账失败：' + bridgeState.error),
                h('button', {
                  type: 'button',
                  className: 'ilp-btn line sm',
                  onClick: function () { bridge.refresh(true).catch(function () {}) },
                }, '重试'),
              )
            : h('p', { className: 'ilp-summary' }, '正在同步本地记录…'),
        ),
      )
    }

    var tracks = Array.isArray(snap.tracks) ? snap.tracks : DEFAULT_TRACKS
    var triage = Array.isArray(snap.triage) ? snap.triage : []
    var items = Array.isArray(snap.items) ? snap.items : []

    var unreadRows = triage.map(function (c) {
      var trackObj = tracks.find(function (t) { return t.id === c.trackId })
      var srcMeta = SOURCE_META[normalizeSource(c.source)] || SOURCE_META.manual
      var safeQuiz = c.quiz || sanitizeQuizBlock(null, c.title, c.why, c.rejected, c.probe)
      return {
        id: c.id,
        kind: 'unread',
        raw: c,
        trackId: c.trackId,
        trackTitle: trackObj ? trackObj.title : '',
        source: c.source,
        epistemic: c.epistemic || 'inferred',
        sourceLabel: srcMeta.label + ' · 严选接住',
        masteryTier: 0,
        masteryLabel: '0/4 新抓到 · 未看',
        title: c.title,
        why: c.why,
        rejected: c.rejected,
        probe: c.probe,
        evidenceSummary: '对话中踩坑或做取舍时自动记下，等待 10 秒快测或 1 对 1 闯关。',
        quiz: safeQuiz,
      }
    })

    var savedRows = items.map(function (it) {
      var tier = clampTier(it.masteryTier || 1)
      var trackObj = tracks.find(function (t) { return t.id === it.trackId })
      var srcMeta = SOURCE_META[normalizeSource(it.source)] || SOURCE_META.manual
      var epMeta = EPISTEMIC_META[normalizeEpistemic(it.epistemic)] || EPISTEMIC_META.explicit
      return {
        id: it.id,
        kind: 'saved',
        raw: it,
        trackId: it.trackId,
        trackTitle: trackObj ? trackObj.title : '',
        source: it.source,
        epistemic: it.epistemic || 'explicit',
        sourceLabel: srcMeta.label + ' · ' + epMeta.label,
        masteryTier: tier,
        masteryLabel: MASTERY_LABELS[tier] || MASTERY_LABELS[1],
        title: it.title,
        why: it.why,
        rejected: it.rejected,
        probe: it.probe,
        evidenceSummary: it.evidenceSummary,
        quiz: it.quiz,
      }
    })

    var allRows = unreadRows.concat(savedRows)
    var learningRows = savedRows.filter(function (r) { return r.masteryTier >= 1 && r.masteryTier < 4 })
    var masteredRows = savedRows.filter(function (r) { return r.masteryTier >= 4 })
    var sprintPool = (snap.sprint15m && Array.isArray(snap.sprint15m.stations)) ? snap.sprint15m.stations : []
    var isCompletelyEmpty = allRows.length === 0

    var activeStatus = statusFilter
    if (activeStatus === 'unread' && unreadRows.length === 0) activeStatus = 'all'
    if (activeStatus === 'learning' && learningRows.length === 0) activeStatus = 'all'
    if (activeStatus === 'mastered' && masteredRows.length === 0) activeStatus = 'all'

    var populatedTrackMeta = tracks.map(function (t) {
      return {
        id: t.id,
        title: t.title,
        count: allRows.filter(function (r) { return r.trackId === t.id }).length,
      }
    }).filter(function (t) { return t.count > 0 })

    var activeTrack = (trackFilter !== 'all' && populatedTrackMeta.some(function (t) { return t.id === trackFilter }))
      ? trackFilter
      : 'all'

    var filteredRows = allRows.filter(function (r) {
      if (activeStatus === 'unread' && r.masteryTier !== 0) return false
      if (activeStatus === 'learning' && !(r.masteryTier >= 1 && r.masteryTier < 4)) return false
      if (activeStatus === 'mastered' && r.masteryTier < 4) return false
      if (activeTrack !== 'all' && r.trackId !== activeTrack) return false
      return true
    })

    var spotlight = (snap.spotlight && learningRows.length > 0)
      ? (learningRows.find(function (r) { return r.id === snap.spotlight.id }) || learningRows[0])
      : null

    var statText = isCompletelyEmpty
      ? '手账 0 条 · 随时从下面发起 1 对 1 学习或先看三步原理图'
      : ('共 ' + allRows.length + ' 条（' + masteredRows.length + ' 已吃透 · ' + unreadRows.length + ' 条新抓到未看）')

    function renderRowMarkup(row) {
      var isUnread = row.kind === 'unread'
      var isExp = expandedQuizId === row.id
      var ans = quizAnswers[row.id] || null
      var metaLine = [row.trackTitle, row.sourceLabel].filter(Boolean).join(' · ')

      return h('div', { key: row.id, className: 'ilp-row-wrap', 'data-testid': 'ilp-row-wrap-' + row.id },
        h('div', {
          className: 'ilp-row' + (isUnread ? ' is-unread' : ''),
          'data-testid': 'ilp-row-' + row.id,
          'data-row-kind': row.kind,
        },
          h('div', { className: 'ilp-meter-col' },
            makeMasteryMeter(h, row.masteryTier, row.masteryLabel),
          ),
          h('div', { className: 'ilp-row-body' },
            h('button', {
              type: 'button',
              className: 'ilp-row-title-btn',
              'data-testid': 'ilp-row-title-' + row.id,
              onClick: function () { setModalItem(row) },
            }, row.title),
            row.why ? h('div', { className: 'ilp-row-summary' }, row.why) : null,
            metaLine ? h('div', { className: 'ilp-row-sub' }, metaLine) : null,
          ),
          h('div', { className: 'ilp-row-acts' },
            isUnread ? h(React.Fragment, null,
              h('button', {
                type: 'button',
                className: 'ilp-btn line sm',
                'data-testid': 'ilp-row-quiz-btn-' + row.id,
                'aria-expanded': isExp ? 'true' : 'false',
                onClick: function () { setExpandedQuizId(isExp ? null : row.id) },
              }, isExp ? '收起快测' : '10 秒快测'),
              h('button', {
                type: 'button',
                className: 'ilp-btn ghost sm',
                'data-testid': 'ilp-row-drill-' + row.id,
                onClick: function () { handleDrillRow(row) },
              }, '去闯关'),
              h('button', {
                type: 'button',
                className: 'ilp-btn ghost sm danger-text',
                'data-testid': 'ilp-row-del-' + row.id,
                onClick: function () { handleDeleteUnread(row) },
              }, '删掉'),
            ) : h(React.Fragment, null,
              h('button', {
                type: 'button',
                className: 'ilp-btn line sm',
                'data-testid': 'ilp-row-card-' + row.id,
                onClick: function () { setModalItem(row) },
              }, '看手卡'),
              h('button', {
                type: 'button',
                className: 'ilp-btn ghost sm',
                'data-testid': 'ilp-row-drill-' + row.id,
                onClick: function () { handleDrillRow(row) },
              }, row.masteryTier >= 4 ? '换景复测' : '去闯关'),
            ),
          ),
        ),
        isUnread && isExp ? h('div', { className: 'ilp-inline-quiz', 'data-testid': 'ilp-inline-quiz-' + row.id },
          h('div', { className: 'ilp-compare-grid' },
            h('div', { className: 'ilp-compare-card good' },
              h('div', { className: 'ilp-compare-k' }, '核心取舍'),
              row.why || '已基于当前项目约束选择更稳妥方案。',
            ),
            h('div', { className: 'ilp-compare-card bad' },
              h('div', { className: 'ilp-compare-k' }, '避开的坑'),
              row.rejected || '已排除脆弱或高维护成本备选方案。',
            ),
          ),
          h('div', { className: 'ilp-quiz-q' }, row.quiz.question),
          h('div', { className: 'ilp-quiz-opts' },
            row.quiz.options.map(function (opt) {
              var cls = 'ilp-quiz-opt'
              if (ans && ans.key === opt.key) cls += opt.correct ? ' is-correct' : ' is-wrong'
              return h('button', {
                key: opt.key,
                type: 'button',
                className: cls,
                'data-testid': 'ilp-inline-opt-' + row.id + '-' + opt.key,
                onClick: function () {
                  var fb = opt.feedback || (opt.correct ? ('答对了：' + (row.why || '')) : ('再核对一下核心依据：' + (row.why || '')))
                  setQuizAnswers(function (prev) {
                    var next = Object.assign({}, prev)
                    next[row.id] = { key: opt.key, ok: !!opt.correct, fb: fb }
                    return next
                  })
                },
              },
                h('span', { className: 'ilp-opt-key' }, opt.key),
                h('span', { className: 'ilp-opt-body' }, opt.label),
              )
            }),
          ),
          ans ? h('div', { className: 'ilp-quiz-fb', 'data-testid': 'ilp-inline-fb-' + row.id },
            h('span', { style: { flex: '1 1 200px' } }, ans.fb),
            h('button', {
              type: 'button',
              className: 'ilp-btn solid sm',
              'data-testid': 'ilp-inline-upgrade-' + row.id,
              onClick: function () { handleUpgradeInlineQuiz(row, ans) },
            }, '原地记为 2/4 讲过一轮'),
          ) : null,
        ) : null,
      )
    }

    function renderOverflowBar(extraCount) {
      return h('div', { className: 'ilp-overflow-bar', 'data-testid': 'ilp-overflow-bar' },
        h('div', { className: 'ilp-overflow-msg' },
          h('span', { className: 'ilp-amber-dot', 'aria-hidden': 'true' }),
          h('span', null,
            '还有 ',
            h('strong', null, String(extraCount) + ' 条'),
            ' 更早顺手抓到的未看（已自动收起，避免把下方已学技能挤出首屏）',
          ),
        ),
        h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
          h('button', {
            type: 'button',
            className: 'ilp-btn line sm',
            'data-testid': 'ilp-toggle-older-unread',
            'aria-expanded': olderUnreadOpen ? 'true' : 'false',
            onClick: function () { setOlderUnreadOpen(function (v) { return !v }) },
          }, olderUnreadOpen ? ('收起较早的 ' + extraCount + ' 条未看') : ('展开其余 ' + extraCount + ' 条')),
          h('button', {
            type: 'button',
            className: 'ilp-btn ghost sm danger-text',
            'data-testid': 'ilp-clear-older-unread',
            onClick: handleClearOlderUnread,
          }, '清掉这 ' + extraCount + ' 条旧未看'),
        ),
      )
    }

    function renderDirectStudyBox() {
      return h('form', {
        className: 'ilp-intent-box',
        'data-testid': 'ilp-direct-study',
        onSubmit: handleStartDirectStudy,
      },
        h('div', { className: 'ilp-intent-top' },
          h('span', { className: 'ilp-intent-label' }, '直接开启 1 对 1 专心学习'),
          h('span', { className: 'ilp-intent-hint' }, '不必挑卡片，第 1 轮先出 1 道盲选题摸底'),
        ),
        h('div', { className: 'ilp-intent-main' },
          h('input', {
            ref: intentInputRef,
            type: 'text',
            className: 'ilp-intent-input',
            'data-testid': 'ilp-direct-topic-input',
            'aria-label': '输入想专心学习的主题',
            placeholder: '想顺手弄懂什么？填个问题或点下方主题…',
            value: directTopic,
            onChange: function (e) { setDirectTopic(e.target.value) },
          }),
          h('div', { className: 'ilp-intent-controls' },
            workspaces.length > 0 ? h('select', {
              className: 'ilp-ws-pill',
              'data-testid': 'ilp-direct-ws-select',
              'aria-label': '选择学习关联的工作区',
              value: effectiveWsId || '',
              onChange: function (e) { setSelectedWsId(e.target.value) },
            },
              workspaces.map(function (ws) {
                return h('option', { key: ws.id, value: ws.id }, ws.name || ws.id)
              }),
            ) : null,
            h('button', {
              type: 'submit',
              className: 'ilp-btn solid',
              'data-testid': 'ilp-direct-start-btn',
              disabled: startingDirect,
            }, startingDirect ? '正在开启…' : '开启专心闯关 ->'),
          ),
        ),
        h('div', { className: 'ilp-chip-row' },
          DIRECT_TOPICS.map(function (chip, idx) {
            return h('button', {
              key: String(idx),
              type: 'button',
              className: 'ilp-chip',
              'data-testid': 'ilp-direct-chip-' + idx,
              onClick: function () {
                setDirectTopic(chip)
                if (intentInputRef.current && typeof intentInputRef.current.focus === 'function') {
                  intentInputRef.current.focus()
                }
              },
            }, chip)
          }),
        ),
      )
    }

    var sheetChildren = []
    if (activeStatus === 'all') {
      var unreadFiltered = filteredRows.filter(function (r) { return r.kind === 'unread' })
      var savedFiltered = filteredRows.filter(function (r) { return r.kind === 'saved' })
      if (unreadFiltered.length > MAX_DIRECT_UNREAD) {
        unreadFiltered.slice(0, MAX_DIRECT_UNREAD).forEach(function (r) { sheetChildren.push(renderRowMarkup(r)) })
        var extraUnread = unreadFiltered.slice(MAX_DIRECT_UNREAD)
        if (olderUnreadOpen) {
          extraUnread.forEach(function (r) { sheetChildren.push(renderRowMarkup(r)) })
        }
        sheetChildren.push(renderOverflowBar(extraUnread.length))
      } else {
        unreadFiltered.forEach(function (r) { sheetChildren.push(renderRowMarkup(r)) })
      }
      savedFiltered.forEach(function (r) { sheetChildren.push(renderRowMarkup(r)) })
    } else {
      filteredRows.forEach(function (r) { sheetChildren.push(renderRowMarkup(r)) })
    }

    return h('div', { className: 'ilp-wb', 'data-testid': 'ilp-workbench' },
      h('div', { className: 'ilp-wb-inner' },
        // Calm Header
        h('header', { className: 'ilp-header' },
          h('div', { className: 'ilp-toprow' },
            h('span', { className: 'ilp-eyebrow' }, '平时协作攒经验 · 一本手账零搬运'),
            h('div', { className: 'ilp-header-acts' },
              savedRows.length > 0 ? h('button', {
                type: 'button',
                className: 'ilp-btn ghost sm',
                'data-testid': 'ilp-export-notes-btn',
                onClick: handleExportNotes,
              }, '导出学习笔记') : null,
              !isCompletelyEmpty ? h('button', {
                type: 'button',
                className: 'ilp-btn ghost sm',
                'data-testid': 'ilp-reset-empty-btn',
                onClick: handleResetEmpty,
              }, '清空') : null,
            ),
          ),
          h('div', { className: 'ilp-title-row' },
            h('h1', { className: 'ilp-h1' }, '顺带私教'),
            h('span', { className: 'ilp-summary', 'data-testid': 'ilp-summary-line' }, statText),
            !isCompletelyEmpty ? h('button', {
              type: 'button',
              className: guideOpen ? 'ilp-btn line xs' : 'ilp-btn soft xs',
              'data-testid': 'ilp-toggle-guide-btn',
              'aria-expanded': guideOpen ? 'true' : 'false',
              onClick: function () { setGuideOpen(function (v) { return !v }) },
            }, guideOpen ? '收起原理图' : '工作原理图') : null,
          ),
        ),

        isPreviewSamples && allRows.length > 0 ? h('div', { className: 'ilp-preview-banner', 'data-testid': 'ilp-preview-banner' },
          h('span', null, '当前展示的是示例效果（不耗 Token）。看完可随时恢复初始空页面，再在平时对话里慢慢攒自己的手账。'),
          h('button', {
            type: 'button',
            className: 'ilp-btn line xs',
            'data-testid': 'ilp-clear-preview-btn',
            onClick: handleResetEmpty,
          }, '恢复初始空页面'),
        ) : null,

        // Unified Top 1-on-1 Study Intent Box (never blocked by unread cards)
        renderDirectStudyBox(),

        // Visual Onboarding / On-Demand Principle Diagram
        (isCompletelyEmpty || guideOpen)
          ? (isCompletelyEmpty
              ? h('div', { 'data-testid': 'ilp-empty-onboarding' },
                  h(VisualGuide, {
                    isEmpty: true,
                    onStartChat: function () {
                      openStarterChatSession(ctx).catch(function (err) {
                        showToast('打开会话失败：' + err.message, false)
                      })
                    },
                    onLoadSamples: handleLoadSamples,
                  }),
                )
              : h(VisualGuide, {
                  isEmpty: false,
                  onStartChat: function () {
                    openStarterChatSession(ctx).catch(function (err) {
                      showToast('打开会话失败：' + err.message, false)
                    })
                  },
                  onClose: function () { setGuideOpen(false) },
                }))
          : null,

        // Plan A Unique Spotlight Card (when learning items exist under 'all' view)
        (allRows.length > 0 && spotlight && activeStatus === 'all' && activeTrack === 'all')
          ? h('section', { className: 'ilp-spotlight', 'data-testid': 'ilp-spotlight' },
              h('div', { style: { minWidth: 0 } },
                h('div', { className: 'ilp-spot-meta' },
                  h('span', null, '今日优先吃透'),
                  h('span', null, '·'),
                  makeMasteryMeter(h, spotlight.masteryTier, spotlight.masteryLabel),
                ),
                h('h2', { className: 'ilp-spot-title' }, spotlight.title),
                spotlight.why ? h('p', { className: 'ilp-spot-why' }, spotlight.why) : null,
              ),
              h('div', { className: 'ilp-spot-acts' },
                h('button', {
                  type: 'button',
                  className: 'ilp-btn solid sm',
                  'data-testid': 'ilp-start-deep-learn',
                  onClick: function () { handleDrillRow(spotlight) },
                }, '3 分钟闯关升级'),
                h('button', {
                  type: 'button',
                  className: 'ilp-btn line sm',
                  'data-testid': 'ilp-open-evidence-modal',
                  onClick: function () { setModalItem(spotlight) },
                }, '看经验手卡'),
              ),
            )
          : null,

        // Plan A Toolbar (Filter Pills + Action Triggers, NO parallel tabs)
        allRows.length > 0 ? h('div', { className: 'ilp-toolbar', 'data-testid': 'ilp-toolbar' },
          h('div', { className: 'ilp-filter-row', role: 'group', 'aria-label': '按状态筛选' },
            h('button', {
              type: 'button',
              className: 'ilp-filter-pill',
              'data-testid': 'ilp-filter-all',
              'aria-pressed': activeStatus === 'all' ? 'true' : 'false',
              onClick: function () { setStatusFilter('all') },
            }, '全部 · ' + allRows.length),
            unreadRows.length > 0 ? h('button', {
              type: 'button',
              className: 'ilp-filter-pill',
              'data-testid': 'ilp-filter-unread',
              'aria-pressed': activeStatus === 'unread' ? 'true' : 'false',
              onClick: function () { setStatusFilter('unread') },
            },
              h('span', { className: 'ilp-amber-dot', 'aria-hidden': 'true' }),
              '新抓到未看 · ' + unreadRows.length,
            ) : null,
            learningRows.length > 0 ? h('button', {
              type: 'button',
              className: 'ilp-filter-pill',
              'data-testid': 'ilp-filter-learning',
              'aria-pressed': activeStatus === 'learning' ? 'true' : 'false',
              onClick: function () { setStatusFilter('learning') },
            }, '学习中 · ' + learningRows.length) : null,
            masteredRows.length > 0 ? h('button', {
              type: 'button',
              className: 'ilp-filter-pill',
              'data-testid': 'ilp-filter-mastered',
              'aria-pressed': activeStatus === 'mastered' ? 'true' : 'false',
              onClick: function () { setStatusFilter('mastered') },
            }, '已吃透 · ' + masteredRows.length) : null,
          ),
          h('div', { className: 'ilp-toolbar-acts' },
            unreadRows.length > 0 ? h('button', {
              type: 'button',
              className: 'ilp-btn ghost sm danger-text',
              'data-testid': 'ilp-triage-clear-all',
              onClick: handleClearAllUnread,
            }, '清掉全部未看 (' + unreadRows.length + ')') : null,
            sprintPool.length >= 2 ? h('button', {
              type: 'button',
              className: 'ilp-btn indigo-line sm',
              'data-testid': 'ilp-sprint-open-btn',
              onClick: handleOpenSprintModal,
            }, '连抽 ' + sprintPool.length + ' 条考考我 · 15m') : null,
          ),
        ) : null,

        // Optional Export Receipt Box
        exportInfo ? h('section', { className: 'ilp-course-box', 'data-testid': 'ilp-export-box' },
          h('div', { className: 'ilp-toprow' },
            h('span', { style: { fontWeight: 600 } }, '已生成 Markdown 学习笔记：' + exportInfo.fileName),
            h('button', {
              type: 'button',
              className: 'ilp-btn ghost xs',
              onClick: function () { setExportInfo(null) },
            }, '收起'),
          ),
          h('pre', { className: 'ilp-code-pre', style: { maxHeight: '160px', overflowY: 'auto' } }, exportInfo.markdown),
        ) : null,

        // Unified Single Ledger Sheet (Unread at Top + >3 Overflow Fold + Saved Items Below; ZERO 0/0 empty shells!)
        allRows.length > 0 ? h('section', { className: 'ilp-sheet', 'data-testid': 'ilp-sheet', 'aria-label': '一本手账列表' },
          h('div', { className: 'ilp-sheet-head' },
            h('span', { className: 'ilp-sheet-title' }, '一本手账（AI 严选抓回的排最上；平时直铺，超 ' + MAX_DIRECT_UNREAD + ' 条自动折叠旧未看）'),
            h('span', { className: 'ilp-guard-pill' }, '严选门禁：单会话限频 · 未看封顶 ' + MAX_AUTO_TRIAGE + ' 条'),
          ),
          populatedTrackMeta.length >= 2 ? h('div', { className: 'ilp-track-pills', role: 'group', 'aria-label': '按能力分类筛选' },
            h('button', {
              type: 'button',
              className: 'ilp-track-pill',
              'data-testid': 'ilp-track-pill-all',
              'aria-pressed': activeTrack === 'all' ? 'true' : 'false',
              onClick: function () { setTrackFilter('all') },
            }, '全部分类'),
            populatedTrackMeta.map(function (tr) {
              return h('button', {
                key: tr.id,
                type: 'button',
                className: 'ilp-track-pill',
                'data-testid': 'ilp-track-pill-' + tr.id,
                'aria-pressed': activeTrack === tr.id ? 'true' : 'false',
                onClick: function () { setTrackFilter(tr.id) },
              }, tr.title + ' (' + tr.count + ')')
            }),
          ) : null,
          sheetChildren.length > 0
            ? sheetChildren
            : h('div', { className: 'ilp-empty-sheet' }, '当前筛选条件下暂无条目。'),
        ) : null,

        // Compact Non-Wrapping Undo Toast
        toast ? h('div', { className: 'ilp-toast', role: 'status', 'aria-live': 'polite', 'data-testid': 'ilp-toast' },
          h('span', { className: 'ilp-toast-dot', 'aria-hidden': 'true' }),
          h('span', { className: 'ilp-toast-text' }, toast.text),
          toast.canUndo ? h('button', {
            type: 'button',
            'data-testid': 'ilp-toast-undo',
            onClick: handleUndo,
          }, '撤销') : null,
          h('button', {
            type: 'button',
            'data-testid': 'ilp-toast-close',
            onClick: function () { setToast(null) },
          }, '关闭'),
        ) : null,
      ),

      h(EvidenceDialog, {
        item: modalItem,
        onClose: function () { setModalItem(null) },
        onStartDrill: handleDrillRow,
        onCopied: function (title) { showToast('已复制手卡摘要：' + String(title || '').slice(0, 14), false) },
      }),

      h(SprintDialog, {
        open: sprintOpen,
        stations: sprintStations,
        onClose: function () { setSprintOpen(false) },
        onStartSprint: function (picked) {
          var promptText = buildSprintStarterPrompt(picked)
          openDeepLearnSession(ctx, { promptOverride: promptText }, effectiveWsId).catch(function (err) {
            showToast('开启连续闯关失败：' + err.message, false)
          })
        },
      }),
    )
  }
}

function bookmarkSvg(h) {
  return h('svg', {
    width: '11',
    height: '11',
    viewBox: '0 0 12 12',
    fill: 'none',
    'aria-hidden': 'true',
  },
    h('path', {
      d: 'M3.25 1.75H8.75C9.02614 1.75 9.25 1.97386 9.25 2.25V10.25L6 8.35L2.75 10.25V2.25C2.75 1.97386 2.97386 1.75 3.25 1.75Z',
      stroke: 'currentColor',
      strokeWidth: '1.2',
      strokeLinejoin: 'round',
    }),
  )
}

function chevronDownSvg(h) {
  return h('svg', {
    className: 'ilp-strip-chevron',
    width: '12',
    height: '12',
    viewBox: '0 0 12 12',
    fill: 'none',
    'aria-hidden': 'true',
  },
    h('path', {
      d: 'M3 4.5L6 7.5L9 4.5',
      stroke: 'currentColor',
      strokeWidth: '1.4',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }),
  )
}

// 3a. Markdown Fence: `shield` (Option A Muted-Gray Collapsible Postscript Strip)
function makeShieldFenceComponent(React, ctx, bridge, coachStore) {
  return function ShieldFence(props) {
    var h = React.createElement
    var snapTuple = React.useState(bridge.getState())
    var bridgeState = snapTuple[0]
    var setBridgeState = snapTuple[1]

    var expandedOverrideTuple = React.useState(false)
    var expandedOverride = expandedOverrideTuple[0]
    var setExpandedOverride = expandedOverrideTuple[1]

    var openAfterRestoreTuple = React.useState(false)
    var openAfterRestore = openAfterRestoreTuple[0]
    var setOpenAfterRestore = openAfterRestoreTuple[1]

    var savedLocalTuple = React.useState(false)
    var savedLocal = savedLocalTuple[0]
    var setSavedLocal = savedLocalTuple[1]

    var feedbackTuple = React.useState(null)
    var feedback = feedbackTuple[0]
    var setFeedback = feedbackTuple[1]

    var detailsRef = React.useRef(null)

    var isStreaming = Boolean(props && props.streaming)
    var parsed = isStreaming ? null : parseShieldFence(props && props.code)
    var cardKey = parsed ? hashCardKey(parsed, (props && props.sessionId) || '') : ''
    var snap = bridgeState.snapshot || null
    var dismissedList = (snap && snap.dismissedCardKeys) || []
    var autoCapturedList = (snap && snap.autoCapturedKeys) || []
    var isDismissed = !!(parsed && !expandedOverride && dismissedList.indexOf(cardKey) >= 0)
    var explicitInSnap = Boolean(
      parsed && snap && Array.isArray(snap.items) && snap.items.some(function (it) {
        return it && it.title === parsed.title && it.epistemic === 'explicit'
      }),
    )
    var isCaptured = Boolean(savedLocal || explicitInSnap)

    React.useEffect(function () {
      ensureStyleInjected()
      var off = bridge.subscribe(function (next) { setBridgeState(next) })
      return off
    }, [])

    React.useEffect(function () {
      if (isStreaming || !parsed || !parsed.title || !cardKey || isDismissed) return
      if (AUTO_CAPTURED_KEYS.has(cardKey)) return
      if (autoCapturedList.indexOf(cardKey) >= 0) {
        AUTO_CAPTURED_KEYS.add(cardKey)
        return
      }
      AUTO_CAPTURED_KEYS.add(cardKey)
      bridge.runAction('capture_candidate', {
        auto: true,
        cardKey: cardKey,
        payload: parsed,
      }).catch(function () {
        AUTO_CAPTURED_KEYS.delete(cardKey)
      })
    }, [isStreaming, cardKey, isDismissed])

    React.useEffect(function () {
      if (openAfterRestore && !isDismissed && detailsRef && detailsRef.current) {
        detailsRef.current.open = true
        setOpenAfterRestore(false)
      }
    }, [openAfterRestore, isDismissed])

    var psHeader = h('div', { className: 'ilp-ps-head' },
      h('span', { className: 'ilp-ps-label' }, '附 · 顺带补充（非本轮主回复）'),
      h('span', { className: 'ilp-ps-line', 'aria-hidden': 'true' }),
      h('span', { className: 'ilp-ps-archive' }, '已直接落进手账顶部，忙时不用管'),
    )

    if (isStreaming) {
      return h('div', { className: 'ilp-fence is-shield' },
        psHeader,
        h('div', { className: 'ilp-strip-streaming', 'data-testid': 'ilp-shield-streaming' },
          h('span', { className: 'ilp-badge-card' }, bookmarkSvg(h), '顺带学习卡'),
          h('span', { className: 'ilp-strip-topic' }, '正在顺手记下这轮的关键做法…'),
        ),
      )
    }

    if (!parsed) {
      return (props && props.children) || null
    }

    if (isDismissed) {
      return h('div', { className: 'ilp-fence is-shield' },
        psHeader,
        h('div', { className: 'ilp-dismissed-strip' },
          h('span', { className: 'ilp-strip-topic' }, '已学会收起：' + parsed.title),
          h('button', {
            type: 'button',
            className: 'ilp-quiet-btn is-ghost',
            'data-testid': 'ilp-shield-restore-btn',
            onClick: function () {
              setExpandedOverride(true)
              setOpenAfterRestore(true)
              bridge.runAction('dismiss_card', { cardKey: cardKey, title: parsed.title, restore: true }).catch(function () {})
            },
          }, '重新展开'),
        ),
      )
    }

    function handleOpenCoach() {
      coachStore.setPayload(props && props.sessionId, cardKey, parsed)
      var sr = getHostService(ctx, 'sidebarRight')
      if (sr && typeof sr.openTab === 'function') {
        sr.openTab(COACH_TAB_KIND, {
          params: {
            cardKey: cardKey,
            sessionId: (props && props.sessionId) || '',
          },
        })
      } else {
        setFeedback('右侧栏暂未就绪')
      }
    }

    function handleSaveDirect() {
      AUTO_CAPTURED_KEYS.add(cardKey)
      bridge.runAction('save_explicit', {
        payload: Object.assign({}, parsed, { epistemic: 'explicit' }),
      }).then(function (res) {
        setSavedLocal(true)
        if (res && res.created === false) {
          setFeedback('已在技能手账中')
        } else {
          setFeedback('已存进顺带私教手账，随时可开练')
        }
      }).catch(function (err) {
        setFeedback('保存失败：' + err.message)
      })
    }

    function handleDismiss() {
      setExpandedOverride(false)
      setOpenAfterRestore(false)
      AUTO_CAPTURED_KEYS.add(cardKey)
      bridge.runAction('dismiss_card', { cardKey: cardKey, title: parsed.title, restore: false }).catch(function () {})
    }

    return h('div', { className: 'ilp-fence is-shield' },
      psHeader,
      h('details', {
        className: 'ilp-strip-details',
        ref: detailsRef,
        'data-testid': 'ilp-shield-card',
        'data-card-key': cardKey,
      },
        h('summary', { className: 'ilp-strip-summary', 'data-testid': 'ilp-strip-summary' },
          h('span', { className: 'ilp-strip-left' },
            chevronDownSvg(h),
            h('span', { className: 'ilp-badge-card' }, bookmarkSvg(h), '顺带学习卡'),
            h('span', { className: 'ilp-strip-topic' }, parsed.title),
          ),
          h('span', { className: 'ilp-strip-hint' },
            h('span', { className: 'ilp-hint-closed' }, '点开复习'),
            h('span', { className: 'ilp-hint-open' }, '收起'),
          ),
        ),
        h('div', { className: 'ilp-strip-body' },
          h('div', { className: 'ilp-facts-compact' },
            h('div', null,
              h('span', { className: 'ilp-fact-k' }, '为什么这么做：'),
              parsed.why,
            ),
            h('div', null,
              h('span', { className: 'ilp-fact-k' }, '避开的坑：'),
              parsed.rejected,
            ),
            h('div', { className: 'ilp-probe-inline' },
              h('span', { className: 'ilp-fact-k' }, '顺手想一下：'),
              parsed.probe,
            ),
          ),
          h('div', { className: 'ilp-acts-quiet' },
            h('button', {
              type: 'button',
              className: 'ilp-quiet-btn is-soft-accent',
              'data-testid': 'ilp-shield-coach-btn',
              onClick: handleOpenCoach,
            }, '在右侧边聊边学'),
            h('button', {
              type: 'button',
              className: 'ilp-quiet-btn',
              'data-testid': 'ilp-shield-capture-btn',
              'aria-pressed': isCaptured ? 'true' : 'false',
              onClick: handleSaveDirect,
            }, isCaptured ? '已存进技能库' : '存进技能库'),
            h('button', {
              type: 'button',
              className: 'ilp-quiet-btn is-ghost',
              'data-testid': 'ilp-shield-dismiss-btn',
              onClick: handleDismiss,
            }, '已掌握，收起'),
            feedback ? h('span', { className: 'ilp-card-receipt', 'data-testid': 'ilp-shield-feedback' }, feedback) : null,
          ),
        ),
      ),
    )
  }
}

// 3b. Markdown Fence: `learn-quiz` (Native Interactive Blind Test + Composer Draft Guard)
function makeLearnQuizFenceComponent(React) {
  return function LearnQuizFence(props) {
    var h = React.createElement
    var pickedTuple = React.useState(null)
    var picked = pickedTuple[0]
    var setPicked = pickedTuple[1]

    var guardOptTuple = React.useState(null)
    var guardOpt = guardOptTuple[0]
    var setGuardOpt = guardOptTuple[1]

    var copiedNoteTuple = React.useState(null)
    var copiedNote = copiedNoteTuple[0]
    var setCopiedNote = copiedNoteTuple[1]

    React.useEffect(function () {
      ensureStyleInjected()
    }, [])

    var currentDraft = (props && typeof props.useInput === 'function')
      ? String(props.useInput(function (s) { return s ? s.draft : '' }) || '')
      : ''
    var inputPhase = (props && typeof props.useInput === 'function')
      ? String(props.useInput(function (s) { return s ? s.phase : 'plain' }) || 'plain')
      : 'plain'

    if (props && props.streaming) {
      return h('div', { className: 'ilp-fence' },
        h('div', { className: 'ilp-card streaming' },
          h('span', { className: 'ilp-summary' }, '顺带私教 · 正在生成第 1 关盲测题…'),
        ),
      )
    }

    var quiz = parseLearnQuizFence(props && props.code)
    if (!quiz) {
      return (props && props.children) || null
    }

    function formatChoiceMessage(opt) {
      return '我选 ' + opt.key + '：' + opt.label
    }

    function sendOptionThroughComposer(opt) {
      var msg = formatChoiceMessage(opt)
      setPicked(opt.key)
      setGuardOpt(null)
      if (props && props.inputActions && typeof props.inputActions.setDraft === 'function') {
        props.inputActions.setDraft(msg)
        if (typeof props.inputActions.submit === 'function') {
          props.inputActions.submit()
          setCopiedNote('已通过原生输入框发出选择：' + opt.key)
          return
        }
      }
      setCopiedNote('已选 ' + opt.key + '（当前环境无输入框发送句柄）')
    }

    function handlePickOption(opt) {
      if (currentDraft.trim().length > 0) {
        // Native composer draft protection: NEVER overwrite user's unsent text!
        setGuardOpt(opt)
        setCopiedNote(null)
        return
      }
      if (inputPhase !== 'plain') {
        setCopiedNote('当前正在发送上一轮消息，请稍候或手动发送')
        return
      }
      sendOptionThroughComposer(opt)
    }

    return h('div', { className: 'ilp-fence' },
      h('article', { className: 'ilp-card', 'data-testid': 'ilp-learn-quiz-card' },
        h('div', { className: 'ilp-card-head' },
          h('span', { className: 'ilp-card-title' }, quiz.title),
          h('div', { className: 'ilp-item-badges', style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
            h('span', { className: 'ilp-tag run' }, '第 ' + quiz.step + ' / ' + quiz.totalSteps + ' 关 · 先探后讲'),
            h('span', { className: 'ilp-tag outline' }, quiz.trackTitle),
          ),
        ),
        quiz.scenario ? h('p', { className: 'ilp-spot-desc' }, quiz.scenario) : null,
        (quiz.before || quiz.after) ? h('div', { className: 'ilp-compare-grid' },
          quiz.before ? h('div', { className: 'ilp-code-box' },
            h('div', { className: 'ilp-code-label' }, quiz.before.label),
            h('pre', { className: 'ilp-code-pre' }, quiz.before.code),
          ) : null,
          quiz.after ? h('div', { className: 'ilp-code-box' },
            h('div', { className: 'ilp-code-label' }, quiz.after.label),
            h('pre', { className: 'ilp-code-pre' }, quiz.after.code),
          ) : null,
        ) : null,
        h('div', { style: { fontWeight: 600, fontSize: '13.5px' } }, quiz.question),
        quiz.analogy ? h('details', { className: 'ilp-analogy' },
          h('summary', null, quiz.analogy.title),
          h('p', null, quiz.analogy.body),
        ) : null,
        h('div', { className: 'ilp-quiz-opts' },
          quiz.options.map(function (opt) {
            var isPicked = picked === opt.key
            return h('button', {
              key: opt.key,
              type: 'button',
              className: 'ilp-quiz-opt' + (isPicked ? ' is-picked' : ''),
              'data-testid': 'ilp-quiz-opt-' + opt.key,
              onClick: function () { handlePickOption(opt) },
            },
              h('span', { className: 'ilp-opt-key' }, opt.key),
              h('span', { className: 'ilp-opt-body' },
                h('span', { style: { fontWeight: 500 } }, opt.label),
                opt.detail ? h('span', { style: { fontSize: '12px', color: 'var(--ilp-ink2)' } }, opt.detail) : null,
              ),
            )
          }),
        ),
        guardOpt ? h('div', { className: 'ilp-draft-guard', 'data-testid': 'ilp-draft-guard' },
          h('div', { style: { fontWeight: 600 } }, '底部输入框已有未发送草稿，为防覆盖未自动替换：'),
          h('div', { className: 'ilp-draft-guard-acts' },
            h('button', {
              type: 'button',
              className: 'ilp-btn line xs',
              'data-testid': 'ilp-draft-guard-keep',
              onClick: function () {
                var txt = formatChoiceMessage(guardOpt)
                if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
                  navigator.clipboard.writeText(txt).catch(function () {})
                }
                setPicked(guardOpt.key)
                setGuardOpt(null)
                setCopiedNote('已保留原草稿，并复制选择文本：' + txt)
              },
            }, '保留草稿仅复制选项'),
            h('button', {
              type: 'button',
              className: 'ilp-btn solid xs',
              'data-testid': 'ilp-draft-guard-replace',
              onClick: function () { sendOptionThroughComposer(guardOpt) },
            }, '替换草稿并发送'),
          ),
        ) : null,
        copiedNote ? h('div', { className: 'ilp-status-note', 'data-testid': 'ilp-quiz-status' }, copiedNote) : null,
      ),
    )
  }
}

// 3c. Markdown Fence: `learn-pass` (Permanent Graduation Card unaffected by foldCompletedTurns)
function makeLearnPassFenceComponent(React, ctx, bridge) {
  return function LearnPassFence(props) {
    var h = React.createElement
    var exportMsgTuple = React.useState(null)
    var exportMsg = exportMsgTuple[0]
    var setExportMsg = exportMsgTuple[1]

    React.useEffect(function () {
      ensureStyleInjected()
    }, [])

    if (props && props.streaming) {
      return h('div', { className: 'ilp-fence' },
        h('div', { className: 'ilp-card streaming' },
          h('span', { className: 'ilp-summary' }, '顺带私教 · 正在归档过关记录…'),
        ),
      )
    }

    var pass = parseLearnPassFence(props && props.code)
    if (!pass) {
      return (props && props.children) || null
    }

    return h('div', { className: 'ilp-fence' },
      h('article', { className: 'ilp-card pass', 'data-testid': 'ilp-learn-pass-card' },
        h('div', { className: 'ilp-card-head' },
          h('span', { className: 'ilp-card-title' }, pass.title),
          h('span', { className: 'ilp-tag ok' }, '学懂过关 · 掌握度提升'),
        ),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' } },
          h('span', { className: 'ilp-tag outline' }, pass.trackTitle),
          h('span', { className: 'ilp-summary' },
            (MASTERY_LABELS[pass.fromTier] || '') + ' -> ' + (MASTERY_LABELS[pass.toTier] || ''),
          ),
          makeMasteryMeter(h, pass.toTier),
        ),
        h('div', { className: 'ilp-drawer-fb' },
          h('div', { className: 'ilp-shield-k' }, '过关证据（永久入账）'),
          h('p', null, pass.evidenceSummary),
        ),
        h('div', { className: 'ilp-card-acts' },
          h('button', {
            type: 'button',
            className: 'ilp-btn solid sm',
            'data-testid': 'ilp-pass-back-btn',
            onClick: function () {
              var layout = getHostService(ctx, 'layout')
              if (layout && typeof layout.selectPanel === 'function') {
                layout.selectPanel(PANEL_KEY)
              }
            },
          }, '回顺带私教手账'),
          h('button', {
            type: 'button',
            className: 'ilp-btn line sm',
            'data-testid': 'ilp-pass-export-btn',
            onClick: function () {
              bridge.runAction('export_markdown', { trackId: pass.trackId || undefined }).then(function (res) {
                setExportMsg('已保存：' + ((res && res.exported && res.exported.fileName) || 'notes.md'))
              }).catch(function (err) {
                setExportMsg('导出失败：' + err.message)
              })
            },
          }, '导出本节笔记'),
          exportMsg ? h('span', { className: 'ilp-status-note' }, exportMsg) : null,
        ),
      ),
    )
  }
}

// 4. Right Sidebar 90s Micro-Drill Tab (`sidebar.right.pane.tab`, key: COACH_TAB_ID)
function makeCoachDrawerComponent(React, ctx, bridge, coachStore) {
  return function CoachDrawerBody(props) {
    var h = React.createElement
    var storeTickTuple = React.useState(0)
    var setStoreTick = storeTickTuple[1]

    var selectedTuple = React.useState(null)
    var selectedKey = selectedTuple[0]
    var setSelectedKey = selectedTuple[1]

    var resultTuple = React.useState(null)
    var drillResult = resultTuple[0]
    var setDrillResult = resultTuple[1]

    React.useEffect(function () {
      ensureStyleInjected()
      var off = coachStore.subscribe(function () {
        setStoreTick(function (v) { return v + 1 })
        setSelectedKey(null)
        setDrillResult(null)
      })
      return off
    }, [])

    var tabInfo = props && typeof props.useTabInfo === 'function' ? props.useTabInfo() : null
    var params = (tabInfo && tabInfo.tab && tabInfo.tab.navigation && tabInfo.tab.navigation.params) || {}
    var activeSessionId = params.sessionId || (props && props.sessionId) || ''
    var payload = coachStore.getPayload(activeSessionId)
    var card = payload && payload.card

    if (!card) {
      return h('div', { className: 'ilp-drawer', 'data-testid': 'ilp-coach-drawer-empty' },
        h('div', { className: 'ilp-drawer-box' },
          h('div', { className: 'ilp-card-title' }, '顺带学习栏'),
          h('p', { className: 'ilp-summary' }, '点开对话末尾的顺带学习卡，再点「在右侧边聊边学」，就能在右侧对话边看，不打乱左边正在输入的草稿。'),
        ),
      )
    }

    var quiz = card.quiz || sanitizeQuizBlock(null, card.title, card.why, card.rejected, card.probe)
    var chosenOpt = quiz.options.find(function (o) { return o.key === selectedKey }) || null

    function handleAnswer(opt) {
      setSelectedKey(opt.key)
      bridge.runAction('record_micro_drill', {
        itemId: card.id || undefined,
        card: card,
        correct: !!opt.correct,
        selectedKey: opt.key,
        evidenceNote: opt.correct
          ? ('在右栏 90s 小灶选出 ' + opt.key + '，准确说出「' + card.title + '」取舍依据与被排除坑点。')
          : ('完成右栏 90s 小灶点拨（初选 ' + opt.key + '），已对照纠正「' + card.title + '」的盲区边界。'),
      }).then(function (res) {
        setDrillResult({
          correct: !!opt.correct,
          feedback: opt.feedback || (opt.correct ? card.why : ('正确取舍依据：' + card.why)),
          toTier: (res && res.toTier) || (opt.correct ? 3 : 2),
        })
      }).catch(function (err) {
        setDrillResult({
          correct: !!opt.correct,
          feedback: opt.feedback || card.why,
          error: err.message,
        })
      })
    }

    function handleCloseDrawer() {
      if (tabInfo && tabInfo.tab && tabInfo.tab.actions && typeof tabInfo.tab.actions.close === 'function') {
        tabInfo.tab.actions.close()
      }
    }

    return h('aside', { className: 'ilp-drawer', 'data-testid': 'ilp-coach-drawer' },
      h('div', { className: 'ilp-drawer-box' },
        h('div', { className: 'ilp-card-head' },
          h('span', { className: 'ilp-badge-card' }, '边聊边学 · 不扰左边草稿'),
          h('button', {
            type: 'button',
            className: 'ilp-btn ghost xs',
            onClick: handleCloseDrawer,
          }, '收起'),
        ),
        h('h3', { className: 'ilp-card-title' }, card.title),
        h('div', { className: 'ilp-drawer-q' }, quiz.question),
        h('div', { className: 'ilp-quiz-opts' },
          quiz.options.map(function (opt) {
            var cls = 'ilp-quiz-opt'
            if (selectedKey === opt.key) {
              cls += opt.correct ? ' is-correct' : ' is-wrong'
            }
            return h('button', {
              key: opt.key,
              type: 'button',
              className: cls,
              'data-testid': 'ilp-drawer-opt-' + opt.key,
              onClick: function () { handleAnswer(opt) },
            },
              h('span', { className: 'ilp-opt-key' }, opt.key),
              h('span', { className: 'ilp-opt-body' }, opt.label),
            )
          }),
        ),
        drillResult ? h('div', { className: 'ilp-drawer-fb', 'data-testid': 'ilp-drawer-feedback' },
          h('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' } },
            h('span', { className: 'ilp-tag ' + (drillResult.correct ? 'ok' : 'wait') },
              drillResult.correct ? '答对了' : '再看一眼关键点',
            ),
            makeMasteryMeter(h, drillResult.toTier || (drillResult.correct ? 3 : 2)),
          ),
          h('p', null, drillResult.feedback || (chosenOpt && chosenOpt.feedback) || card.why),
          h('div', { className: 'ilp-card-acts' },
            h('button', {
              type: 'button',
              className: 'ilp-btn line xs',
              onClick: function () { openDeepLearnSession(ctx, card).catch(function () {}) },
            }, '转去新会话深学'),
            h('button', {
              type: 'button',
              className: 'ilp-btn ghost xs',
              onClick: function () {
                var layout = getHostService(ctx, 'layout')
                if (layout && typeof layout.selectPanel === 'function') layout.selectPanel(PANEL_KEY)
              },
            }, '回顺带私教手账'),
          ),
        ) : null,
      ),
    )
  }
}

// 5. Composer Right Digest Pill (`conversation.input.right`)
function makeComposerPillComponent(React, ctx, bridge) {
  return function ComposerDigestPill() {
    var h = React.createElement
    var stateTuple = React.useState(bridge.getState())
    var bridgeState = stateTuple[0]
    var setBridgeState = stateTuple[1]

    React.useEffect(function () {
      ensureStyleInjected()
      var off = bridge.subscribe(function (next) { setBridgeState(next) })
      if (!bridge.getState().snapshot) {
        bridge.refresh(true).catch(function () {})
      }
      return off
    }, [])

    var snap = bridgeState.snapshot
    var count = (snap && snap.stats && snap.stats.digestCount) || 0
    if (count <= 0) return null

    return h('button', {
      type: 'button',
      className: 'ilp-pill',
      'data-testid': 'ilp-composer-pill',
      onClick: function () {
        var layout = getHostService(ctx, 'layout')
        if (layout && typeof layout.selectPanel === 'function') {
          layout.selectPanel(PANEL_KEY)
        }
      },
    }, '顺带学习 · 已存 ' + count + ' 张')
  }
}

// 6. Compact 1-line tool receipts (`tool.call.toolview`)
function makeToolViewReceipt(React, labelByPhase) {
  return function LearnToolViewReceipt(props) {
    var h = React.createElement
    var phase = (props && props.phase) || 'result'
    var text = labelByPhase[phase] || labelByPhase.result
    return h('div', { className: 'ilp-tool' },
      h('span', { className: 'ilp-tag ok' }, '顺带私教'),
      h('span', null, text),
    )
  }
}

exports.inject = ['slots']

exports.apply = function apply(ctx) {
  var React = loadReact()
  if (!React) return

  var bridge = createClientLedgerBridge()
  var coachStore = createCoachSessionStore()

  ctx.effect(function () {
    ensureStyleInjected()
    var cleanups = []

    // 1. Register Right Sidebar Tab Definition (`sidebarRightTabs`)
    var registerRightDef = function (srTabs) {
      if (!srTabs || typeof srTabs.register !== 'function') return undefined
      return srTabs.register({
        id: COACH_TAB_ID,
        kind: COACH_TAB_KIND,
        title: function () { return '顺带学习栏' },
        guide: [{
          id: 'incidental-learn-coach-guide',
          order: 95,
          title: function () { return '顺带学习栏' },
          description: function () { return '在右侧对话边看，不打乱左边正在输入的草稿。' },
        }],
      })
    }

    var directSrTabs = getHostService(ctx, 'sidebarRightTabs')
    if (directSrTabs) {
      var offSrDefDirect = registerRightDef(directSrTabs)
      if (typeof offSrDefDirect === 'function') cleanups.push(offSrDefDirect)
    } else if (ctx && typeof ctx.inject === 'function') {
      try {
        var offSrInject = ctx.inject(['sidebarRightTabs'], function (scope) {
          var sr = getHostService(scope, 'sidebarRightTabs') || getHostService(ctx, 'sidebarRightTabs')
          return registerRightDef(sr)
        })
        if (typeof offSrInject === 'function') cleanups.push(offSrInject)
      } catch (_e) {}
    }

    // 2. Register Right Sidebar Tab Body under `definition.id` (`COACH_TAB_ID`)
    var offRightBody = ctx.slots.inject('sidebar.right.pane.tab', function () {
      return ctx.slots.register(
        { name: 'sidebar.right.pane.tab', key: COACH_TAB_ID },
        makeCoachDrawerComponent(React, ctx, bridge, coachStore),
      )
    })
    if (typeof offRightBody === 'function') cleanups.push(offRightBody)

    // 3. Register Chat Markdown Fences (`shield`, `learn-quiz`, `learn-pass`)
    var offFenceShield = ctx.slots.inject('conversation.chat.markdown.fence', function () {
      return ctx.slots.register(
        { name: 'conversation.chat.markdown.fence', key: 'shield', id: '@oxmumu3/dsh-incidental-learn/fence/shield' },
        makeShieldFenceComponent(React, ctx, bridge, coachStore),
      )
    })
    if (typeof offFenceShield === 'function') cleanups.push(offFenceShield)

    var offFenceQuiz = ctx.slots.inject('conversation.chat.markdown.fence', function () {
      return ctx.slots.register(
        { name: 'conversation.chat.markdown.fence', key: 'learn-quiz', id: '@oxmumu3/dsh-incidental-learn/fence/learn-quiz' },
        makeLearnQuizFenceComponent(React),
      )
    })
    if (typeof offFenceQuiz === 'function') cleanups.push(offFenceQuiz)

    var offFencePass = ctx.slots.inject('conversation.chat.markdown.fence', function () {
      return ctx.slots.register(
        { name: 'conversation.chat.markdown.fence', key: 'learn-pass', id: '@oxmumu3/dsh-incidental-learn/fence/learn-pass' },
        makeLearnPassFenceComponent(React, ctx, bridge),
      )
    })
    if (typeof offFencePass === 'function') cleanups.push(offFencePass)

    // 4. Register Composer Right Digest Pill
    var offInputPill = ctx.slots.inject('conversation.input.right', function () {
      return ctx.slots.register(
        { name: 'conversation.input.right', id: '@oxmumu3/dsh-incidental-learn/input-pill', order: 40 },
        makeComposerPillComponent(React, ctx, bridge),
      )
    })
    if (typeof offInputPill === 'function') cleanups.push(offInputPill)

    // 5. Register Tool Call Receipts (`tool.call.toolview`)
    var toolSpecs = [
      ['learn_save', { preparing: '准备保存盲区…', start: '正在记入顺带私教…', result: '已明存进顺带私教手账' }],
      ['learn_checkpoint', { preparing: '准备归档过关证据…', start: '正在记录过关掌握度…', result: '过关证据与掌握度已写入账本' }],
      ['learn_triage', { preparing: '准备整理手账未看…', start: '正在处理未看条目…', result: '手账列表已更新' }],
    ]
    toolSpecs.forEach(function (pair) {
      var offTool = ctx.slots.inject('tool.call.toolview', function () {
        return ctx.slots.register(
          { name: 'tool.call.toolview', key: pair[0] },
          makeToolViewReceipt(React, pair[1]),
        )
      })
      if (typeof offTool === 'function') cleanups.push(offTool)
    })

    // 6. Register Left Sidebar Entry & Main Workbench Panel
    var offMain = ctx.slots.inject('main', function () {
      return ctx.slots.register(
        { name: 'main', key: PANEL_KEY },
        makeWorkbenchComponent(React, ctx, bridge),
      )
    })
    if (typeof offMain === 'function') cleanups.push(offMain)

    var offSidebar = ctx.slots.inject('sidebar.panellist', function () {
      return ctx.slots.register(
        { name: 'sidebar.panellist', id: PANEL_KEY, order: 95, label: function () { return '顺带私教' } },
        makeIconComponent(React),
      )
    })
    if (typeof offSidebar === 'function') cleanups.push(offSidebar)

    return function () {
      while (cleanups.length) {
        var fn = cleanups.pop()
        try { fn() } catch (_e) {}
      }
    }
  })
}
