# Muse Grammar Notes · 英语语法复习库

面向河南专升本备考与 AI Agent（Meta Muse）增量维护的轻量级、本地优先、确定性英语语法笔记编译系统。

- **内容层（Markdown）**：`notes/*.md` 遵循 [`SKILL.md`](SKILL.md) 规范，结构化沉淀 7 大基础语法专题（音标、名词、代词、数词、冠词、动词、疑问句与句型），统一包含 `[!why]` 底层逻辑、`[!trap]` 考试易错坑、`[!mnemonic]` 记忆口诀、`[!formula]` 句型公式与 `==...==` 背诵挖空。
- **渲染层（纯静态 HTML）**：构建产物 `dist/` 支持双栏 Markmap 思维导图 + 挖空遮罩背诵、`⌘K / Ctrl+K` 跨专题秒搜、双层本地复习记忆（专题打卡 + 小节 `★` 星标速查）以及 `@media print` 纸质讲义打印，双击 `dist/index.html`（`file://` 协议）亦可离线零报错运行。

---

## 快速开始与常用命令

> 环境要求：Node.js 18+（无需任何构建框架或后端数据库）

```bash
npm install
```

| 命令 | 说明 |
| :--- | :--- |
| `npm run dev` | 构建并在 `http://127.0.0.1:4173` 启动本地热预览服务 |
| `npm run lint` | 扫描 `notes/*.md`，校验 Frontmatter、标题层级、语义块、表格列数与导图节点字数 |
| `npm run build` | 编译生成 `dist/`（含首页、7 个专题页与 `dist/search-index.json`） |
| `npm run status` | 查看全库专题入库进度、挖空点数与 `[!why]` / `[!trap]` 统计 |
| `npm run new -- --id 07-adjectives --title "形容词与副词" --summary "比较级与最高级"` | 自动在 `schema/topics.json` 注册并生成合规新专题骨架 |
| `npm test` | 运行 `tests/toolchain.test.mjs` 全部单元测试 |

---

## 交互复习功能速览

- **跨专题秒搜（`⌘K` / `Ctrl+K`）**：首页与任意专题页均可呼出命令面板，输入中英文关键词（如 `hospital`、`university`、`for sb`、`反意疑问句`），使用 `↑` / `↓` / `Enter` 直达对应小节并闪烁定位。
- **背诵遮罩自测（快捷键 `M`）**：一键模糊所有 `==...==` 挖空词与表格答案列，点击逐个揭晓。
- **双层本地复习记录（`localStorage`）**：
  - 专题级：点击专题页顶栏或文末的 **「✓ 标记今日已复习」**，自动同步更新首页左侧书脊进度尺（支持点击书脊进度尺在「已复习 / 已入库」间切换）与卡片复习徽标。
  - 小节级：悬停正文任意 `H2 / H3` 标题点击 `☆ → ★`，自动汇总到首页 **「★ 生疏考点速查」**。
- **纸质讲义打印（`⌘P` / `Ctrl+P`）**：专题页内置 `@media print` 排版，自动隐藏工具栏与导图并展开清晰黑白表格。

---

## GitHub Pages 一键发布

仓库已内置 [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)，推送至 `main` 分支后自动执行 `npm run lint` 与 `npm run build` 并发布 `dist/` 到 GitHub Pages：

```bash
git remote add origin <你的 GitHub 仓库地址>
git push -u origin main
```

随后在 GitHub 仓库 `Settings → Pages → Build and deployment` 中将 Source 设为 **GitHub Actions** 即可获得在线复习地址。

---

## 移交给 Meta Muse 接管的 3 步标准话术

后续拍了新手写笔记照片时，无需手动排版，直接把照片发给 Meta Muse 并附带以下话术（也可在网页首页点击「＋ 扩展 / 更新笔记」一键生成定制指令）：

1. **先声明规范**：`请先读取仓库根目录的 SKILL.md 和 schema/topics.json。`
2. **明确目标专题**：`我将上传「<专题名>」相关的手写英语语法笔记照片，请你按 SKILL.md 规范识图、去重、修正笔误（记入文末 > [!errata]）、补充 > [!why] 底层逻辑并用 ==...== 标出核心考点。`
3. **指定落盘与校验**：`请增量合并到 notes/<topic-id>.md（若为新专题请先在 schema/topics.json 注册），提交前运行 npm run lint 确保 0 错误 0 警告。`
