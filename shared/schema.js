// Shared constants, defaults, resilient fence parsers, and starter prompts for
// @oxmumu3/dsh-incidental-learn (`顺带私教`).
// Pure functions only — safe to bundle directly into browser `client.js` (with `export ` stripped).

export const PANEL_KEY = 'incidental-learn'
export const COACH_TAB_ID = '@oxmumu3/dsh-incidental-learn/coach'
export const COACH_TAB_KIND = 'incidental-learn-coach'
export const MAX_AUTO_TRIAGE = 8
export const MAX_DIRECT_UNREAD = 3

export const SOURCES = ['dsh-chat', 'antigravity', 'codex', 'superagent-review', 'manual']
export const EPISTEMIC_STATES = ['verified', 'explicit', 'inferred']
export const MASTERY_TIERS = [1, 2, 3, 4]

export const SOURCE_META = {
  'dsh-chat': { label: 'DSH 会话', shortLabel: 'DSH' },
  antigravity: { label: 'Antigravity', shortLabel: 'AGY' },
  codex: { label: 'Codex', shortLabel: 'Codex' },
  'superagent-review': { label: 'Super Agent 打回', shortLabel: '打回' },
  manual: { label: '手动录入', shortLabel: '手动' },
}

export const EPISTEMIC_META = {
  verified: { label: '已核实源码' },
  explicit: { label: '本人明存' },
  inferred: { label: '推断候选' },
}

export const MASTERY_LABELS = {
  1: '1/4 攒下了',
  2: '2/4 讲过一轮',
  3: '3/4 能复述',
  4: '4/4 能接住追问',
}

export const DEFAULT_TRACKS = [
  {
    id: 'track-frontend',
    title: '前端与界面体验',
    subtitle: '自适应布局、原生组件、明暗主题与交互细节',
    order: 1,
  },
  {
    id: 'track-engineering',
    title: '架构与工程实践',
    subtitle: '接口边界、读写安全、并发控制与性能取舍',
    order: 2,
  },
  {
    id: 'track-ai',
    title: 'AI 与 Agent 协作',
    subtitle: '提示词结构、上下文省流、工具设计与多端配合',
    order: 3,
  },
  {
    id: 'track-product',
    title: '产品与增长策略',
    subtitle: '首次上手路径、信息层级、表达结构与分发转化',
    order: 4,
  },
]

export const STARTER_SAMPLE_PACK = {
  tracks: DEFAULT_TRACKS,
  items: [
    {
      id: 'item-container-cascade',
      trackId: 'track-frontend',
      title: '容器查询必须在基础多列规则之后声明',
      source: 'superagent-review',
      epistemic: 'verified',
      masteryTier: 2,
      why: '@container 本身不增加选择器权重；写在基础 repeat(2, 1fr) 规则之后，才能在 390px 分屏下真正覆写成单列。',
      rejected: '用全局 @media(max-width:768px) 猜测面板宽度（宿主分屏时窗口虽宽，插件面板容器其实已变窄）。',
      probe: '如果把 @container (max-width: 580px) { grid-template-columns: 1fr } 写在双列网格之前，390px 下还会变成单列吗？',
      evidenceSummary: '在分屏窄栏场景中独立核对 @container 与基础规则先后顺序，待完成一次跨项目追问。',
      priority: 100,
      quiz: {
        question: 'DSH 右侧栏只占 420px，而桌面端窗口宽度有 1440px。为什么这里不能靠 @media (max-width: 600px) 切换单列？',
        options: [
          {
            key: 'A',
            label: '@media 只看整窗视口，1440px 窗口里它永远不触发',
            correct: true,
            feedback: '准确。宿主侧栏与分屏是内部容器变窄，必须由父元素设 container-type: inline-size 并用后置 @container 响应自身可用宽度。',
          },
          {
            key: 'B',
            label: 'Electron 里的 Chromium 不支持 @media 查询',
            correct: false,
            feedback: 'Electron 支持 @media，问题在于 @media 量的是整个窗口尺寸，量不到插件格子的真实宽度。',
          },
          {
            key: 'C',
            label: '应该改用 CSS overflow-x: auto 硬藏溢出',
            correct: false,
            feedback: '横向滚动会把卡片按钮挤出视野，属于掩盖布局崩坏。',
          },
        ],
      },
    },
    {
      id: 'item-native-dialog-modal',
      trackId: 'track-frontend',
      title: '原生 <dialog> 的 [open] 显隐作用域与防穿透滚动',
      source: 'antigravity',
      epistemic: 'verified',
      masteryTier: 4,
      why: '将 display: flex 限定在 dialog[open] 才不会破坏原生关闭态；closedby="any" 搭配 ::backdrop 的 overflow: hidden 与 :modal 的 overscroll-behavior: contain 可原生拦截滚动穿透。',
      rejected: '用 div + z-index: 9999 手搓弹窗并修改 body.style.overflow（在宿主嵌套滚动容器内易造成图层错位与滚轮逃逸）。',
      probe: '为什么不能直接在 dialog 选择器上无条件写 display: flex，同时也不推荐手动给 html 加 overflow: hidden？',
      evidenceSummary: '在顺带私教证据窗与 modern-web-guidance 核验中准确说出 dialog[open] 作用域及 ::backdrop 滚动容器原理。',
      priority: 70,
    },
    {
      id: 'item-fence-vs-foldturns',
      trackId: 'track-ai',
      title: '把长期要回看的学习卡放进正文自定义围栏，而不是塞进工具折叠区',
      source: 'dsh-chat',
      epistemic: 'verified',
      masteryTier: 3,
      why: '助手在回合结束后通常会把 tool call 过程头折叠收起；放在正文自定义围栏里既不抢主正文风头，还能脱离单次调用常驻留存。',
      rejected: '把每次回合结束的顺带学习卡做成一次 tool call（每轮多花一次工具往返，还容易随着过程记录一起折起来）。',
      probe: '什么适合做成正文里的持久学习卡，什么更适合留作后台动作的工具回执？',
      evidenceSummary: '对比过过程区自动折叠和正文自定义围栏的展示差异，能说清两者的边界。',
      priority: 85,
    },
    {
      id: 'item-atomic-mtime-ledger',
      trackId: 'track-engineering',
      title: '多端共享 JSON 账本前先比对 mtimeMs 再原子 rename 落盘',
      source: 'codex',
      epistemic: 'verified',
      masteryTier: 2,
      why: '桌面插件与外部命令行可能同时读写同一份 ledger.json；写入前比对文件修改时间重新合并，再通过临时文件 rename 原子替换，才能防并发覆盖。',
      rejected: '启动时把文件整份缓存在内存里直接 writeFileSync 覆盖，或为此引入重型数据库依赖。',
      probe: '如果外部命令行刚塞入一条新卡片，桌面端不做 mtimeMs 校验就直接写盘会发生什么？',
      evidenceSummary: '已演练过双进程并发写盘的竞态保护，待在真实多端联动里验证一次。',
      priority: 92,
    },
    {
      id: 'item-wechat-search-firstscreen',
      trackId: 'track-product',
      title: '冷启动图文卡片与熟人长文的首屏信息结构差异',
      source: 'manual',
      epistemic: 'explicit',
      masteryTier: 3,
      why: '熟人订阅长文靠共鸣铺垫；公开信息流或搜索卡片依赖首屏前两秒用结构化利益点抓人，不能把长段落裁图硬塞。',
      rejected: '把长文直接截成白底密字长图发进信息流（首屏看不出价值，划走率高）。',
      probe: '面向老读者发长文和面向新用户发卡片，首屏第一眼各自最该放什么？',
      evidenceSummary: '对比大段说明文与三步图文流程卡后，能独立把首屏核心价值收在两秒可读范围内。',
      priority: 65,
    },
  ],
  triage: [
    {
      id: 'cand-draft-guard-lexical',
      trackId: 'track-frontend',
      title: '点卡片快捷选项自动发送前，必须先检查输入框是否已有未发送草稿',
      source: 'dsh-chat',
      epistemic: 'inferred',
      why: '用户可能正在输入框写长段话，直接替用户提交会覆盖未发送的心血。',
      rejected: '点击选择题卡片后不检查草稿状态直接覆写并提交。',
      probe: '输入框已有草稿时，点击卡片按钮应该触发哪两步保护？',
      lowValue: false,
    },
    {
      id: 'cand-sidebar-right-id-kind',
      trackId: 'track-engineering',
      title: '插件插槽注册 ID 与按 kind 打开抽屉必须一一对应',
      source: 'superagent-review',
      epistemic: 'verified',
      why: '插槽定义表和侧栏激活接口往往分别按 id 和 kind 索引，混写会在打开侧栏时静音失败。',
      rejected: '凭直觉把槽位 key 与打开参数硬传成同一字符串。',
      probe: '当点击按钮开侧栏没报错却没反应时，最该先查哪两个注册字段？',
      lowValue: false,
    },
    {
      id: 'cand-optional-schema-no-false',
      trackId: 'track-ai',
      title: '工具可选参数应省略在 required 数组外，避免写 required: false',
      source: 'codex',
      epistemic: 'verified',
      why: 'JSON Schema 2020-12 要求 required 是父对象的字符串数组，字段内写 required: false 会让模型工具注册校验失败。',
      rejected: '按旧表单习惯在字段定义对象里写 { type: "string", required: false }。',
      probe: '给大模型暴露一个可选字符串入参时，正确的 Schema 结构怎么写？',
      lowValue: false,
    },
    {
      id: 'cand-prompt-kv-cache',
      trackId: 'track-ai',
      title: '常驻系统提示词必须保持前缀静止与严格字节预算，动态内容按需走工具读取',
      source: 'antigravity',
      epistemic: 'verified',
      why: '把不断变化的个人账本直接塞进系统提示词前缀，每轮都会击穿模型 KV Cache；保持前缀不变、查账本走工具才省钱又低延迟。',
      rejected: '每次对话把用户所有历史盲区拼进 system prompt。',
      probe: '为什么个人积累的卡片越多，系统提示词前缀越不能跟着变长？',
      lowValue: false,
    },
    {
      id: 'cand-routine-typo-log',
      trackId: 'track-frontend',
      title: '临时调试日志清理：删掉开发阶段 console.debug',
      source: 'codex',
      epistemic: 'inferred',
      why: '顺手清理构建前残留的打印语句，无长期架构取舍价值。',
      rejected: '保留冗余调试输出。',
      probe: '常规脚本小改需要沉淀进技能账本吗？',
      lowValue: true,
    },
    {
      id: 'cand-rename-readme-heading',
      trackId: 'track-product',
      title: '文档格式微调：统一 README 二级标题序号格式',
      source: 'manual',
      epistemic: 'inferred',
      why: '纯排版习惯调整，不涉及设计决策冲突。',
      rejected: '混用数字序号与无序列表。',
      probe: '何时应该主动清理此类低价值待分诊条目？',
      lowValue: true,
    },
  ],
}

export function normalizeSource(src) {
  return SOURCES.includes(src) ? src : 'manual'
}

export function normalizeEpistemic(state) {
  return EPISTEMIC_STATES.includes(state) ? state : 'inferred'
}

export function clampTier(tier) {
  const n = Number(tier)
  if (!Number.isFinite(n)) return 1
  return Math.max(1, Math.min(4, Math.round(n)))
}

export function cleanText(value, maxLen = 1000) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed
}

function tryParseJsonObject(raw) {
  if (!raw || typeof raw !== 'string') return null
  const text = raw.trim()
  if (!text) return null
  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
  } catch {
    // Fall back to balanced brace slice if model added minor surrounding commentary.
  }
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      const sliced = JSON.parse(text.slice(start, end + 1))
      if (sliced && typeof sliced === 'object' && !Array.isArray(sliced)) return sliced
    } catch {
      return null
    }
  }
  return null
}

function buildDefaultQuiz(title, why, rejected, probe) {
  const safeWhy = cleanText(why, 160) || cleanText(title, 120)
  const safeRejected = cleanText(rejected, 140) || '沿用表面修补或一次性硬编码做法'
  return {
    question: cleanText(probe, 240) || `关于「${cleanText(title, 80)}」，以下哪项判断最抓住了核心取舍？`,
    options: [
      {
        key: 'A',
        label: safeRejected,
        correct: false,
        feedback: `这是被排除的差方案：在当前边界下会埋下隐患。核心原因是：${safeWhy}`,
      },
      {
        key: 'B',
        label: safeWhy,
        correct: true,
        feedback: `判断准确！你抓住了这次关键取舍的底层边界：${safeWhy}`,
      },
      {
        key: 'C',
        label: '两种做法本质等效，以后碰到再说',
        correct: false,
        feedback: `在当前约束下并非等效，忽视差异会带来返工。再对照一下核心依据：${safeWhy}`,
      },
    ],
  }
}

export function sanitizeQuizBlock(rawQuiz, fallbackTitle = '', fallbackWhy = '', fallbackRejected = '', fallbackProbe = '') {
  if (!rawQuiz || typeof rawQuiz !== 'object') {
    return buildDefaultQuiz(fallbackTitle, fallbackWhy, fallbackRejected, fallbackProbe)
  }
  const question = cleanText(rawQuiz.question, 300)
  const rawOptions = Array.isArray(rawQuiz.options) ? rawQuiz.options : []
  const options = rawOptions
    .filter(opt => opt && typeof opt === 'object' && cleanText(opt.label || opt.text, 240))
    .slice(0, 4)
    .map((opt, idx) => ({
      key: cleanText(opt.key, 8) || String.fromCharCode(65 + idx),
      label: cleanText(opt.label || opt.text, 240),
      detail: cleanText(opt.detail, 260),
      correct: Boolean(opt.correct),
      feedback: cleanText(opt.feedback, 320),
    }))
  if (!question || options.length < 2) {
    return buildDefaultQuiz(fallbackTitle, fallbackWhy, fallbackRejected, fallbackProbe)
  }
  return { question, options }
}

export function parseShieldFence(code) {
  const raw = cleanText(code, 12000)
  if (!raw) return null
  const json = tryParseJsonObject(raw)
  if (json) {
    const title = cleanText(json.title || json.topic || json.summary, 160)
    const why = cleanText(json.why || json.reason || json.whyThis, 420)
    const rejected = cleanText(json.rejected || json.excluded || json.alternative, 420)
    const probe = cleanText(json.probe || json.question || json.check, 320)
    if (!why && !rejected && !probe) return null
    const finalTitle = title || why.slice(0, 42) || '本轮关键工程取舍'
    return {
      id: cleanText(json.id, 80) || '',
      title: finalTitle,
      why: why || '已基于当前项目边界做出取舍。',
      rejected: rejected || '已排除高维护成本或脆弱实现方案。',
      probe: probe || `关于「${finalTitle}」，换到另一处模块时会不会遇到同样的边界？`,
      trackId: cleanText(json.trackId, 60) || 'track-engineering',
      source: normalizeSource(json.source || 'dsh-chat'),
      epistemic: normalizeEpistemic(json.epistemic || 'inferred'),
      quiz: sanitizeQuizBlock(json.quiz, finalTitle, why, rejected, probe),
    }
  }

  // Human-readable 4-line SHIELD block fallback
  const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  let title = ''
  let why = ''
  let rejected = ''
  let probe = ''
  for (const line of lines) {
    const cleaned = line.replace(/^[-*•\s]+/, '').replace(/\*\*/g, '')
    if (/^(?:为什么这么做|Why|核心原因)[：:]/i.test(cleaned)) {
      why = cleaned.replace(/^(?:为什么这么做|Why|核心原因)[：:]\s*/i, '')
    } else if (/^(?:被排除的差方案|被排除方案|避开的坑|Rejected|排除方案)[：:]/i.test(cleaned)) {
      rejected = cleaned.replace(/^(?:被排除的差方案|被排除方案|避开的坑|Rejected|排除方案)[：:]\s*/i, '')
    } else if (/^(?:一句话摸底|顺手想一下|摸底追问|Probe|摸底)[：:]/i.test(cleaned)) {
      probe = cleaned.replace(/^(?:一句话摸底|顺手想一下|摸底追问|Probe|摸底)[：:]\s*/i, '')
    } else if (/^(?:标题|主题|Title|决策底牌|顺带学习卡)[：:]/i.test(cleaned)) {
      title = cleaned.replace(/^(?:标题|主题|Title|决策底牌|顺带学习卡)[：:]\s*/i, '')
    } else if (!title && !cleaned.startsWith('[顺带私教')) {
      title = cleaned
    }
  }
  if (!why && !rejected && !probe) return null
  const finalTitle = cleanText(title, 160) || cleanText(why, 48) || '本轮关键工程取舍'
  return {
    id: '',
    title: finalTitle,
    why: cleanText(why, 420) || '已基于当前项目边界做出取舍。',
    rejected: cleanText(rejected, 420) || '已排除脆弱或高成本备选方案。',
    probe: cleanText(probe, 320) || `换到另一个新模块时，如何避免重复踩中「${finalTitle}」的坑？`,
    trackId: 'track-engineering',
    source: 'dsh-chat',
    epistemic: 'inferred',
    quiz: buildDefaultQuiz(finalTitle, why, rejected, probe),
  }
}

export function parseLearnQuizFence(code) {
  const json = tryParseJsonObject(code)
  if (!json) return null
  const title = cleanText(json.title, 180)
  const question = cleanText(json.question || json.prompt, 420)
  if (!title && !question) return null
  const rawOptions = Array.isArray(json.options) ? json.options : []
  const options = rawOptions
    .filter(opt => opt && typeof opt === 'object' && cleanText(opt.label || opt.text, 240))
    .slice(0, 4)
    .map((opt, idx) => ({
      key: cleanText(opt.key, 8) || String.fromCharCode(65 + idx),
      label: cleanText(opt.label || opt.text, 240),
      detail: cleanText(opt.detail || opt.reason, 280),
      correct: Boolean(opt.correct),
      feedback: cleanText(opt.feedback, 320),
    }))
  if (options.length === 0) return null

  const normalizeSnippet = box => {
    if (!box || typeof box !== 'object') return null
    const c = cleanText(box.code || box.text, 1600)
    if (!c) return null
    return {
      label: cleanText(box.label || box.title, 80) || '代码对比',
      code: c,
    }
  }
  const analogyObj = json.analogy && typeof json.analogy === 'object' && cleanText(json.analogy.body, 500)
    ? {
        title: cleanText(json.analogy.title, 90) || '外行类比提示',
        body: cleanText(json.analogy.body, 500),
      }
    : null

  return {
    itemId: cleanText(json.itemId, 80),
    step: Number(json.step) > 0 ? Number(json.step) : 1,
    totalSteps: Number(json.totalSteps) > 0 ? Number(json.totalSteps) : 2,
    trackTitle: cleanText(json.trackTitle, 80) || '顺带私教 · 专心闯关',
    title: title || '盲测过关题',
    scenario: cleanText(json.scenario || json.context, 420),
    question: question || title,
    before: normalizeSnippet(json.before),
    after: normalizeSnippet(json.after),
    options,
    analogy: analogyObj,
  }
}

export function parseLearnPassFence(code) {
  const json = tryParseJsonObject(code)
  if (!json) return null
  const title = cleanText(json.title, 180)
  const evidenceSummary = cleanText(json.evidenceSummary || json.evidence, 420)
  if (!title && !evidenceSummary) return null
  return {
    itemId: cleanText(json.itemId, 80),
    title: title || '本次闯关知识点',
    trackId: cleanText(json.trackId, 60) || '',
    trackTitle: cleanText(json.trackTitle, 80) || '能力路线',
    fromTier: clampTier(json.fromTier || 1),
    toTier: clampTier(json.toTier || 4),
    evidenceSummary: evidenceSummary || '已完成独立盲测与跨场景追问，行为掌握度升至 4/4。',
    nextTitle: cleanText(json.nextTitle, 140),
  }
}

export function inferTrackIdFromTopic(text) {
  const s = String(text || '')
  if (/css|flex|grid|container|dialog|布局|样式|动画|前端|界面|颜色|主题|弹窗|悬浮|分屏|按钮|组件/i.test(s)) {
    return 'track-frontend'
  }
  if (/prompt|agent|token|mcp|tool|llm|模型|提示词|上下文|多智能体|围栏/i.test(s)) {
    return 'track-ai'
  }
  if (/增长|转化|标题|留存|分发|引导|文案|小红书|公众号|首屏|定位|用户|产品/i.test(s)) {
    return 'track-product'
  }
  return 'track-engineering'
}

export function buildDeepLearnStarterPrompt(item) {
  const safe = item && typeof item === 'object' ? item : {}
  const tierLabel = MASTERY_LABELS[clampTier(safe.masteryTier || 1)]
  const isAdHoc = !safe.rejected && !safe.probe
  return [
    '[顺带私教·专心闯关]',
    `知识点：${cleanText(safe.title, 140) || '当前盲区'}（itemId: ${cleanText(safe.id, 80) || 'ad-hoc'}，当前掌握度：${tierLabel}）`,
    safe.why ? `背景取舍：${cleanText(safe.why, 220)}` : '',
    safe.rejected ? `曾经对比过的坑：${cleanText(safe.rejected, 180)}` : '',
    safe.probe ? `摸底种子：${cleanText(safe.probe, 180)}` : '',
    isAdHoc
      ? '这是我主动发起的专心学习主题（若涉及当前工作区代码，可先快速只读扫一眼关键实现）。请严格按「先探后讲 + 换景追问」节奏带我一对一闯关：第 1 轮直接输出一个 ```learn-quiz JSON 代码块让我先盲选判断并停下等我回复，暂不要剧透完整解释。'
      : '请严格按「先探后讲 + 换景追问」节奏带我过关：第 1 轮直接输出一个 ```learn-quiz JSON 代码块让我先盲选判断并停下等我回复，暂不要剧透完整解释。',
  ].filter(Boolean).join('\n')
}

export function buildSprintStarterPrompt(stations) {
  const list = Array.isArray(stations) ? stations.filter(Boolean).slice(0, 3) : []
  if (list.length === 0) return buildDeepLearnStarterPrompt({ title: '一本手账精选串联闯关', masteryTier: 1 })
  if (list.length === 1) return buildDeepLearnStarterPrompt(list[0])
  const lines = list.map((st, idx) => {
    const label = cleanText(st.masteryLabel, 40) || MASTERY_LABELS[clampTier(st.masteryTier || 1)]
    return `第 ${idx + 1} 站：${cleanText(st.title, 120)}（itemId: ${cleanText(st.itemId || st.id, 80) || 'ad-hoc'}，当前 ${label}）`
  })
  return [
    '[顺带私教·专心闯关]',
    `本次开启 ${list.length} 站串联考考我（共约 ${list.length * 5} 分钟），逐站按「先探后讲 + 换景追问」过关：`,
    ...lines,
    '请先从第 1 站开始，直接输出一个 ```learn-quiz JSON 代码块让我先盲选判断并停下等我回复，暂不要剧透完整解释；每过一站在调用 learn_checkpoint 后再进入下一站。',
  ].join('\n')
}
