import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

const ALLOWED_CALLOUTS = new Set(['why', 'trap', 'mnemonic', 'formula', 'errata']);
const REQUIRED_FRONTMATTER = ['id', 'title', 'order', 'summary', 'updated'];

export function loadTopicsSchema(rootDir = ROOT_DIR) {
  const schemaPath = path.join(rootDir, 'schema', 'topics.json');
  const raw = fs.readFileSync(schemaPath, 'utf8');
  const parsed = JSON.parse(raw);
  const topicIds = new Set((parsed.topics || []).map((t) => t.id));
  return { topics: parsed.topics || [], topicIds };
}

function countTableColumns(line) {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|') && !trimmed.endsWith('\\|')) trimmed = trimmed.slice(0, -1);

  let cols = 1;
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === '\\' && i + 1 < trimmed.length) {
      i++;
      continue;
    }
    if (trimmed[i] === '|') {
      cols++;
    }
  }
  return cols;
}

function isTableSeparatorRow(line) {
  const trimmed = line.trim();
  if (!trimmed.includes('|') || !trimmed.includes('-')) return false;
  let inner = trimmed;
  if (inner.startsWith('|')) inner = inner.slice(1);
  if (inner.endsWith('|')) inner = inner.slice(0, -1);
  const cells = inner.split('|').map((c) => c.trim());
  return cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c));
}

function stripMarkdownForLength(text) {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/==([^=]+)==/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .trim();
}

function isValidDateValue(val) {
  if (val instanceof Date) {
    return !Number.isNaN(val.getTime());
  }
  if (typeof val === 'string') {
    return /^\d{4}-\d{2}-\d{2}$/.test(val.trim());
  }
  return false;
}

export function lintMarkdown(content, fileLabel, topicIds) {
  const errors = [];
  const warnings = [];

  const pushError = (line, message, fix) => {
    errors.push({ level: 'ERROR', file: fileLabel, line, message, fix });
  };
  const pushWarning = (line, message, fix) => {
    warnings.push({ level: 'WARN', file: fileLabel, line, message, fix });
  };

  // 1. Parse Frontmatter
  let parsed;
  try {
    parsed = matter(content);
  } catch (err) {
    pushError(1, `YAML Frontmatter 解析失败: ${err.message}`, '检查文件顶部 --- 包裹的 YAML 语法是否正确');
    return { errors, warnings };
  }

  const hasFrontmatter = /^---\r?\n[\s\S]*?\r?\n---/.test(content);
  if (!hasFrontmatter) {
    pushError(1, '缺少 YAML Frontmatter', '在文件顶部添加包含 id, title, order, summary, updated 的 --- 块');
  } else {
    const data = parsed.data || {};
    for (const field of REQUIRED_FRONTMATTER) {
      if (data[field] === undefined || data[field] === null || String(data[field]).trim() === '') {
        pushError(1, `Frontmatter 缺少必填字段 "${field}"`, `在顶部 YAML 中补充 ${field} 字段`);
      }
    }

    if (data.id) {
      const expectedId = path.basename(fileLabel, '.md');
      if (data.id !== expectedId) {
        pushError(1, `Frontmatter id ("${data.id}") 与文件名 ("${expectedId}") 不一致`, `将 id 修改为 ${expectedId}`);
      }
      if (topicIds && !topicIds.has(data.id)) {
        pushError(1, `专题 id "${data.id}" 未在 schema/topics.json 中注册`, `先在 schema/topics.json 中注册 "${data.id}"`);
      }
    }

    if (data.order !== undefined && typeof data.order !== 'number') {
      pushError(1, `Frontmatter order 必须为数字，当前为 ${typeof data.order}`, '将 order 改为整数（如 order: 1）');
    }

    if (data.updated !== undefined && !isValidDateValue(data.updated)) {
      pushError(1, `Frontmatter updated 日期格式无效`, '使用 YYYY-MM-DD 格式（如 updated: 2026-11-19）');
    }
  }

  // Line-by-line body checks
  const lines = content.split(/\r?\n/);
  let inFrontmatter = false;
  let inCodeBlock = false;
  let lastHeadingLevel = 0;
  let h1Count = 0;
  let i = 0;

  while (i < lines.length) {
    const lineNum = i + 1;
    const line = lines[i];

    // Skip frontmatter lines
    if (i === 0 && line.trim() === '---' && hasFrontmatter) {
      inFrontmatter = true;
      i++;
      continue;
    }
    if (inFrontmatter) {
      if (line.trim() === '---') {
        inFrontmatter = false;
      }
      i++;
      continue;
    }

    // Track fenced code blocks
    if (/^\s*```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      i++;
      continue;
    }
    if (inCodeBlock) {
      i++;
      continue;
    }

    // 2. Heading hierarchy check
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      if (level === 1) {
        h1Count++;
        if (h1Count > 1) {
          pushError(lineNum, '正文存在多个一级标题 (#)', '每篇笔记仅允许顶部保留 1 个 # 一级标题，其余章节请用 ## 或 ###');
        }
      }
      if (level > 4) {
        pushError(lineNum, `标题层级过深 (${headingMatch[1]})，超过 4 级限制`, '将标题调整为 #### 以内，或拆分为无序列表');
      }
      if (lastHeadingLevel === 0 && level !== 1) {
        pushError(lineNum, `首个标题必须为一级标题 (#)，当前为 ${headingMatch[1]}`, '在正文开头添加 # 专题名称');
      } else if (lastHeadingLevel > 0 && level > lastHeadingLevel + 1) {
        pushError(
          lineNum,
          `标题层级跳级：从 ${'#'.repeat(lastHeadingLevel)} 直接跳到 ${headingMatch[1]}`,
          `将此处调整为 ${'#'.repeat(lastHeadingLevel + 1)} 或补全中间层级标题`
        );
      }
      lastHeadingLevel = level;
      i++;
      continue;
    }

    // 3. Semantic callout check
    const calloutMatch = line.match(/^\s*>\s*\[!([a-zA-Z0-9_-]+)\]/);
    if (calloutMatch) {
      const type = calloutMatch[1].toLowerCase();
      if (!ALLOWED_CALLOUTS.has(type)) {
        pushError(
          lineNum,
          `使用了未定义的语义块类型 [!${calloutMatch[1]}]`,
          '仅允许使用 [!why] / [!trap] / [!mnemonic] / [!formula] / [!errata]'
        );
      }
      i++;
      continue;
    }

    // 4. Table syntax & column count consistency check
    if (line.trim().startsWith('|') && i + 1 < lines.length && isTableSeparatorRow(lines[i + 1])) {
      const headerCols = countTableColumns(line);
      const sepCols = countTableColumns(lines[i + 1]);
      if (headerCols !== sepCols) {
        pushError(
          lineNum + 1,
          `表格分隔行列数 (${sepCols}) 与表头列数 (${headerCols}) 不一致`,
          `调整分隔行使其包含 ${headerCols} 列（如 ${'| :--- '.repeat(headerCols)}|）`
        );
      }
      let rowIdx = i + 2;
      while (rowIdx < lines.length && lines[rowIdx].trim().startsWith('|')) {
        const rowCols = countTableColumns(lines[rowIdx]);
        if (rowCols !== headerCols) {
          pushError(
            rowIdx + 1,
            `表格数据行列数 (${rowCols}) 与表头列数 (${headerCols}) 不一致`,
            `补齐或删减该行竖线 |，确保恰好有 ${headerCols} 列`
          );
        }
        rowIdx++;
      }
      i = rowIdx;
      continue;
    }

    // 5. Mindmap node length check (top-level / second-level unordered list outside blockquotes & tables)
    if (!line.trim().startsWith('>')) {
      const listMatch = line.match(/^(\s{0,3})[-*+]\s+(.+)$/);
      if (listMatch) {
        const plain = stripMarkdownForLength(listMatch[2]);
        if (plain.length > 28) {
          pushWarning(
            lineNum,
            `列表项长度 (${plain.length} 字) 超过 28 字建议上限，可能撑爆思维导图`,
            '提炼为「核心概念：精简结论」，将长例句或详细解释移入段落、表格或 [!why] 卡片'
          );
        }
      }
    }

    i++;
  }

  return { errors, warnings };
}

export function lintAll(rootDir = ROOT_DIR) {
  const { topicIds } = loadTopicsSchema(rootDir);
  const notesDir = path.join(rootDir, 'notes');

  if (!fs.existsSync(notesDir)) {
    return { files: [], errors: [], warnings: [] };
  }

  const files = fs
    .readdirSync(notesDir)
    .filter((f) => f.endsWith('.md'))
    .sort();

  const allErrors = [];
  const allWarnings = [];

  for (const file of files) {
    const fullPath = path.join(notesDir, file);
    const content = fs.readFileSync(fullPath, 'utf8');
    const relPath = path.join('notes', file);
    const { errors, warnings } = lintMarkdown(content, relPath, topicIds);
    allErrors.push(...errors);
    allWarnings.push(...warnings);
  }

  return { files, errors: allErrors, warnings: allWarnings };
}

function formatIssue(issue) {
  return `[${issue.level}] ${issue.file}:${issue.line} - ${issue.message}\n  ↳ 修复建议: ${issue.fix}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { files, errors, warnings } = lintAll(ROOT_DIR);

  if (files.length === 0) {
    console.log('ℹ️  notes/ 目录下暂无 .md 文件。');
    process.exit(0);
  }

  for (const w of warnings) {
    console.warn(formatIssue(w));
  }
  for (const e of errors) {
    console.error(formatIssue(e));
  }

  console.log(
    `\n🔍 Lint 完成: 扫描 ${files.length} 个文件，${errors.length} 个错误，${warnings.length} 个警告。`
  );

  if (errors.length > 0) {
    process.exit(1);
  }
}
