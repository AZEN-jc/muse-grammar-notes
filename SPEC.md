# Project SPEC: muse-grammar-notes

## 1. 项目目标
构建一个面向 AI Agent（Meta Muse）的轻量级、本地优先、确定性英语语法笔记编译系统。
- **Muse 负责**：识别手写笔记照片、按专题归并、修正笔误、补充底层原理解析、输出强规范 Markdown。
- **本工具负责**：格式确定性校验（Lint）、自动抽取精简思维导图骨架、编译生成高可读性交互复习网页，并通过 GitHub Actions 自动部署到 GitHub Pages。

## 2. 技术栈与约束（严格遵守）
- **运行时**：Node.js (ESM, `.mjs`)，不引入 React / Vue / Next.js / Vite 等重型前端构建框架。
- **依赖控制**：仅允许极少数轻量基础库（如 `marked` 用于 Markdown 渲染，可选 `gray-matter`），前端交互使用原生 HTML + CSS + Vanilla JS。
- **思维导图**：使用 Markmap（在生成的 HTML 中通过 CDN 引入 `d3`、`markmap-lib`、`markmap-view`，保证构建产物零打包负担且开箱即用）。
- **输出形态**：纯静态站点输出至 `dist/`，支持本地直接双击或静态服务器预览，以及 GitHub Pages 零配置托管。

## 3. 仓库目录结构
```
muse-grammar-notes/
├── SKILL.md                   # 给 Muse 读取的完整操作规范与 Markdown 语法契约
├── schema/
│   └── topics.json            # 7 大语法专题固定路由表与标准章节骨架
├── notes/                     # 单一事实来源（Muse 仅读写此目录）
│   ├── 00-phonetics.md        # 音标
│   ├── 01-nouns.md            # 名词
│   ├── 02-pronouns.md         # 代词
│   ├── 03-numerals.md         # 数词
│   ├── 04-articles.md         # 冠词
│   ├── 05-verbs.md            # 动词
│   └── 06-sentences.md        # 疑问句与句型
├── src/
│   ├── lint.mjs               # 确定性格式校验器（面向 Agent 自愈的清晰报错）
│   ├── mindmap-extractor.mjs  # 从完整 Markdown 中裁剪出精简 Markmap 骨架
│   ├── renderer.mjs           # 将语义块转为助学卡片并注入 HTML 模板
│   └── build.mjs              # 主构建入口：生成全局首页 + 各专题单页
├── templates/
│   ├── index.html             # 全局导航与复习进度首页模板
│   └── chapter.html           # 专题双视图阅读器模板（导图 + 精排文档）
├── .github/workflows/
│   └── deploy.yml             # Push 到 main 时自动执行 lint -> build -> 部署 Pages
├── .gitignore                 # 忽略 node_modules/、dist/、_inbox_photos/
└── package.json               # scripts: "lint", "build", "dev"
```

## 4. 增强型 Markdown 语法契约（Muse 与本工具的唯一接口）
每篇 `notes/*.md` 必须包含 YAML Frontmatter：
```yaml
---
id: 01-nouns
title: 名词
order: 1
summary: 名词分类、可数与不可数辨析、复数变化规则、量词与所有格
updated: YYYY-MM-DD
---
```

正文支持 5 种自定义语义块（使用标准引用语法，保证纯文本也可读）：
1. `> [!why] 底层逻辑` —— 蓝色卡片。专门补充原笔记跳过的原因和原理（解决“搞不懂为什么”）。
2. `> [!trap] 考试易错坑` —— 红色警示卡。对应手写笔记中的红笔、五角星、正误对比（如 × / √）。
3. `> [!mnemonic] 记忆口诀` —— 琥珀色高亮卡。收录顺口溜和速记规律。
4. `> [!formula] 句型公式` —— 紫色/代码风结构卡。突出展示固定句式和结构槽位。
5. `> [!errata] 原稿勘误` —— 默认折叠的灰色卡片，放在文末，记录手写笔记的拼写或术语笔误。

此外，专题末尾统一设立 `## 顺带拓展短语` 二级标题，收纳原笔记穿插记录但偏离主线的短语，默认不混入主干思维导图。

## 5. 核心模块功能规格

### 5.1 确定性校验器 (`src/lint.mjs`)
运行 `npm run lint` 扫描 `notes/*.md`，校验以下规则；若失败，输出「文件名 + 行号 + 具体修复指令」（方便 Muse 直接根据报错自愈），并以非零退出码结束：
1. Frontmatter 必填字段（`id`, `title`, `order`, `summary`）完整且 `id` 存在于 `schema/topics.json`。
2. 标题层级连续，禁止跳级（例如 `#` 后直接接 `###`）。
3. 表格语法合法，每行列数一致。
4. 仅允许使用约定的 5 种 `[!type]` 语义块类型，防止拼写错误。
5. 导图节点长度检查：非表格、非引用块内的一级/二级无序列表短句建议不超过 28 个字（超长给出 Warning 提示拆分为子项或移入例句块）。

### 5.2 导图骨架提取器 (`src/mindmap-extractor.mjs`)
原则：**导图做减法，文档做加法**。从同一份 Markdown 提取给 Markmap 渲染的精简树：
- 保留：`#` ~ `####` 各级标题 + 紧跟其下的精简规则列表项 + `[!mnemonic]` 和 `[!trap]` 的首行摘要（带小图标标记，如 ⚠️ / 💡）。
- 剔除：Markdown 表格正文（仅保留表格上方标题）、长例句段落、`[!why]` 长解释、`[!errata]` 勘误块、`## 顺带拓展短语` 章节。
- 保证每个标题都有稳定的 slug ID，用于和右侧文档做双向联动。

### 5.3 助学阅读器 (`templates/chapter.html`)
桌面端采用「左/上交互导图 + 右/下精排文档」可切换布局（支持：左右分栏 / 纯文档 / 全屏导图），移动端自适应上下切换：
1. **图文档联动**：点击左侧 Markmap 思维导图的任意节点，右侧文档平滑滚动并短暂高亮对应章节。
2. **背诵挖空模式（核心助学功能）**：顶部提供「背诵遮罩开关」。开启后：
   - 自动遮罩所有表格中除第一列外的释义/变化列（悬停或点击单个单元格揭晓）；
   - 自动遮罩正文中使用 `==关键内容==` 标记的考点词（点击单个切换显隐）。
3. **快速检索与章节切换**：侧边栏或顶部提供 7 大专题快速跳转 + 页内关键词高亮过滤。
4. **视觉风格**：极简护眼学习风（高对比度、清晰字号、支持浅色/深色主题切换），重点突出表格与 5 类助学卡片的区分度。

### 5.4 给 Muse 的 `SKILL.md`
需在仓库根目录生成一份可直接交给 Meta Muse 使用的 `SKILL.md`，明确规定：
1. 照片识别规则：注意部分手写笔记为横拍旋转 90° 的双联页，需按左右页逻辑顺序读取；自动识别重复上传页并去重。
2. 专题路由与增量合并（Idempotent Upsert）：先读 `schema/topics.json` 和对应 `notes/<topic>.md`，将新知识点按逻辑插入对应小节，严禁直接覆盖删掉已有内容。
3. 逻辑重组与助学补全：不得按拍照顺序流水账抄写；主动合并跨页同类对比项为 Markdown 表格；对易混点强制补充 `> [!why]` 底层逻辑解释；将关键考点词用 `==...==` 标记以支持背诵遮罩。
4. 静默勘误：发现原手写笔误时，在正文直接写入正确拼写/语法，并在文末 `> [!errata]` 中如实记录原稿写法与修正说明。
5. 提交闭环：修改完后运行/遵循 `npm run lint` 规则，确保校验通过后再提交至 `notes/`。

## 6. GitHub Actions 自动发布 (`.github/workflows/deploy.yml`)
触发条件：Push 到 `main` 分支且涉及 `notes/**`、`src/**`、`templates/**`。
执行步骤：`npm ci` -> `npm run lint` -> `npm run build` -> 使用官方 `actions/deploy-pages` 发布 `dist/`。
