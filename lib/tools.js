// Agent-facing tools for @oxmumu3/dsh-incidental-learn (`顺带私教`).
// Shares the exact same `lib/ledger.js` store as the HTTP UI routes and external CLI.
// IMPORTANT: Optional JSON Schema properties omit `required` (never `required: false`).

import { MASTERY_LABELS } from '../shared/schema.js'

const textOut = value => [{ type: 'text', text: String(value ?? '') }]
const str = (description, extra = {}) => ({ type: 'string', description, ...extra })
const num = (description, extra = {}) => ({ type: 'number', description, ...extra })

const CARD_OUTPUT_SPEC = {
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['text', 'meta'],
    properties: {
      text: { type: 'string' },
      meta: {
        type: 'object',
        additionalProperties: true,
      },
    },
  },
  render: (_args, val) => textOut(typeof val === 'string' ? val : val?.text),
  presentationMeta: (_args, val) => (val && typeof val === 'object' ? val.meta : undefined),
}

export function createLearnTools({ store }) {
  return [
    {
      name: 'learn_board',
      description: '读取顺带私教账本概况：今日头号盲区、待分诊候选数与 3 条能力路线条目及掌握度（1/4 至 4/4）。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          trackId: str('可选，过滤单条路线：track-frontend | track-harness | track-growth'),
        },
      },
      output: { schema: { type: 'string' }, render: (_a, v) => textOut(v) },
      execute: async (args = {}) => {
        const { snapshot } = store.getSnapshot()
        const tracks = args.trackId
          ? snapshot.tracks.filter(t => t.id === args.trackId)
          : snapshot.tracks
        const lines = [
          `# 顺带私教账本（已内化 ${snapshot.stats.masteredItems}/${snapshot.stats.totalItems} 项 · 待分诊 ${snapshot.triage.length} 条）`,
          snapshot.spotlight
            ? `- 今日头号盲区：${snapshot.spotlight.id}「${snapshot.spotlight.title}」[${MASTERY_LABELS[snapshot.spotlight.masteryTier]}]`
            : '- 今日头号盲区：暂无（可从对话底牌挂入或加载示例）',
          '',
          '## 能力路线',
          ...tracks.flatMap(t => [
            `### ${t.title} (${t.id}) · ${t.masteredCount}/${t.totalCount}`,
            ...(t.items.length
              ? t.items.map(it => `  - ${it.id} 「${it.title}」[${MASTERY_LABELS[it.masteryTier]}] ${it.evidenceSummary ? `— ${it.evidenceSummary}` : ''}`)
              : ['  - （暂无条目）']),
          ]),
        ]
        if (snapshot.triage.length > 0) {
          lines.push('', '## 待分诊候选')
          for (const c of snapshot.triage.slice(0, 10)) {
            lines.push(`- ${c.id} 「${c.title}」[${c.source}]`)
          }
        }
        return lines.join('\n')
      },
    },
    {
      name: 'learn_save',
      description: '仅当用户明确要求把某项取舍或盲区保存进顺带私教账本时调用，直接收入对应能力路线并返回回执。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'why'],
        properties: {
          title: str('知识点短标题'),
          why: str('为什么这么做的核心原因'),
          rejected: str('可选，被排除的差方案'),
          probe: str('可选，一句话摸底追问'),
          trackId: str('可选，目标路线：track-frontend | track-harness | track-growth'),
          epistemic: str('可选，verified | explicit | inferred'),
        },
      },
      output: CARD_OUTPUT_SPEC,
      execute: async (args = {}) => {
        const res = await store.saveExplicitItem({
          title: args.title,
          why: args.why,
          rejected: args.rejected || '',
          probe: args.probe || '',
          trackId: args.trackId || 'track-harness',
          source: 'dsh-chat',
          epistemic: args.epistemic || 'explicit',
        })
        return {
          text: `已明确存入「顺带私教」：${res.item.title} [${MASTERY_LABELS[res.item.masteryTier]}]`,
          meta: {
            learnReceipt: {
              kind: 'save',
              itemId: res.item.id,
              title: res.item.title,
              trackId: res.item.trackId,
              masteryTier: res.item.masteryTier,
            },
          },
        }
      },
    },
    {
      name: 'learn_checkpoint',
      description: '专心闯关或换景追问过关后调用：把指定知识点的掌握度升格（最高 4/4）并记录人话版过关证据。调用后请在回复末尾输出 ```learn-pass 围栏卡保证常驻可见。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'toTier', 'evidenceSummary'],
        properties: {
          title: str('知识点标题'),
          toTier: num('目标掌握度阶位：2 | 3 | 4'),
          evidenceSummary: str('人话版过关证据，描述用户在真实或迁移场景中做对了什么（不写机器时间戳）'),
          itemId: str('可选，已有条目 ID（如 item-container-cascade）'),
          trackId: str('可选，目标路线 ID'),
        },
      },
      output: CARD_OUTPUT_SPEC,
      execute: async (args = {}) => {
        const res = await store.recordCheckpoint({
          itemId: args.itemId,
          title: args.title,
          trackId: args.trackId,
          toTier: args.toTier,
          evidenceSummary: args.evidenceSummary,
          epistemic: 'explicit',
        })
        return {
          text: `已记录过关证据：「${res.item.title}」${MASTERY_LABELS[res.fromTier]} -> ${MASTERY_LABELS[res.toTier]}`,
          meta: {
            learnReceipt: {
              kind: 'checkpoint',
              itemId: res.item.id,
              title: res.item.title,
              fromTier: res.fromTier,
              toTier: res.toTier,
              evidenceSummary: res.item.evidenceSummary,
            },
          },
        }
      },
    },
    {
      name: 'learn_triage',
      description: '处理待分诊候选收件箱：单条收入/略过，或批量全部收入/清理低价值候选。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['mode'],
        properties: {
          mode: str('操作模式：accept | skip | accept_all | sweep_low_value'),
          id: str('单条操作时必填的候选 ID'),
          trackId: str('可选，收入时指定路线 ID'),
        },
      },
      output: CARD_OUTPUT_SPEC,
      execute: async (args = {}) => {
        const mode = String(args.mode || '')
        if (mode === 'accept_all' || mode === 'sweep_low_value') {
          const res = await store.triageBatch({ mode })
          return {
            text: `已完成批量分诊 (${mode})，处理 ${res.affected} 条，剩余待分诊 ${res.snapshot.triage.length} 条。`,
            meta: {
              learnReceipt: {
                kind: 'triage',
                mode,
                affected: res.affected,
                remaining: res.snapshot.triage.length,
              },
            },
          }
        }
        const res = await store.triageDecision({
          id: args.id,
          decision: mode === 'skip' ? 'skip' : 'accept',
          trackId: args.trackId,
        })
        return {
          text: res.found
            ? `已处理候选 ${args.id} (${res.decision})，剩余待分诊 ${res.snapshot.triage.length} 条。`
            : `未找到待分诊候选 ${args.id}。`,
          meta: {
            learnReceipt: {
              kind: 'triage',
              mode,
              found: Boolean(res.found),
              remaining: res.snapshot.triage.length,
            },
          },
        }
      },
    },
  ]
}

export function installLearnTools(ctx, { store }, log = () => {}) {
  const registered = []
  const disposeAll = () => {
    while (registered.length) {
      const off = registered.pop()
      try { off?.() } catch { /* ignore */ }
    }
  }

  try {
    ctx.inject(['tools'], scope => {
      try {
        const registry = scope?.tools ?? scope?.get?.('tools', false) ?? null
        if (!registry || typeof registry.register !== 'function') return undefined
        for (const tool of createLearnTools({ store })) {
          const off = registry.register(tool)
          if (typeof off === 'function') registered.push(off)
        }
        log(`tools registered: ${createLearnTools({ store }).map(t => t.name).join(', ')}`)
        return disposeAll
      } catch (err) {
        log(`tools registration failed: ${err instanceof Error ? err.message : String(err)}`)
        return undefined
      }
    })
  } catch (err) {
    log(`tools inject unavailable: ${err instanceof Error ? err.message : String(err)}`)
  }

  return disposeAll
}
