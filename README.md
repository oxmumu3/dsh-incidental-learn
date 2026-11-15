# 顺带私教 (`@oxmumu3/dsh-incidental-learn`)

> 作者：`牛村木木山 <157776623+oxmumu3@users.noreply.github.com>`  
> 适用宿主：`DeepSeek Harness >=0.2.2-rc.2 || 0.2.2-rc.3`

把日常跟 Agent 协作干活中遇到的真实工程、架构与前端设计取舍顺手攒下来，沉淀为个人技能库：平时干活零打扰，仅在值得留心的回合末尾附上一条低调柔和灰的可折起「顺带学习卡」（带「附 · 顺带补充（非本轮主回复）」分隔与默认折起 1 行摘要条，不抢主回答的风头）；忙时完全不用点按钮，系统在后台自动存档；有空时点击「在右侧边聊边学」在右侧顺带学习栏不扰动主对话草稿完成一题点拨，或点「开始 3 分钟展开学」深入闯关并沉淀跨 Agent 共享技能库。

## 架构概览

1. **五格客户端槽位 (`client.js`)**：
   - `sidebar.panellist` + `main` (`key: 'incidental-learn'`)：840px 单栏个人技能库、三步图文使用说明（0/0 空态直出、积累后可通过顶栏「使用说明」收放）、默认折叠的「效果预览」(`details` + `toolbar`) 与「后台自动存档」清单、15 分钟集中学、原生 `<dialog closedby="any">` 过关详情窗与零 Token 示例预览入口。
   - `conversation.chat.markdown.fence` (`shield` / `learn-quiz` / `learn-pass`)：独立于 `foldCompletedTurns`，流式阶段平稳占位，定稿后就地交互；其中 `shield` 以「附 · 顺带补充」引导线 + 默认折叠柔和灰折起条呈现，未展开也同样静默写入后台存档。选项作答内置草稿保护（非空不覆盖）与空闲直发（`useInput` + `inputActions`）。
   - `sidebarRightTabs` + `sidebar.right.pane.tab` (`id: '@oxmumu3/dsh-incidental-learn/coach'`, `kind: 'incidental-learn-coach'`)：右侧「顺带学习栏」边聊边学，独立升级掌握度至 `3/4 能复述`。
   - `conversation.input.right`：顶部输入栏轻提醒胶囊（`顺带学习 · 已存 N 张`）。
   - `tool.call.toolview`：`learn_save`、`learn_checkpoint`、`learn_triage` 紧凑单行执行回执。
2. **宿主侧能力 (`index.js` + `lib/`)**：
   - 原子多进程共享账本 (`$DSH_HOME/incidental-learn/ledger.json`)：支持 `mtimeMs` 外部变更合并、临时文件 + `renameSync` 原子落盘及 15 步撤销栈。
   - 静态字节预算 `systemPrompt.section`（<= 1150 UTF-8 字节），仅在 `learn_board` 工具可见时注入。
   - 4 个同源工具：`learn_board`、`learn_save`、`learn_checkpoint`、`learn_triage`。
   - `/api/incidental_learn/view` 与 `/api/incidental_learn/action` 同源路由（带 CSRF/Origin、Content-Type 与包体上限校验）。
3. **跨 Agent CLI 桥 (`bin/incidental-learn-cli.mjs`)**：
   - 供 Antigravity、Codex、Claude Code 或 Super Agent 验收脚本向同一份 `ledger.json` 追加候选卡片或导出笔记：

```bash
dsh-incidental-learn add \
  --source antigravity \
  --track track-frontend \
  --title "@container 必须放在多列规则之后" \
  --why "@container 查询本身不增加选择器优先级，需放在基础网格规则之后才能在窄宽下覆盖列数" \
  --rejected "用全局 @media 查询猜测宿主分屏宽度" \
  --probe "如果在父面板同时使用 grid-template-columns 和 @container，谁写在前面会怎样？"

dsh-incidental-learn status
dsh-incidental-learn export --out ./study-notes.md
```

## 本地开发与四层门禁验证

```bash
npm run build        # 将 shared/schema.js 与 src-client/* 编译为单文件 client.js
npm run check:client # 校验包名、零 ESM export、五格槽位挂载与完整卸载
npm test             # 原子账本并发、CLI、HTTP 安全校验、工具 Schema、Prompt 字节预算与词典一致性
npm run pack:release # 生成可重现 .tgz 与 .sha256
```

## 安装到 DeepSeek Harness Desktop

建议在退出当前运行的桌面端后通过官方 `dsh plugin` 安装离线包：

```bash
dsh plugin --profile desktop add ./oxmumu3-dsh-incidental-learn-0.1.3.tgz
```
