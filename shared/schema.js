// Shared constants, defaults, resilient fence parsers, and starter prompts for
// @oxmumu3/dsh-incidental-learn (`顺带私教`).
// Pure functions only — safe to bundle directly into browser `client.js` (with `export ` stripped).

export const PANEL_KEY = 'incidental-learn'
export const COACH_TAB_ID = '@oxmumu3/dsh-incidental-learn/coach'
export const COACH_TAB_KIND = 'incidental-learn-coach'

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
    title: '前端与交互品味',
    subtitle: '现代 CSS 容器查询、原生顶层交互与主题令牌',
    order: 1,
  },
  {
    id: 'track-harness',
    title: 'Agent 架构与 DSH Harness 六格主线',
    subtitle: '槽位契约、会话隔离、幂等写盘与双端边界',
    order: 2,
  },
  {
    id: 'track-growth',
    title: '增长分发与内容渠道适配',
    subtitle: '微信搜一搜首屏利益点、阅读转化与渠道结构差异',
    order: 3,
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
      evidenceSummary: '已看过 learn-v2 原型中 390px 分屏溢出 45px 的真坑定位，待独立完成一次跨场景追问。',
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
      trackId: 'track-harness',
      title: '用 markdown.fence 替代 tool.call.toolview 绕开回合自动折叠',
      source: 'dsh-chat',
      epistemic: 'verified',
      masteryTier: 3,
      why: 'DSH 0.2.2-rc.3 对已结束回合一律设置 foldCompletedTurns: true；正文里的自定义围栏（shield / learn-quiz / learn-pass）在过程头之外保持常驻展示，停用插件后仍可阅读。',
      rejected: '把每次回合结束的决策卡做成一次 tool call（每回合多消耗 1 次工具往返 Token，且回合一结束立刻被收折）。',
      probe: '为什么 learn_checkpoint 归档可以走工具调用，但过关毕业卡却要多出一块 learn-pass 围栏？',
      evidenceSummary: '在 RC3 app.asar 契约核查中复述出 presentation-policy 折叠范围与 markdown.fence 会话作用域差异。',
      priority: 85,
    },
    {
      id: 'item-atomic-mtime-ledger',
      trackId: 'track-harness',
      title: '跨 Agent 共享 ledger.json 的 mtimeMs 合并与原子落盘',
      source: 'codex',
      epistemic: 'verified',
      masteryTier: 2,
      why: 'DSH 插件宿主与外部 CLI（Antigravity / Codex）会并发读写同一份 ledger.json；写入前比对文件 mtimeMs 并重新合并，再经临时文件 renameSync 原子替换，才能避免半截 JSON 与覆盖丢卡。',
      rejected: '启动时把账本全读进内存直接 writeFileSync 覆盖，或引入 SQLite 重型二进制依赖增加跨平台安装风险。',
      probe: '如果 Antigravity 刚通过 CLI 塞入一条新盲区，正在运行的 DSH 宿主若不做 mtimeMs 检查直接点「略过」会发生什么？',
      evidenceSummary: '已在设计评审阶段对照 state-file-two-hosts 规矩推演双写覆盖场景，待完成一次跨进程盲测确认。',
      priority: 92,
    },
    {
      id: 'item-wechat-search-firstscreen',
      trackId: 'track-growth',
      title: '微信搜一搜短图文与公众号纯文本分发结构差异',
      source: 'manual',
      epistemic: 'explicit',
      masteryTier: 3,
      why: '纯文本只触达既有读者，首句靠共鸣切入；微信搜一搜短图文依赖 3:4 封面卡在信息流抢占第一眼，必须在前 2 秒用结构化利益点代替铺垫背景。',
      rejected: '直接把公众号长文拆成白底黑字长截图套用（首屏信息密度失焦，搜一搜点击率折损明显）。',
      probe: '面向老读者群发的纯文本与面向冷启动搜一搜的 3:4 短图文，第一眼最核心的改动分别是什么？',
      evidenceSummary: '复盘了 500+ 阅读纯文本反馈与 6 张 3:4 短图文封面结构取舍，能独立拆出首屏利益点公式。',
      priority: 65,
    },
  ],
  triage: [
    {
      id: 'cand-draft-guard-lexical',
      trackId: 'track-harness',
      title: '围栏选项按钮触发 inputActions.submit() 前必须读取 useInput().draft',
      source: 'dsh-chat',
      epistemic: 'inferred',
      why: '用户可能正在输入框编写长回复，直接调 setDraft() 会静默擦除未发送心血。',
      rejected: '点击选择题卡片后不检查输入框状态直接覆写发送。',
      probe: '当用户在底部输入框留有未发送草稿时，点击 learn-quiz 选项应采取哪两步保护？',
      lowValue: false,
    },
    {
      id: 'cand-sidebar-right-id-kind',
      trackId: 'track-harness',
      title: 'sidebarRightTabs 注册用 id 而 openTab() 传 kind',
      source: 'superagent-review',
      epistemic: 'verified',
      why: 'DSH 右侧栏 SlotRegistry 按 definition.id 分发渲染组件，但侧栏服务的 openTab(kind) 按 definition.kind 反查。两者混写同一字符串会在开抽屉时静音失效。',
      rejected: '凭直觉把槽位 key 与 openTab 参数都传成同一个 ID。',
      probe: '在 dsh-client-ui-sidebar-right 中，Slots 注册 key 与 openTab() 入参分别读哪个字段？',
      lowValue: false,
    },
    {
      id: 'cand-optional-schema-no-false',
      trackId: 'track-harness',
      title: '工具可选参数必须省略 required 而不是写 required: false',
      source: 'codex',
      epistemic: 'verified',
      why: 'JSON Schema 2020-12 校验器要求 required 必须是父级字符串数组，给单个字段写 required: false 会导致底层模型注册报错。',
      rejected: '沿用部分旧表单习惯在字段描述对象内写 { type: "string", required: false }。',
      probe: '向 DeepSeek Tool Schema 暴露一个可选字符串字段时，正确的 Schema 写法是什么？',
      lowValue: false,
    },
    {
      id: 'cand-prompt-kv-cache',
      trackId: 'track-harness',
      title: '常驻 systemPrompt.section 必须保持文本固定且 <= 1150 字节',
      source: 'antigravity',
      epistemic: 'verified',
      why: '把动态变化的账本条目直接拼进系统提示词前缀，每轮都会击穿模型 KV Cache 导致首字延迟翻倍且账单飙升；静态规则 + 工具按需读取才是省流正道。',
      rejected: '每次生成新系统消息把所有历史盲区全部塞进 system prompt。',
      probe: '为什么个人盲区数量增加后，系统提示词前缀仍然必须逐字保持静止？',
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
      trackId: 'track-growth',
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
      trackId: cleanText(json.trackId, 60) || 'track-harness',
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
    trackId: 'track-harness',
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

export function buildDeepLearnStarterPrompt(item) {
  const safe = item && typeof item === 'object' ? item : {}
  const tierLabel = MASTERY_LABELS[clampTier(safe.masteryTier || 1)]
  return [
    '[顺带私教·专心闯关]',
    `知识点：${cleanText(safe.title, 140) || '当前盲区'}（itemId: ${cleanText(safe.id, 80) || 'ad-hoc'}，当前掌握度：${tierLabel}）`,
    safe.why ? `背景取舍：${cleanText(safe.why, 220)}` : '',
    safe.rejected ? `曾经对比过的坑：${cleanText(safe.rejected, 180)}` : '',
    safe.probe ? `摸底种子：${cleanText(safe.probe, 180)}` : '',
    '请严格按「先探后讲 + 换景追问」节奏带我过关：第 1 轮直接输出一个 ```learn-quiz JSON 代码块让我先盲选判断并停下等我回复，暂不要剧透完整解释。',
  ].filter(Boolean).join('\n')
}
