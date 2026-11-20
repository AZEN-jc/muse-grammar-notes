import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintMarkdown, lintAll, loadTopicsSchema } from '../src/lint.mjs';
import { extractMindmapMarkdown } from '../src/mindmap-extractor.mjs';
import { renderMarkdownToHtml } from '../src/renderer.mjs';
import { buildAll, extractMnemonics, extractPreviewSections, extractSearchIndex } from '../src/build.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

test('lintAll passes on current notes/ without errors', () => {
  const { files, errors, warnings } = lintAll(ROOT_DIR);
  assert.ok(files.length >= 1, 'Expected at least 1 note file');
  assert.deepEqual(errors, [], `Unexpected lint errors: ${JSON.stringify(errors)}`);
  assert.deepEqual(warnings, [], `Unexpected lint warnings: ${JSON.stringify(warnings)}`);
});

test('lintMarkdown catches frontmatter, heading skip, callout, and table errors', () => {
  const { topicIds } = loadTopicsSchema(ROOT_DIR);

  const badMd = `---
id: 99-unknown
title: 测试
order: "1"
---

# 测试

### 跳级标题

> [!unknown] 非法块
> 内容

| A | B |
| :--- | :--- |
| 1 | 2 | 3 |

- 这是一条故意写得非常非常长用于触发导图节点二十八字长度警告的测试列表项内容
`;

  const { errors, warnings } = lintMarkdown(badMd, 'notes/01-nouns.md', topicIds);
  const messages = errors.map((e) => e.message).join('\n');

  assert.match(messages, /summary/);
  assert.match(messages, /updated/);
  assert.match(messages, /不一致/);
  assert.match(messages, /未在 schema\/topics\.json 中注册/);
  assert.match(messages, /order 必须为数字/);
  assert.match(messages, /标题层级跳级/);
  assert.match(messages, /未定义的语义块类型/);
  assert.match(messages, /表格数据行列数/);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0].message, /超过 28 字/);
});

test('lintMarkdown handles escaped pipes inside table cells', () => {
  const { topicIds } = loadTopicsSchema(ROOT_DIR);
  const md = `---
id: 01-nouns
title: 名词
order: 1
summary: 测试转义竖线
updated: 2026-11-19
---

# 名词

| 表达式 | 含义 |
| :--- | :--- |
| a \\| b | 或运算 |
`;
  const { errors } = lintMarkdown(md, 'notes/01-nouns.md', topicIds);
  assert.deepEqual(errors, []);
});

test('extractMindmapMarkdown strips tables, why, formula, errata, and extra phrases while matching heading slugs', () => {
  const samplePath = path.join(ROOT_DIR, 'notes', '01-nouns.md');
  const raw = fs.readFileSync(samplePath, 'utf8');

  const mindmap = extractMindmapMarkdown(raw);
  const { html } = renderMarkdownToHtml(raw);

  // Keeps headings as slugged links & concise bullets & mnemonic/trap icons
  assert.match(mindmap, /# \[名词\]\(#名词\)/);
  assert.match(mindmap, /## \[可数名词复数变化规则\]\(#可数名词复数变化规则\)/);
  assert.match(mindmap, /- 💡 记忆口诀/);
  assert.match(mindmap, /- ⚠️ 考试易错坑/);

  // Strips == marks from mindmap text
  assert.doesNotMatch(mindmap, /==/);

  // Excludes table rows, [!why], [!formula], [!errata], and 顺带拓展短语
  assert.doesNotMatch(mindmap, /potatoes/);
  assert.doesNotMatch(mindmap, /底层逻辑/);
  assert.doesNotMatch(mindmap, /双重所有格公式/);
  assert.doesNotMatch(mindmap, /原稿勘误/);
  assert.doesNotMatch(mindmap, /顺带拓展短语/);
  assert.doesNotMatch(mindmap, /in need/);

  // Every slug in mindmap exists as an id in rendered HTML
  const slugMatches = [...mindmap.matchAll(/\(#([^)]+)\)/g)].map((m) => m[1]);
  assert.ok(slugMatches.length >= 4);
  for (const slug of slugMatches) {
    assert.ok(html.includes(`id="${slug}"`), `Missing heading id="${slug}" in rendered HTML`);
  }
});

test('renderMarkdownToHtml renders all 5 callout cards and cloze marks', () => {
  const samplePath = path.join(ROOT_DIR, 'notes', '01-nouns.md');
  const raw = fs.readFileSync(samplePath, 'utf8');
  const { html } = renderMarkdownToHtml(raw);

  assert.match(html, /class="callout callout-why"/);
  assert.match(html, /class="callout callout-mnemonic"/);
  assert.match(html, /class="callout callout-trap"/);
  assert.match(html, /class="callout callout-formula"/);
  assert.match(html, /<details class="callout callout-errata">/);
  assert.match(html, /<mark class="cloze-mark"/);
  assert.match(html, /<div class="table-wrap"><table>/);
});

test('buildAll produces dist/index.html and dist/01-nouns.html', () => {
  const res = buildAll(ROOT_DIR);
  assert.ok(res.builtCount >= 1);
  assert.ok(fs.existsSync(path.join(res.distDir, 'index.html')));
  assert.ok(fs.existsSync(path.join(res.distDir, '01-nouns.html')));

  const chapterHtml = fs.readFileSync(path.join(res.distDir, '01-nouns.html'), 'utf8');
  assert.match(chapterHtml, /markmap-lib/);
  assert.match(chapterHtml, /clozeToggle/);
  assert.match(chapterHtml, /pageSearch/);
});

test('renderMarkdownToHtml preserves inline HTML in callout titles and = in cloze marks', () => {
  const md = `---
id: 01-nouns
title: 名词
order: 1
summary: test
updated: 2026-11-19
---

# 名词

> [!why] 为什么用 \`for\` 不用 \`of\`？
> 因为修饰的是事情，例如 ==a = b==。
`;
  const { html } = renderMarkdownToHtml(md);
  assert.match(html, /<span>为什么用 <code>for<\/code> 不用 <code>of<\/code>？<\/span>/);
  assert.match(html, /<div class="callout-body"><p>因为修饰的是事情，例如 <mark class="cloze-mark"[^>]*>a = b<\/mark>。<\/p>\s*<\/div>/);
});

test('createTopic scaffolds valid topic in temp workspace and collectNotesStatus reports it', async () => {
  const os = await import('node:os');
  const { createTopic } = await import('../src/new-topic.mjs');
  const { collectNotesStatus } = await import('../src/status.mjs');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'muse-notes-test-'));
  try {
    fs.mkdirSync(path.join(tmpDir, 'schema'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'notes'), { recursive: true });
    fs.copyFileSync(path.join(ROOT_DIR, 'schema', 'topics.json'), path.join(tmpDir, 'schema', 'topics.json'));

    const res = createTopic({
      rootDir: tmpDir,
      id: '07-adjectives',
      title: '形容词与副词',
      summary: '比较级与最高级',
    });

    assert.equal(res.id, '07-adjectives');
    assert.equal(res.order, 7);
    assert.ok(fs.existsSync(res.notePath));

    const lintRes = lintAll(tmpDir);
    assert.deepEqual(lintRes.errors, []);

    const statusRows = collectNotesStatus(tmpDir);
    const created = statusRows.find((r) => r.id === '07-adjectives');
    assert.ok(created && created.exists);
    assert.equal(created.clozeCount, 2);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('extractMnemonics parses [!mnemonic] blocks, strips inline markdown including = in cloze, ignores code blocks, caps at 3 lines, and skips empty bodies', () => {
  const md = `
# 测试专题

> [!why] 非口诀块应忽略
> 这条不会被抽取。

\`\`\`markdown
> [!mnemonic] 代码块中的示例不应被抽取
> 忽略此行
\`\`\`

> [!mnemonic] 口诀 **一** ==重点==
> - 第一行 \`code\`
> * 第二行 **加粗**
> 第三行 ==a = b==
> 第四行应被截断

> [!mnemonic]
> 无标题时使用默认标题。

> [!mnemonic] 空内容块应跳过
>
`;

  const items = extractMnemonics(md, { id: '01-nouns', title: '名词', order: 1 });
  assert.equal(items.length, 2);

  assert.deepEqual(items[0], {
    topicId: '01-nouns',
    topicTitle: '名词',
    order: 1,
    title: '口诀 一 重点',
    lines: ['第一行 code', '第二行 加粗', '第三行 a = b'],
  });

  assert.deepEqual(items[1], {
    topicId: '01-nouns',
    topicTitle: '名词',
    order: 1,
    title: '记忆口诀',
    lines: ['无标题时使用默认标题。'],
  });

  assert.deepEqual(extractMnemonics('', { id: '00-empty', title: '空', order: 0 }), []);
});

test('extractPreviewSections returns up to 3 H2 headings, excludes extra phrases and code blocks, and cleans markdown', () => {
  const md = `
# 主标题
\`\`\`md
## 代码块内标题应忽略
\`\`\`
## **第一节** \`规则\`
### 子标题应忽略
## 顺带拓展短语（高频）
## 第二节 ==a = b==
## 第三节 辨析
## 第四节 应截断
`;

  assert.deepEqual(extractPreviewSections(md), [
    '第一节 规则',
    '第二节 a = b',
    '第三节 辨析',
  ]);
  assert.deepEqual(extractPreviewSections(''), []);
});

test('buildAll injects valid MNEMONICS_JSON, previewSections, and editorial UI hooks in index and chapter pages', () => {
  const res = buildAll(ROOT_DIR);
  const indexHtml = fs.readFileSync(path.join(res.distDir, 'index.html'), 'utf8');
  const chapterHtml = fs.readFileSync(path.join(res.distDir, '01-nouns.html'), 'utf8');

  // Verify index template hooks
  for (const hook of ['chipMark', 'motionToggle', 'museModal', 'coverProgress', 'topicChart', 'mnemonicGrid']) {
    assert.ok(indexHtml.includes(`id="${hook}"`), `Missing #${hook} in dist/index.html`);
  }
  assert.doesNotMatch(indexHtml, /\{\{[A-Z_]+\}\}/, 'Unresolved template placeholder in dist/index.html');

  // Verify injected JSON payloads are valid JSON and populated
  const topicsMatch = indexHtml.match(/const TOPICS = (\[.*\]);/);
  const mnemonicsMatch = indexHtml.match(/const MNEMONICS = (\[.*\]);/);
  assert.ok(topicsMatch, 'Missing TOPICS JSON in dist/index.html');
  assert.ok(mnemonicsMatch, 'Missing MNEMONICS JSON in dist/index.html');

  const topics = JSON.parse(topicsMatch[1]);
  const mnemonics = JSON.parse(mnemonicsMatch[1]);
  assert.ok(topics.length >= 7);
  assert.ok(topics.every((t) => Array.isArray(t.previewSections) && t.previewSections.length >= 1));
  assert.ok(mnemonics.length >= 3, 'Expected at least 3 extracted mnemonics across notes');
  assert.ok(mnemonics.every((m) => m.topicId && m.title && Array.isArray(m.lines) && m.lines.length > 0));

  // Verify chapter template hooks, styled heading anchors/errata hint, and safe JSON topic constants
  for (const hook of ['splitResizer', 'motionToggle', 'clozeToggle', 'copyMuseTopicBtn', 'fitMindmapBtn']) {
    assert.ok(chapterHtml.includes(`id="${hook}"`), `Missing #${hook} in dist/01-nouns.html`);
  }
  assert.match(chapterHtml, /const TOPIC_ID = "01-nouns";/);
  assert.match(chapterHtml, /const TOPIC_TITLE = "名词";/);
  assert.match(chapterHtml, /\.heading-anchor\s*\{/);
  assert.match(chapterHtml, /\.callout-toggle-hint\s*\{/);
  assert.match(chapterHtml, /class="callout callout-mnemonic"/);
  assert.doesNotMatch(chapterHtml, /\{\{[A-Z_]+\}\}/, 'Unresolved template placeholder in dist/01-nouns.html');
});

test('extractSearchIndex matches rendered HTML slugs, skips code/errata blocks, and builds clean snippets', () => {
  const md = `---
id: 04-articles
title: 冠词
order: 4
summary: test
updated: 2026-11-20
---

# 冠词

## 重复标题

- 核心：==in hospital== 住院

\`\`\`markdown
## 代码块中的标题不应被索引
in_code_block_token
\`\`\`

### 重复标题

| 短语 | 含义 |
| :--- | :--- |
| \`a university\` | 辅音音素开头 |

#### 四级小节并入父级
补充内容 \`for sb.\`

> [!errata] 原稿勘误
> 原稿拼写错误 Chiner 不应进入搜索摘要。
`;

  const entries = extractSearchIndex(md, { id: '04-articles', title: '冠词', order: 4 });
  const { html } = renderMarkdownToHtml(md);

  assert.equal(entries.length, 2);
  assert.equal(entries[0].slug, '重复标题');
  assert.equal(entries[1].slug, '重复标题-1');
  for (const entry of entries) {
    assert.ok(html.includes(`id="${entry.slug}"`), `Slug ${entry.slug} not found in rendered HTML`);
  }

  assert.match(entries[0].snippet, /in hospital/);
  assert.doesNotMatch(entries[0].snippet, /==|in_code_block_token/);
  assert.match(entries[1].snippet, /a university/);
  assert.match(entries[1].snippet, /四级小节并入父级/);
  assert.match(entries[1].snippet, /for sb\./);
  assert.doesNotMatch(entries[1].snippet, /Chiner/);

  assert.deepEqual(extractSearchIndex('', { id: '00-empty', title: '空', order: 0 }), []);
});

test('buildAll emits dist/search-index.json with valid slugs and wires Command Palette, review/star hooks, and @media print', () => {
  const res = buildAll(ROOT_DIR);
  const indexJsonPath = path.join(res.distDir, 'search-index.json');
  assert.ok(fs.existsSync(indexJsonPath), 'Missing dist/search-index.json');

  const searchIndex = JSON.parse(fs.readFileSync(indexJsonPath, 'utf8'));
  assert.ok(Array.isArray(searchIndex) && searchIndex.length >= 20);

  // Every slug in search-index.json must match an actual rendered id="..." in its chapter HTML
  const chapterCache = new Map();
  for (const item of searchIndex) {
    if (!chapterCache.has(item.topicId)) {
      chapterCache.set(item.topicId, fs.readFileSync(path.join(res.distDir, `${item.topicId}.html`), 'utf8'));
    }
    const chHtml = chapterCache.get(item.topicId);
    assert.ok(
      chHtml.includes(`id="${item.slug}"`),
      `Search index slug "${item.slug}" missing in dist/${item.topicId}.html`
    );
  }

  // Verify key Henan Zhuanshengben exam terms are searchable across the corpus
  const corpus = searchIndex.map((e) => `${e.heading} ${e.snippet}`).join('\n').toLowerCase();
  for (const kw of ['hospital', 'university', 'for sb', '反意疑问句']) {
    assert.ok(corpus.includes(kw.toLowerCase()), `Expected "${kw}" in dist/search-index.json`);
  }

  // Verify index.html Round 2 injections & hooks
  const indexHtml = fs.readFileSync(path.join(res.distDir, 'index.html'), 'utf8');
  const idxSearchMatch = indexHtml.match(/const SEARCH_INDEX = (\[.*\]);/);
  assert.ok(idxSearchMatch, 'Missing inline SEARCH_INDEX in dist/index.html');
  assert.equal(JSON.parse(idxSearchMatch[1]).length, searchIndex.length);
  for (const hook of ['cmdPalette', 'openCmdPalette', 'progressModeToggle', 'starredSection']) {
    assert.ok(indexHtml.includes(`id="${hook}"`), `Missing #${hook} in dist/index.html`);
  }
  assert.match(indexHtml, /@keyframes cover-breathe/);

  const mnemonicsMatch = indexHtml.match(/const MNEMONICS = (\[.*\]);/);
  const mnemonics = JSON.parse(mnemonicsMatch[1]);
  const mnemonicTopics = new Set(mnemonics.map((m) => m.topicId));
  assert.equal(mnemonicTopics.size, 7, 'Expected [!mnemonic] coverage across all 7 topics');

  // Verify chapter.html Round 2 injections & hooks
  const chapterHtml = fs.readFileSync(path.join(res.distDir, '04-articles.html'), 'utf8');
  const chSearchMatch = chapterHtml.match(/const SEARCH_INDEX = (\[.*\]);/);
  assert.ok(chSearchMatch, 'Missing inline SEARCH_INDEX in dist/04-articles.html');
  assert.equal(JSON.parse(chSearchMatch[1]).length, searchIndex.length);
  for (const hook of ['cmdPalette', 'openCmdPalette', 'reviewToggle', 'reviewFooterBtn']) {
    assert.ok(chapterHtml.includes(`id="${hook}"`), `Missing #${hook} in dist/04-articles.html`);
  }
  assert.match(chapterHtml, /\.heading-star\s*\{/);
  assert.match(chapterHtml, /@media print\s*\{/);
  assert.doesNotMatch(chapterHtml, /\{\{[A-Z_]+\}\}/, 'Unresolved template placeholder in dist/04-articles.html');
});


