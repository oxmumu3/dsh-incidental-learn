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
  var loading = false
  var error = null
  var listeners = new Set()
  var versionSeen = null

  function emit() {
    listeners.forEach(function (fn) {
      try { fn({ snapshot: snapshot, loading: loading, error: error }) } catch (_e) {}
    })
  }

  function setSnapshot(next) {
    if (!next) return
    snapshot = next
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
          setSnapshot(res.snapshot)
        } else {
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
      if (res && res.snapshot) setSnapshot(res.snapshot)
      return res
    })
  }

  function subscribe(fn) {
    listeners.add(fn)
    return function () { listeners.delete(fn) }
  }

  return {
    getState: function () { return { snapshot: snapshot, loading: loading, error: error } },
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

function makeMasteryMeter(h, tier) {
  var safeTier = clampTier(tier || 1)
  var label = MASTERY_LABELS[safeTier] || MASTERY_LABELS[1]
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

function openDeepLearnSession(ctx, item) {
  var prompt = buildDeepLearnStarterPrompt(item)
  return postLearnAction('ensure_practice_workspace', {}).then(function (res) {
    var wsId = res && res.workspace && res.workspace.workspaceId
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

// Native <dialog closedby="any"> Modal with fallback bounding-rect light-dismiss
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
      if (!('closedBy' in HTMLDialogElement.prototype)) {
        var rect = el.getBoundingClientRect()
        var inside = e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top && e.clientY <= rect.bottom
        if (!inside && props.onClose) props.onClose()
      }
    }

    return h('dialog', {
      ref: dlgRef,
      className: 'ilp-dialog',
      closedby: 'any',
      'aria-labelledby': item ? 'ilp-dlg-heading' : undefined,
      onClose: handleNativeClose,
      onClick: handleDialogClick,
    },
      item ? h(React.Fragment, null,
        h('div', { className: 'ilp-dlg-head' },
          h('h2', { id: 'ilp-dlg-heading', className: 'ilp-dlg-title' }, item.title),
          h('button', {
            type: 'button',
            className: 'ilp-btn ghost sm',
            onClick: function () { if (props.onClose) props.onClose() },
          }, '关闭'),
        ),
        h('div', { className: 'ilp-dlg-body' },
          h('div', { className: 'ilp-item-badges' },
            sourceTag(h, item.source),
            epistemicTag(h, item.epistemic),
            makeMasteryMeter(h, item.masteryTier),
          ),
          item.why ? h('div', null,
            h('div', { className: 'ilp-shield-k' }, '为什么这么做'),
            h('p', { style: { marginTop: '3px' } }, item.why),
          ) : null,
          item.rejected ? h('div', null,
            h('div', { className: 'ilp-shield-k' }, '被排除的差方案'),
            h('p', { style: { marginTop: '3px' } }, item.rejected),
          ) : null,
          item.probe ? h('div', { className: 'ilp-shield-probe' },
            h('span', { className: 'ilp-shield-k', style: { marginRight: '6px' } }, '一句话摸底'),
            item.probe,
          ) : null,
          item.evidenceSummary ? h('div', { className: 'ilp-drawer-fb' },
            h('div', { className: 'ilp-shield-k' }, '人话版过关证据'),
            h('p', null, item.evidenceSummary),
          ) : null,
        ),
        h('div', { className: 'ilp-dlg-foot' },
          h('button', {
            type: 'button',
            className: 'ilp-btn line sm',
            onClick: function () { if (props.onClose) props.onClose() },
          }, '先回列表'),
          h('button', {
            type: 'button',
            className: 'ilp-btn solid sm',
            onClick: function () {
              var chosen = item
              if (props.onClose) props.onClose()
              if (props.onStartDrill) props.onStartDrill(chosen)
            },
          }, '去原生会话重温 / 闯关'),
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
  var conv = getHostService(ctx, 'conversations')
  var starterPrompt = '帮我检查一下当前项目的结构与改动方案，如果有值得注意的工程、架构或前端设计取舍，干完顺手给我一张 4 行决策底牌。'
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

function makeFlowArrowSvg(h, size) {
  var s = size || 14
  return h('svg', {
    className: 'ilp-vis-arrow-svg',
    width: s,
    height: s,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.6',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
  },
    h('path', { d: 'M3 8h9' }),
    h('path', { d: 'M9 4l4 4-4 4' }),
  )
}

var SIM_ORDER = ['idle', 'coach', 'save', 'dismiss']
var SIM_MODES = {
  idle: {
    tabLabel: '全不按（静默兜底）',
    winTag: '后台静默沉淀',
    badgeClass: 'ilp-tag wait',
    badgeText: '不打扰对话，也不丢',
    cardTitle: '待分诊候选 +1（已自动去重）',
    cardDesc: '列表容器滚动卡死：flex:1 与 min-height:0 的配合 · 来自 DSH 会话',
    bullet1: '主对话区零插楼，未发完的草稿原样保留',
    bullet2: '工作台静默记进「待分诊候选」，闲时随时挑着留或略过',
    footerNote: '三个按钮全都不点也不会丢失：卡片会在本页下方静候分诊，等你闲下来再挑。',
  },
  coach: {
    tabLabel: '点「右侧接招 90s」',
    winTag: '右侧 90s 小灶抽屉',
    badgeClass: 'ilp-tag run',
    badgeText: '不污染主对话',
    cardTitle: '右栏当场小测一题（90s）',
    cardDesc: '摸底：已经写了 overflow-y: auto，为什么还要补 min-height: 0？',
    bullet1: '仅在右侧划开独立小灶面板，主对话流和草稿输入框纹丝不动',
    bullet2: '用自己的话答完即给反馈，答对直接升格并写进台账',
    footerNote: '适合当场有空花 90 秒立刻搞懂，省得下次写滚动列表继续踩同一个坑。',
  },
  save: {
    tabLabel: '点「直接收入路线」',
    winTag: '能力路线台账',
    badgeClass: 'ilp-tag run',
    badgeText: '直通重点跟踪',
    cardTitle: '已收入路线：前端布局与容器 [1/4 待巩固]',
    cardDesc: '跳过待分诊inbox，直接进入你的长期能力路线',
    bullet1: '优先排进工作台本周聚焦，提醒你补齐实战内化',
    bullet2: '有空回台账点「开始 3 分钟闯关」，用自己的话复述过关',
    footerNote: '适合正忙着赶当前任务，但觉得这条坑特别值钱、回头必练。',
  },
  dismiss: {
    tabLabel: '点「已掌握，收起」',
    winTag: '静默折叠完成',
    badgeClass: 'ilp-tag ok',
    badgeText: '已从待分诊移除',
    cardTitle: '原卡片当场折叠成极简一行',
    cardDesc: '同步从待分诊队列清出，同主题不再重复提醒',
    bullet1: '会话界面立刻变清爽，不占用当前视口高度',
    bullet2: '表明已经掌握，避免你熟悉的概念来回刷屏',
    footerNote: '最利落的减噪手势：觉得这条早就烂熟于心，一键折叠并清出候选区。',
  },
}

function makeVisualGuideComponent(React) {
  return function VisualGuide(props) {
    var h = React.createElement
    var isEmpty = !!(props && props.isEmpty)
    var simTuple = React.useState('idle')
    var simMode = simTuple[0]
    var setSimMode = simTuple[1]
    var activeSim = SIM_MODES[simMode] || SIM_MODES.idle

    function handleTabKeyDown(modeKey, e) {
      var idx = SIM_ORDER.indexOf(modeKey)
      var nextIdx = -1
      if (e.key === 'ArrowRight') nextIdx = (idx + 1) % SIM_ORDER.length
      else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + SIM_ORDER.length) % SIM_ORDER.length
      else if (e.key === 'Home') nextIdx = 0
      else if (e.key === 'End') nextIdx = SIM_ORDER.length - 1
      if (nextIdx >= 0) {
        e.preventDefault()
        var nextKey = SIM_ORDER[nextIdx]
        setSimMode(nextKey)
        if (typeof document !== 'undefined') {
          var nextEl = document.getElementById('ilp-sim-tab-' + nextKey)
          if (nextEl && typeof nextEl.focus === 'function') nextEl.focus()
        }
      }
    }

    return h('div', { className: 'ilp-onb-stack', 'data-testid': 'ilp-visual-guide' },
      // 1. Compact Visual Flow Hero
      h('section', { className: 'ilp-vis-hero' },
        h('div', { className: 'ilp-vis-hero-top' },
          h('span', { className: 'ilp-tag run' }, isEmpty ? '新手图解 · 无需提前建档' : '机制图解 · 原台账数据保留不动'),
          !isEmpty && props && props.onClose ? h('button', {
            type: 'button',
            className: 'ilp-btn ghost xs',
            'data-testid': 'ilp-close-guide-btn',
            onClick: props.onClose,
          }, '收起图解') : null,
        ),
        h('h2', { className: 'ilp-onb-lead' }, '平时照常派活零打扰，只在关键取舍顺手长本事'),
        h('div', { className: 'ilp-vis-flow-pills', 'aria-label': '运作流程四步示意' },
          h('span', { className: 'ilp-vis-pill' },
            h('span', { className: 'ilp-vis-pill-num' }, '1'),
            '正常对话派活',
          ),
          makeFlowArrowSvg(h, 14),
          h('span', { className: 'ilp-vis-pill' },
            h('span', { className: 'ilp-vis-pill-num' }, '2'),
            '遇取舍自动亮底牌',
          ),
          makeFlowArrowSvg(h, 14),
          h('span', { className: 'ilp-vis-pill' },
            h('span', { className: 'ilp-vis-pill-num' }, '3'),
            '点按钮或全不按',
          ),
          makeFlowArrowSvg(h, 14),
          h('span', { className: 'ilp-vis-pill' },
            h('span', { className: 'ilp-vis-pill-num' }, '4'),
            '回台账 3 分钟闯关',
          ),
        ),
        h('div', { className: 'ilp-onb-cta' },
          h('button', {
            type: 'button',
            className: 'ilp-btn solid',
            'data-testid': 'ilp-start-chat-cta',
            onClick: function () { if (props && props.onStartChat) props.onStartChat() },
          }, '去新会话派个活试试'),
          isEmpty ? h('button', {
            type: 'button',
            className: 'ilp-btn line',
            'data-testid': 'ilp-load-samples-btn',
            onClick: function () { if (props && props.onLoadSamples) props.onLoadSamples() },
          }, '预览填满后的账本效果') : null,
        ),
      ),

      // 2. 3 Subgrid-Aligned UI-Miniature Storyboard Cards (direct children only: scene -> header -> p)
      h('div', { className: 'ilp-onb-steps' },
        h('article', { className: 'ilp-onb-step' },
          h('div', { className: 'ilp-scene', 'aria-hidden': 'true' },
            h('div', { className: 'ilp-mini-bubble' }, '帮我修一下列表滚动卡死'),
            h('div', { className: 'ilp-mini-muted' }, '普通改字 / 查资料 -> 全程零打扰'),
            h('div', { className: 'ilp-mini-card' },
              h('span', { className: 'ilp-mini-k' }, '关键取舍自动亮牌'),
              h('span', { className: 'ilp-mini-line' }, '4 行底牌 + 3 个快捷操作'),
            ),
          ),
          h('header', { className: 'ilp-step-head' },
            h('span', { className: 'ilp-onb-num' }, '01 · 对话中自动触发'),
            h('h3', { className: 'ilp-onb-step-h' }, '只挑值得记的取舍亮牌'),
          ),
          h('p', { className: 'ilp-onb-step-p' }, '日常派活照常零打断；只有做出实质方案取舍时，回复末尾才附 4 行底牌。'),
        ),

        h('article', { className: 'ilp-onb-step' },
          h('div', { className: 'ilp-scene', 'aria-hidden': 'true' },
            h('div', { className: 'ilp-mini-matrix' },
              h('div', { className: 'ilp-mini-cell' }, h('b', null, '右侧接招 90s'), h('span', null, '开小灶测一题')),
              h('div', { className: 'ilp-mini-cell' }, h('b', null, '直接收入路线'), h('span', null, '进路线重点练')),
              h('div', { className: 'ilp-mini-cell' }, h('b', null, '已掌握收起'), h('span', null, '折叠并清候选')),
              h('div', { className: 'ilp-mini-cell hi' }, h('b', null, '全都不按'), h('span', null, '静静入库不丢')),
            ),
          ),
          h('header', { className: 'ilp-step-head' },
            h('span', { className: 'ilp-onb-num' }, '02 · 不按也不会丢'),
            h('h3', { className: 'ilp-onb-step-h' }, '4 条去向随手点或先跳过'),
          ),
          h('p', { className: 'ilp-onb-step-p' }, '忙着干活一个按钮都不按也没关系，卡片会自动去重存进下方「待分诊候选」。'),
        ),

        h('article', { className: 'ilp-onb-step' },
          h('div', { className: 'ilp-scene', 'aria-hidden': 'true' },
            h('div', { className: 'ilp-mini-chips' },
              h('span', { className: 'ilp-mini-chip pri' }, 'DSH 会话'),
              h('span', { className: 'ilp-mini-chip' }, 'Antigravity'),
              h('span', { className: 'ilp-mini-chip' }, 'Codex CLI'),
            ),
            h('div', { className: 'ilp-mini-meter-box' },
              h('div', { className: 'ilp-mini-step-meter' },
                h('span', { className: 'ilp-mini-label' }, '之前'),
                makeMasteryMeter(h, 1),
              ),
              h('div', { className: 'ilp-mini-step-meter' },
                h('span', { className: 'ilp-mini-label' }, '过关'),
                makeMasteryMeter(h, 4),
              ),
              h('span', { className: 'ilp-mini-muted' }, '回台账 3 分钟用人话答对升级'),
            ),
          ),
          h('header', { className: 'ilp-step-head' },
            h('span', { className: 'ilp-onb-num' }, '03 · 回台账集中复盘'),
            h('h3', { className: 'ilp-onb-step-h' }, '多端盲区汇总，答对才算会'),
          ),
          h('p', { className: 'ilp-onb-step-p' }, '不同 Agent 踩过的坑收进同一本台账；闲时点「3 分钟闯关」答对一次即升格。'),
        ),
      ),

      // 3. Interactive Split-Window Scene Simulator
      h('section', { className: 'ilp-onb-demo', 'data-testid': 'ilp-welcome-preview' },
        h('div', { className: 'ilp-onb-demo-head' },
          h('h3', { className: 'ilp-onb-step-h' }, '场景实景模拟器（点左侧卡片按钮或切换上方标签，零 Token）'),
          h('span', { className: 'ilp-onb-demo-sub' }, '左右对照：会话末尾卡片 vs 实际落盘结果'),
        ),
        h('div', {
          className: 'ilp-sim-tabs',
          role: 'tablist',
          'aria-label': '模拟对话卡片操作去向',
          focusgroup: 'tablist nomemory',
        },
          SIM_ORDER.map(function (modeKey) {
            var meta = SIM_MODES[modeKey]
            var selected = simMode === modeKey
            return h('button', {
              key: modeKey,
              type: 'button',
              role: 'tab',
              id: 'ilp-sim-tab-' + modeKey,
              'data-testid': 'ilp-sim-tab-' + modeKey,
              className: 'ilp-sim-tab',
              'aria-selected': selected ? 'true' : 'false',
              'aria-controls': 'ilp-sim-tabpanel',
              tabIndex: selected ? 0 : -1,
              focusgroupstart: selected ? '' : undefined,
              onClick: function () { setSimMode(modeKey) },
              onKeyDown: function (e) { handleTabKeyDown(modeKey, e) },
            }, meta.tabLabel)
          }),
        ),
        // [role="tabpanel"] stays strictly unstyled (no padding, borders, margins, backgrounds)
        h('div', {
          role: 'tabpanel',
          id: 'ilp-sim-tabpanel',
          'data-testid': 'ilp-sim-tabpanel',
          'aria-labelledby': 'ilp-sim-tab-' + simMode,
        },
          h('div', { className: 'ilp-sim-stage' },
            // Left: Mock Chat Conversation & 4-Line SHIELD Card
            h('div', { className: 'ilp-mock-win' },
              h('div', { className: 'ilp-mock-bar' },
                h('span', { className: 'ilp-mock-title' },
                  h('span', { className: 'ilp-mock-dot', 'aria-hidden': 'true' }),
                  '原生对话窗 · 回复末尾自动附带',
                ),
                h('span', { className: 'ilp-tag outline' }, '顺带私教卡片'),
              ),
              h('div', { className: 'ilp-mock-chat' },
                h('div', { className: 'ilp-mini-bubble' }, '列表滚动卡死已修好，主要改动在样式容器'),
                h('div', { className: 'ilp-mock-card' },
                  h('span', { className: 'ilp-card-title' }, 'flex:1 与 min-height:0 的配合'),
                  h('div', { className: 'ilp-mock-facts' },
                    h('div', null, h('strong', null, '为什么这么做'), 'Flex 子项默认 min-height: auto，补 min-height: 0 才允许内部滚动。'),
                    h('div', null, h('strong', null, '被排除方案'), '写死 height: 600px 在窄屏分屏下会导致双滚动条或裁切。'),
                  ),
                  h('div', { className: 'ilp-mock-probe' },
                    h('strong', { style: { marginRight: '6px' } }, '一句话摸底'),
                    '已经写了 overflow-y: auto，为什么还要补 min-height: 0？',
                  ),
                  h('div', { className: 'ilp-sim-acts' },
                    h('button', {
                      type: 'button',
                      className: 'ilp-sim-act-btn',
                      'data-testid': 'ilp-sim-btn-coach',
                      'data-active': simMode === 'coach' ? 'true' : 'false',
                      onClick: function () { setSimMode('coach') },
                    }, '右侧接招 90s'),
                    h('button', {
                      type: 'button',
                      className: 'ilp-sim-act-btn',
                      'data-testid': 'ilp-sim-btn-save',
                      'data-active': simMode === 'save' ? 'true' : 'false',
                      onClick: function () { setSimMode('save') },
                    }, '直接收入路线'),
                    h('button', {
                      type: 'button',
                      className: 'ilp-sim-act-btn',
                      'data-testid': 'ilp-sim-btn-dismiss',
                      'data-active': simMode === 'dismiss' ? 'true' : 'false',
                      onClick: function () { setSimMode('dismiss') },
                    }, '已掌握，收起'),
                  ),
                  h('div', { className: 'ilp-sim-idle-hint' },
                    h('span', null, '点击上方任意按钮预演，或：'),
                    h('button', {
                      type: 'button',
                      className: 'ilp-btn ghost xs',
                      'data-testid': 'ilp-sim-btn-idle',
                      onClick: function () { setSimMode('idle') },
                    }, simMode === 'idle' ? '当前正演示：三个都不按' : '切回演示：三个都不按'),
                  ),
                ),
              ),
            ),

            // Center Arrow
            h('div', { className: 'ilp-sim-conn', 'aria-hidden': 'true' },
              makeFlowArrowSvg(h, 18),
            ),

            // Right: Live Outcome Window
            h('div', { className: 'ilp-mock-win', 'data-testid': 'ilp-sim-outcome', 'data-mode': simMode },
              h('div', { className: 'ilp-mock-bar' },
                h('span', { className: 'ilp-mock-title' }, activeSim.winTag),
                h('span', { className: activeSim.badgeClass }, activeSim.badgeText),
              ),
              h('div', { className: 'ilp-outcome-panel' },
                h('div', { className: 'ilp-outcome-box' },
                  h('div', { className: 'ilp-outcome-k' }, activeSim.cardTitle),
                  h('p', { className: 'ilp-outcome-p' }, activeSim.cardDesc),
                ),
                h('div', { className: 'ilp-mock-facts' },
                  h('div', null, '1. ' + activeSim.bullet1),
                  h('div', null, '2. ' + activeSim.bullet2),
                ),
                h('div', { className: 'ilp-outcome-note' }, activeSim.footerNote),
              ),
            ),
          ),
        ),
      ),
    )
  }
}

// 2. Main Workbench (`main`, key: 'incidental-learn')
function makeWorkbenchComponent(React, ctx, bridge) {
  var EvidenceDialog = makeEvidenceDialog(React)
  var VisualGuide = makeVisualGuideComponent(React)

  return function IncidentalLearnWorkbench() {
    var h = React.createElement
    var stateTuple = React.useState(bridge.getState())
    var bridgeState = stateTuple[0]
    var setBridgeState = stateTuple[1]

    var triageOpenTuple = React.useState(false)
    var triageOpen = triageOpenTuple[0]
    var setTriageOpen = triageOpenTuple[1]

    var expandedTrackTuple = React.useState({ 'track-frontend': true })
    var expandedTracks = expandedTrackTuple[0]
    var setExpandedTracks = expandedTrackTuple[1]

    var courseOpenTuple = React.useState(false)
    var courseOpen = courseOpenTuple[0]
    var setCourseOpen = courseOpenTuple[1]

    var activeCourseTuple = React.useState(null)
    var activeCourse = activeCourseTuple[0]
    var setActiveCourse = activeCourseTuple[1]

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

    var autoOpenedTriageRef = React.useRef(false)

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

    var currentSnap = bridgeState.snapshot
    var currentStats = (currentSnap && currentSnap.stats) || { totalItems: 0 }
    var currentTriageLen = (currentSnap && currentSnap.triage && currentSnap.triage.length) || 0

    React.useEffect(function () {
      if (currentStats.totalItems === 0 && currentTriageLen > 0) {
        if (!autoOpenedTriageRef.current) {
          autoOpenedTriageRef.current = true
          setTriageOpen(true)
        }
      } else {
        autoOpenedTriageRef.current = false
      }
    }, [currentStats.totalItems, currentTriageLen])

    function showToast(text, canUndo) {
      setToast({ text: text, canUndo: !!canUndo })
    }

    function toggleTrack(id) {
      setExpandedTracks(function (prev) {
        var next = Object.assign({}, prev)
        next[id] = !prev[id]
        return next
      })
    }

    function handleLoadSamples() {
      bridge.runAction('load_sample_pack', {}).then(function () {
        setIsPreviewSamples(true)
        setGuideOpen(false)
        showToast('已载入多 Agent 演示样本', true)
      }).catch(function (err) {
        showToast('加载失败：' + err.message, false)
      })
    }

    function handleResetEmpty() {
      bridge.runAction('reset_empty', {}).then(function () {
        setIsPreviewSamples(false)
        setGuideOpen(false)
        setCourseOpen(false)
        setExportInfo(null)
        setTriageOpen(false)
        autoOpenedTriageRef.current = false
        showToast('已清空恢复空台账', true)
      }).catch(function () {})
    }

    function handleStartDeepDrill(item) {
      if (!item) return
      openDeepLearnSession(ctx, item).catch(function (err) {
        showToast('打开闯关会话失败：' + err.message, false)
      })
    }

    function handleTriageOne(id, decision) {
      bridge.runAction('triage_item', { id: id, decision: decision }).then(function (res) {
        showToast(decision === 'accept' ? '已收入能力路线' : '已略过该候选', !!(res && res.snapshot && res.snapshot.canUndo))
      }).catch(function (err) {
        showToast('操作失败：' + err.message, false)
      })
    }

    function handleTriageBatch(mode) {
      bridge.runAction('triage_batch', { mode: mode }).then(function (res) {
        var count = (res && res.affected) || 0
        showToast(mode === 'accept_all' ? ('已一键收入 ' + count + ' 条候选') : ('已清理 ' + count + ' 条低价值候选'), true)
      }).catch(function (err) {
        showToast('批量处理失败：' + err.message, false)
      })
    }

    function handleBuildCourse() {
      if (courseOpen) {
        setCourseOpen(false)
        return
      }
      bridge.runAction('build_course', {}).then(function (res) {
        setActiveCourse((res && res.course) || null)
        setCourseOpen(true)
      }).catch(function (err) {
        showToast('编排失败：' + err.message, false)
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
          h('div', { className: 'ilp-eyebrow' }, 'SHIELD · 跨 AGENT 技能内化台账'),
          h('h1', { className: 'ilp-h1' }, '顺带私教'),
          bridgeState.error
            ? h('div', { className: 'ilp-empty-card' },
                h('p', null, '读取账本失败：' + bridgeState.error),
                h('button', {
                  type: 'button',
                  className: 'ilp-btn line sm',
                  onClick: function () { bridge.refresh(true).catch(function () {}) },
                }, '重试'),
              )
            : h('p', { className: 'ilp-summary' }, '正在同步本地账本…'),
        ),
      )
    }

    var stats = snap.stats || { masteredItems: 0, totalItems: 0, trackCount: 3, triageCount: 0 }
    var tracks = snap.tracks || []
    var triage = snap.triage || []
    var spotlight = snap.spotlight
    var isCompletelyEmpty = stats.totalItems === 0 && triage.length === 0

    return h('div', { className: 'ilp-wb', 'data-testid': 'ilp-workbench' },
      h('div', { className: 'ilp-wb-inner' },
        // Calm Header
        h('header', { className: 'ilp-header' },
          h('div', { className: 'ilp-toprow' },
            h('span', { className: 'ilp-eyebrow' }, 'SHIELD · 跨 AGENT 技能内化台账'),
            h('div', { className: 'ilp-header-acts' },
              stats.totalItems > 0 ? h('button', {
                type: 'button',
                className: 'ilp-btn line sm',
                onClick: handleBuildCourse,
              }, courseOpen ? '收起 15 分钟闯关课' : '15 分钟闯关课') : null,
              stats.totalItems > 0 ? h('button', {
                type: 'button',
                className: 'ilp-btn line sm',
                onClick: handleExportNotes,
              }, '导出学习笔记') : null,
              !isCompletelyEmpty ? h('button', {
                type: 'button',
                className: 'ilp-btn ghost sm',
                onClick: handleResetEmpty,
              }, '清空') : null,
            ),
          ),
          h('div', { className: 'ilp-title-row' },
            h('h1', { className: 'ilp-h1' }, '顺带私教'),
            h('span', { className: 'ilp-summary' },
              '已内化 ' + stats.masteredItems + ' / ' + stats.totalItems + ' 项 · ' + stats.trackCount + ' 条路线 · 待分诊 ' + stats.triageCount + ' 条',
            ),
            !isCompletelyEmpty ? h('button', {
              type: 'button',
              className: guideOpen ? 'ilp-btn line xs' : 'ilp-btn soft xs',
              'data-testid': 'ilp-toggle-guide-btn',
              'aria-expanded': guideOpen ? 'true' : 'false',
              onClick: function () { setGuideOpen(function (v) { return !v }) },
            }, guideOpen ? '收起图解' : '机制图解') : null,
          ),
        ),

        isPreviewSamples && stats.totalItems > 0 ? h('div', { className: 'ilp-preview-banner', 'data-testid': 'ilp-preview-banner' },
          h('span', null, '当前展示的是示例账本（不耗 Token）。体验完随时恢复 0/0 空台账，再在平时对话里慢慢攒自己的盲区。'),
          h('button', {
            type: 'button',
            className: 'ilp-btn line xs',
            'data-testid': 'ilp-clear-preview-btn',
            onClick: handleResetEmpty,
          }, '清空示例，恢复空台账'),
        ) : null,

        // Visual Onboarding / On-Demand Mechanism Guide
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

        stats.totalItems === 0 && triage.length > 0 ? h('div', { className: 'ilp-onb-triage-tip', 'data-testid': 'ilp-empty-triage-tip' },
          '能力路线目前 0 条，但下面已自动帮你接住对话里出现的候选取舍：点「收入路线」就正式开始追踪，点「略过」则直接清掉。',
        ) : null,

        // Single Spotlight Hero Card
        spotlight ? h('section', { className: 'ilp-spot-card', 'data-testid': 'ilp-spotlight' },
          h('div', { className: 'ilp-spot-main' },
            h('div', { className: 'ilp-spot-eyebrow' },
              h('span', { className: 'ilp-tag wait' }, '今日头号盲区'),
              sourceTag(h, spotlight.source),
              epistemicTag(h, spotlight.epistemic),
              makeMasteryMeter(h, spotlight.masteryTier),
            ),
            h('div', { className: 'ilp-spot-title' }, spotlight.title),
            spotlight.why ? h('p', { className: 'ilp-spot-desc' }, spotlight.why) : null,
            spotlight.probe ? h('div', { className: 'ilp-spot-probe' },
              h('span', { className: 'ilp-shield-k', style: { marginRight: '6px' } }, '一句话摸底'),
              spotlight.probe,
            ) : null,
          ),
          h('div', { className: 'ilp-spot-acts' },
            h('button', {
              type: 'button',
              className: 'ilp-btn solid',
              'data-testid': 'ilp-start-deep-learn',
              onClick: function () { handleStartDeepDrill(spotlight) },
            }, '开始 3 分钟闯关'),
            h('button', {
              type: 'button',
              className: 'ilp-btn line sm',
              'data-testid': 'ilp-open-evidence-modal',
              onClick: function () { setModalItem(spotlight) },
            }, '看底牌解析'),
          ),
        ) : null,

        // 1-Line Default-Collapsed Triage Inbox
        triage.length > 0 ? h('section', { className: 'ilp-triage-box', 'data-testid': 'ilp-triage-box' },
          h('button', {
            type: 'button',
            className: 'ilp-triage-head',
            'aria-expanded': triageOpen ? 'true' : 'false',
            'data-testid': 'ilp-triage-toggle',
            onClick: function () { setTriageOpen(!triageOpen) },
          },
            h('span', { className: 'ilp-triage-head-left' },
              h('span', { className: 'ilp-tag ' + (snap.triageOverCap ? 'wait' : 'outline') }, '待分诊候选 · ' + triage.length + ' 条'),
              h('span', { className: 'ilp-summary' }, snap.triageOverCap ? '候选超过 5 条，建议批量收口防止死队列' : '来自各 Agent 的取舍候选，确认后再正式入账'),
            ),
            h('span', { className: 'ilp-btn ghost xs' }, triageOpen ? '收起' : '展开分诊'),
          ),
          triageOpen ? h('div', { className: 'ilp-triage-body' },
            triage.length > 5 ? h('div', { className: 'ilp-triage-batch', 'data-testid': 'ilp-triage-batch' },
              h('span', { style: { fontSize: '12px', fontWeight: 600 } }, '收件箱防积灰提醒：当前 ' + triage.length + ' 条待分诊'),
              h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
                h('button', {
                  type: 'button',
                  className: 'ilp-btn line xs',
                  'data-testid': 'ilp-batch-sweep-low',
                  onClick: function () { handleTriageBatch('sweep_low_value') },
                }, '清理低价值候选'),
                h('button', {
                  type: 'button',
                  className: 'ilp-btn solid xs',
                  'data-testid': 'ilp-batch-accept-all',
                  onClick: function () { handleTriageBatch('accept_all') },
                }, '一键收入对应路线'),
              ),
            ) : null,
            triage.map(function (cand) {
              return h('div', { key: cand.id, className: 'ilp-triage-row', 'data-testid': 'ilp-triage-row-' + cand.id },
                h('div', { className: 'ilp-triage-info' },
                  h('div', { className: 'ilp-item-badges' },
                    sourceTag(h, cand.source),
                    epistemicTag(h, cand.epistemic),
                    cand.lowValue ? h('span', { className: 'ilp-tag outline' }, '低价值微调') : null,
                  ),
                  h('div', { className: 'ilp-triage-title' }, cand.title),
                  cand.why ? h('div', { className: 'ilp-triage-why' }, cand.why) : null,
                ),
                h('div', { className: 'ilp-triage-acts' },
                  h('button', {
                    type: 'button',
                    className: 'ilp-btn line xs',
                    'data-testid': 'ilp-triage-accept-' + cand.id,
                    onClick: function () { handleTriageOne(cand.id, 'accept') },
                  }, '收入路线'),
                  h('button', {
                    type: 'button',
                    className: 'ilp-btn ghost xs',
                    'data-testid': 'ilp-triage-skip-' + cand.id,
                    onClick: function () { handleTriageOne(cand.id, 'skip') },
                  }, '略过'),
                ),
              )
            }),
          ) : null,
        ) : null,

        // Optional 15-Minute Micro-Course View
        courseOpen && activeCourse ? h('section', { className: 'ilp-course-box', 'data-testid': 'ilp-course-box' },
          h('div', { className: 'ilp-toprow' },
            h('div', null,
              h('span', { className: 'ilp-tag run' }, '15 分钟闯关课'),
              h('span', { style: { fontWeight: 600, marginLeft: '8px' } }, activeCourse.trackTitle + ' · 3 站串联'),
            ),
            activeCourse.stations && activeCourse.stations[0] ? h('button', {
              type: 'button',
              className: 'ilp-btn solid xs',
              onClick: function () {
                var targetId = activeCourse.stations[0].itemId
                var found = (snap.items || []).find(function (x) { return x.id === targetId }) || spotlight
                if (found) handleStartDeepDrill(found)
              },
            }, '从第 1 站开练') : null,
          ),
          h('div', { className: 'ilp-course-grid' },
            (activeCourse.stations || []).map(function (st) {
              return h('div', { key: String(st.station), className: 'ilp-station' },
                h('div', { className: 'ilp-tag outline' }, '第 ' + st.station + ' 站 · ' + st.durationMin + ' 分钟'),
                h('div', { style: { fontWeight: 600, fontSize: '13px' } }, st.title),
                h('div', { style: { fontSize: '12px', color: 'var(--ilp-ink2)' } }, st.focus + ' · ' + st.masteryLabel),
              )
            }),
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

        // Accordion Capability Tracks (Track 1 open by default; 2 & 3 collapsed)
        tracks.length > 0 && !isCompletelyEmpty ? h('section', { className: 'ilp-tracks', 'data-testid': 'ilp-tracks' },
          h('div', { className: 'ilp-section-label' }, '能力路线账本（4 格掌握度 + 可查过关证据）'),
          tracks.map(function (track) {
            var isOpen = !!expandedTracks[track.id]
            return h('div', { key: track.id, className: 'ilp-track', 'data-testid': 'ilp-track-' + track.id },
              h('button', {
                type: 'button',
                className: 'ilp-track-head',
                'aria-expanded': isOpen ? 'true' : 'false',
                onClick: function () { toggleTrack(track.id) },
              },
                h('div', { className: 'ilp-track-meta' },
                  h('span', { className: 'ilp-track-title' }, track.title),
                  track.subtitle ? h('span', { className: 'ilp-track-sub' }, track.subtitle) : null,
                ),
                h('div', { className: 'ilp-track-right' },
                  h('span', { className: 'ilp-tag ' + (track.masteredCount >= track.totalCount && track.totalCount > 0 ? 'ok' : 'outline') },
                    track.masteredCount + ' / ' + track.totalCount + ' 已内化',
                  ),
                  h('span', { style: { fontSize: '12px', color: 'var(--ilp-ink3)' } }, isOpen ? '收起' : '展开'),
                ),
              ),
              isOpen ? h('div', { className: 'ilp-track-list' },
                track.items.length === 0
                  ? h('div', { className: 'ilp-item-row' },
                      h('span', { className: 'ilp-summary' }, '该路线暂无条目，可在会话底牌点「直接收入路线」或从待分诊候选收入。'),
                    )
                  : track.items.map(function (item) {
                      return h('div', { key: item.id, className: 'ilp-item-row', 'data-testid': 'ilp-item-' + item.id },
                        h('div', { className: 'ilp-item-main' },
                          h('div', { className: 'ilp-item-badges' },
                            sourceTag(h, item.source),
                            epistemicTag(h, item.epistemic),
                            makeMasteryMeter(h, item.masteryTier),
                          ),
                          h('button', {
                            type: 'button',
                            className: 'ilp-item-title',
                            onClick: function () { setModalItem(item) },
                          }, item.title),
                          item.evidenceSummary ? h('p', { className: 'ilp-item-evidence' }, item.evidenceSummary) : null,
                        ),
                        h('div', { className: 'ilp-item-acts' },
                          h('button', {
                            type: 'button',
                            className: 'ilp-btn line xs',
                            onClick: function () { setModalItem(item) },
                          }, '过关证据'),
                          h('button', {
                            type: 'button',
                            className: 'ilp-btn soft xs',
                            onClick: function () { handleStartDeepDrill(item) },
                          }, '闯关'),
                        ),
                      )
                    }),
              ) : null,
            )
          }),
        ) : null,

        // Undo Toast
        toast ? h('div', { className: 'ilp-toast', role: 'status', 'data-testid': 'ilp-toast' },
          h('span', null, toast.text),
          toast.canUndo ? h('button', {
            type: 'button',
            'data-testid': 'ilp-toast-undo',
            onClick: handleUndo,
          }, '撤销') : null,
          h('button', {
            type: 'button',
            onClick: function () { setToast(null) },
          }, '关闭'),
        ) : null,
      ),

      h(EvidenceDialog, {
        item: modalItem,
        onClose: function () { setModalItem(null) },
        onStartDrill: handleStartDeepDrill,
      }),
    )
  }
}

// 3a. Markdown Fence: `shield` (4-Line Decision Card)
function makeShieldFenceComponent(React, ctx, bridge, coachStore) {
  return function ShieldFence(props) {
    var h = React.createElement
    var snapTuple = React.useState(bridge.getState())
    var bridgeState = snapTuple[0]
    var setBridgeState = snapTuple[1]

    var expandedOverrideTuple = React.useState(false)
    var expandedOverride = expandedOverrideTuple[0]
    var setExpandedOverride = expandedOverrideTuple[1]

    var feedbackTuple = React.useState(null)
    var feedback = feedbackTuple[0]
    var setFeedback = feedbackTuple[1]

    var isStreaming = Boolean(props && props.streaming)
    var parsed = isStreaming ? null : parseShieldFence(props && props.code)
    var cardKey = parsed ? hashCardKey(parsed, (props && props.sessionId) || '') : ''
    var snap = bridgeState.snapshot || null
    var dismissedList = (snap && snap.dismissedCardKeys) || []
    var autoCapturedList = (snap && snap.autoCapturedKeys) || []
    var isDismissed = !!(parsed && !expandedOverride && dismissedList.indexOf(cardKey) >= 0)

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

    if (isStreaming) {
      return h('div', { className: 'ilp-fence' },
        h('div', { className: 'ilp-card streaming', 'data-testid': 'ilp-shield-streaming' },
          h('span', { className: 'ilp-summary' }, '顺带私教 · 正在整理本轮决策底牌…'),
          h('span', { className: 'ilp-tag outline' }, 'SHIELD'),
        ),
      )
    }

    if (!parsed) {
      return (props && props.children) || null
    }

    if (isDismissed) {
      return h('div', { className: 'ilp-fence' },
        h('div', { className: 'ilp-card collapsed' },
          h('span', { className: 'ilp-summary' }, '决策底牌已掌握收起：' + parsed.title),
          h('button', {
            type: 'button',
            className: 'ilp-btn ghost xs',
            onClick: function () {
              setExpandedOverride(true)
              bridge.runAction('dismiss_card', { cardKey: cardKey, title: parsed.title, restore: true }).catch(function () {})
            },
          }, '展开'),
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
        setFeedback('右侧栏服务未就绪')
      }
    }

    function handleSaveDirect() {
      AUTO_CAPTURED_KEYS.add(cardKey)
      bridge.runAction('save_explicit', {
        payload: Object.assign({}, parsed, { epistemic: 'explicit' }),
      }).then(function (res) {
        if (res && res.created === false) {
          setFeedback('该条已在能力路线中')
        } else {
          setFeedback('已直接收入能力路线')
        }
      }).catch(function (err) {
        setFeedback('收入失败：' + err.message)
      })
    }

    function handleDismiss() {
      setExpandedOverride(false)
      AUTO_CAPTURED_KEYS.add(cardKey)
      bridge.runAction('dismiss_card', { cardKey: cardKey, title: parsed.title, restore: false }).catch(function () {})
    }

    return h('div', { className: 'ilp-fence' },
      h('article', { className: 'ilp-card', 'data-testid': 'ilp-shield-card', 'data-card-key': cardKey },
        h('div', { className: 'ilp-card-head' },
          h('span', { className: 'ilp-card-title' }, parsed.title),
          h('div', { className: 'ilp-item-badges' },
            h('span', { className: 'ilp-tag outline' }, '决策底牌'),
            sourceTag(h, parsed.source),
            epistemicTag(h, parsed.epistemic),
          ),
        ),
        h('div', { className: 'ilp-shield-grid' },
          h('div', { className: 'ilp-shield-row' },
            h('span', { className: 'ilp-shield-k' }, '为什么这么做'),
            h('span', { className: 'ilp-shield-v' }, parsed.why),
          ),
          h('div', { className: 'ilp-shield-row' },
            h('span', { className: 'ilp-shield-k' }, '被排除的差方案'),
            h('span', { className: 'ilp-shield-v' }, parsed.rejected),
          ),
          h('div', { className: 'ilp-shield-probe' },
            h('span', { className: 'ilp-shield-k', style: { marginRight: '6px' } }, '一句话摸底'),
            parsed.probe,
          ),
        ),
        h('div', { className: 'ilp-card-acts' },
          h('button', {
            type: 'button',
            className: 'ilp-btn solid sm',
            'data-testid': 'ilp-shield-coach-btn',
            onClick: handleOpenCoach,
          }, '右侧接招 90s'),
          h('button', {
            type: 'button',
            className: 'ilp-btn line sm',
            'data-testid': 'ilp-shield-capture-btn',
            onClick: handleSaveDirect,
          }, '直接收入路线'),
          h('button', {
            type: 'button',
            className: 'ilp-btn ghost sm',
            'data-testid': 'ilp-shield-dismiss-btn',
            onClick: handleDismiss,
          }, '已掌握，收起'),
          feedback ? h('span', { className: 'ilp-status-note', 'data-testid': 'ilp-shield-feedback' }, feedback) : null,
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
          h('div', { className: 'ilp-item-badges' },
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
          h('span', { className: 'ilp-tag ok' }, '闯关过关 · 掌握度升格'),
        ),
        h('div', { className: 'ilp-item-badges' },
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
          }, '回顺带私教看路线'),
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
          h('div', { className: 'ilp-card-title' }, '90s 小灶'),
          h('p', { className: 'ilp-summary' }, '从对话中的决策底牌卡点「右侧接招 90s」，即可在这里完成单轮盲测点拨，不打断主对话草稿。'),
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
          h('span', { className: 'ilp-tag ok' }, '90s 小灶 · 不扰主对话'),
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
          h('div', { className: 'ilp-item-badges' },
            h('span', { className: 'ilp-tag ' + (drillResult.correct ? 'ok' : 'wait') },
              drillResult.correct ? '判断命中' : '盲区点拨',
            ),
            makeMasteryMeter(h, drillResult.toTier || (drillResult.correct ? 3 : 2)),
          ),
          h('p', null, drillResult.feedback || (chosenOpt && chosenOpt.feedback) || card.why),
          h('div', { className: 'ilp-card-acts' },
            h('button', {
              type: 'button',
              className: 'ilp-btn line xs',
              onClick: function () { openDeepLearnSession(ctx, card).catch(function () {}) },
            }, '转去 3 分钟专心闯关'),
            h('button', {
              type: 'button',
              className: 'ilp-btn ghost xs',
              onClick: function () {
                var layout = getHostService(ctx, 'layout')
                if (layout && typeof layout.selectPanel === 'function') layout.selectPanel(PANEL_KEY)
              },
            }, '回账本看进度'),
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
    }, '顺带私教 · ' + count + ' 待消化')
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
        title: function () { return '90s 小灶' },
        guide: [{
          id: 'incidental-learn-coach-guide',
          order: 95,
          title: function () { return '顺带私教 · 90s 小灶' },
          description: function () { return '不打断主对话的单轮盲测点拨' },
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
      ['learn_save', { preparing: '准备保存盲区…', start: '正在记入顺带私教…', result: '已明存进个人能力路线' }],
      ['learn_checkpoint', { preparing: '准备归档过关证据…', start: '正在记录过关掌握度…', result: '过关证据与掌握度已写入账本' }],
      ['learn_triage', { preparing: '准备整理候选收件箱…', start: '正在分诊待消化候选…', result: '待分诊队列已更新' }],
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
