// Static byte-budgeted systemPrompt section for @oxmumu3/dsh-incidental-learn (`顺带私教`).
//
// Invariants:
//   - Fixed text at module load (preserves prompt KV cache).
//   - <= LEARN_PROMPT_MAX_BYTES (1150 UTF-8 bytes), enforced by unit test.
//   - Returns '' unless `learn_board` is visible in the current turn scope.

export const LEARN_PROMPT_MAX_BYTES = 1150

export const LEARN_SYSTEM_PROMPT = [
  '[顺带私教 | SHIELD]',
  '1. 严选不刷屏：日常答疑/改字/常规脚本 0 输出；仅本轮踩反直觉坑或做出跨项目架构/设计取舍（单会话限1张，why/rejected 须点明具体边界与坑）时，在末尾附 1 块 ```shield JSON：',
  '{"title":"短标题","why":"核心取舍","rejected":"排除方案及坑","probe":"摸底","trackId":"track-frontend|track-engineering|track-ai|track-product","quiz":{"question":"题干","options":[{"key":"A","label":"选项A","correct":false,"feedback":"纠偏"},{"key":"B","label":"选项B","correct":true,"feedback":"解释"}]}}',
  '2. 仅用户明说保存时才调 learn_save；勿静默写盘。',
  '3. 若消息以 [顺带私教·专心闯关] 开头，走先探后讲+换景追问：第1轮先发 ```learn-quiz JSON（step:1,totalSteps:2,title,scenario,question,before,after,options,analogy）停下等答；第2轮诊断并出换项目迁移 learn-quiz；通过后调 learn_checkpoint（传人话 evidenceSummary 与 toTier:4）并输出 ```learn-pass JSON（itemId,title,fromTier,toTier,evidenceSummary,trackTitle）。',
].join('\n')

export function registerLearnPrompt(ctx, log = () => {}) {
  let disposePrompt
  const unregister = () => {
    try { disposePrompt?.() } catch { /* ignore */ }
    disposePrompt = undefined
  }

  try {
    ctx.inject(['systemPrompt'], scope => {
      try {
        const sp = scope?.systemPrompt ?? scope?.get?.('systemPrompt', false) ?? null
        if (!sp || typeof sp.section !== 'function') return undefined
        if (disposePrompt) return undefined
        disposePrompt = sp.section({
          name: 'incidental-learn:shield-protocol',
          order: 5250,
          text: ({ scope: turnScope } = {}) => {
            const tools = ctx?.get?.('tools', false)
            if (tools && typeof tools.get === 'function' && turnScope) {
              if (!tools.get('learn_board', turnScope)) return ''
            }
            return LEARN_SYSTEM_PROMPT
          },
        })
        log('systemPrompt section registered')
        return unregister
      } catch (err) {
        log(`systemPrompt registration failed: ${err instanceof Error ? err.message : String(err)}`)
        return undefined
      }
    })
  } catch (err) {
    log(`systemPrompt inject unavailable: ${err instanceof Error ? err.message : String(err)}`)
  }

  return unregister
}
