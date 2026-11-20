import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { loadTopicsSchema } from './lint.mjs';
import { extractMindmapMarkdown } from './mindmap-extractor.mjs';
import { renderMarkdownToHtml, injectTemplate } from './renderer.mjs';
import { createSlugger } from './slug.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeJsonForScript(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

function cleanInlineMarkdown(text) {
  return String(text || '')
    .replace(/==((?:(?!==)[^\n])+)==/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[-*]\s+/, '')
    .trim();
}

export function extractMnemonics(raw, { id, title, order }) {
  const lines = raw.split(/\r?\n/);
  const items = [];
  let inCodeBlock = false;
  let i = 0;
  while (i < lines.length) {
    if (/^\s*```/.test(lines[i])) {
      inCodeBlock = !inCodeBlock;
      i += 1;
      continue;
    }
    if (inCodeBlock) {
      i += 1;
      continue;
    }
    const match = lines[i].match(/^\s*>\s*\[!mnemonic\]\s*(.*)$/i);
    if (match) {
      const cardTitle = cleanInlineMarkdown(match[1]) || '记忆口诀';
      const bodyLines = [];
      i += 1;
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        const content = cleanInlineMarkdown(lines[i].replace(/^\s*>\s?/, ''));
        if (content) bodyLines.push(content);
        i += 1;
      }
      if (bodyLines.length > 0) {
        items.push({
          topicId: id,
          topicTitle: title,
          order,
          title: cardTitle,
          lines: bodyLines.slice(0, 3),
        });
      }
      continue;
    }
    i += 1;
  }
  return items;
}

export function extractPreviewSections(raw) {
  const sections = [];
  let inCodeBlock = false;
  for (const line of raw.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    const m = line.match(/^##\s+(.+)$/);
    if (!m) continue;
    const text = cleanInlineMarkdown(m[1]);
    if (!text || /^顺带拓展短语/.test(text)) continue;
    sections.push(text);
    if (sections.length >= 3) break;
  }
  return sections;
}

export function extractSearchIndex(raw, { id, title, order }) {
  const { content } = matter(String(raw || ''));
  const lines = content.split(/\r?\n/);
  const slugify = createSlugger();
  const entries = [];

  let inCodeBlock = false;
  let inErrata = false;
  let current = null;

  const flush = () => {
    if (!current) return;
    const text = current.parts
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    const snippet = text.length > 1400 ? `${text.slice(0, 1399)}…` : text;
    entries.push({
      topicId: id,
      topicTitle: title,
      order: order ?? 0,
      heading: current.heading,
      slug: current.slug,
      snippet,
    });
    current = null;
  };

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      inErrata = false;
      const level = headingMatch[1].length;
      const rawHeading = headingMatch[2].replace(/\s+#+\s*$/, '').trim();
      const slug = slugify(rawHeading);
      const cleanedHeading = cleanInlineMarkdown(rawHeading);

      if (level === 2 || level === 3) {
        flush();
        if (cleanedHeading) {
          current = { heading: cleanedHeading, slug, parts: [] };
        }
      } else if (level >= 4 && current && cleanedHeading) {
        current.parts.push(cleanedHeading);
      } else if (level === 1) {
        flush();
      }
      continue;
    }

    if (/^\s*>\s*\[!errata\]/i.test(line)) {
      inErrata = true;
      continue;
    }
    if (inErrata) {
      if (/^\s*>/.test(line)) continue;
      inErrata = false;
    }

    if (!current) continue;

    const trimmed = line.trim();
    if (!trimmed) continue;
    // Skip markdown table alignment divider rows
    if (/^\|[\s:|-]+\|$/.test(trimmed)) continue;

    let cleaned = trimmed
      .replace(/^>\s*\[!(?:why|trap|mnemonic|formula)\]\s*/i, '')
      .replace(/^>\s?/, '')
      .replace(/\\\|/g, '|')
      .replace(/\|/g, ' ');
    cleaned = cleanInlineMarkdown(cleaned)
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^[-*+]\s+/, '')
      .trim();

    if (cleaned && cleaned !== '—') {
      current.parts.push(cleaned);
    }
  }

  flush();
  return entries;
}

export function buildAll(rootDir = ROOT_DIR) {
  const { topics } = loadTopicsSchema(rootDir);
  const notesDir = path.join(rootDir, 'notes');
  const distDir = path.join(rootDir, 'dist');
  const templatesDir = path.join(rootDir, 'templates');

  const indexTemplate = fs.readFileSync(path.join(templatesDir, 'index.html'), 'utf8');
  const chapterTemplate = fs.readFileSync(path.join(templatesDir, 'chapter.html'), 'utf8');

  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });

  const builtById = new Map();
  const allMnemonics = [];
  const allSearchEntries = [];

  if (fs.existsSync(notesDir)) {
    const noteFiles = fs
      .readdirSync(notesDir)
      .filter((f) => f.endsWith('.md'))
      .sort();

    for (const file of noteFiles) {
      const raw = fs.readFileSync(path.join(notesDir, file), 'utf8');
      const { meta, html } = renderMarkdownToHtml(raw);
      const mindmapMd = extractMindmapMarkdown(raw);
      const id = meta.id || path.basename(file, '.md');
      const topicMeta = {
        id,
        title: meta.title || id,
        order: meta.order ?? 0,
      };

      const clozeCount = (raw.match(/==(?:(?!==)[^\n])+==/g) || []).length;
      const whyCount = (raw.match(/^> \[!why\]/gm) || []).length;
      const trapCount = (raw.match(/^> \[!trap\]/gm) || []).length;
      const previewSections = extractPreviewSections(raw);

      allMnemonics.push(...extractMnemonics(raw, topicMeta));
      allSearchEntries.push(...extractSearchIndex(raw, topicMeta));

      builtById.set(id, {
        ...meta,
        id,
        html,
        mindmapMd,
        clozeCount,
        whyCount,
        trapCount,
        previewSections,
      });
    }
  }

  // Merge schema topics with built notes
  const mergedTopics = topics
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((topic) => {
      const built = builtById.get(topic.id);
      return {
        id: topic.id,
        title: built?.title || topic.title,
        order: built?.order ?? topic.order,
        summary: built?.summary || topic.summary,
        updated: built?.updated || '',
        built: Boolean(built),
        clozeCount: built?.clozeCount || 0,
        whyCount: built?.whyCount || 0,
        trapCount: built?.trapCount || 0,
        previewSections: built?.previewSections || (topic.sections || []).slice(0, 3),
      };
    });

  allSearchEntries.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const searchIndexScriptJson = safeJsonForScript(allSearchEntries);
  fs.writeFileSync(
    path.join(distDir, 'search-index.json'),
    JSON.stringify(allSearchEntries, null, 2),
    'utf8'
  );

  // Render chapter pages
  for (const topic of mergedTopics) {
    if (!topic.built) continue;
    const note = builtById.get(topic.id);

    const pillsHtml = mergedTopics
      .map((t) => {
        const classes = ['topic-pill'];
        if (t.id === topic.id) classes.push('active');
        if (!t.built) classes.push('disabled');
        const href = t.built ? `${t.id}.html` : '#';
        return `<a class="${classes.join(' ')}" href="${href}">${escapeHtml(t.title)}</a>`;
      })
      .join('\n          ');

    const chapterHtml = injectTemplate(chapterTemplate, {
      TOPIC_ID: escapeHtml(topic.id),
      TOPIC_ID_JSON: safeJsonForScript(topic.id),
      TITLE: escapeHtml(note.title),
      TITLE_JSON: safeJsonForScript(note.title),
      ORDER: escapeHtml(String(note.order).padStart(2, '0')),
      SUMMARY: escapeHtml(note.summary),
      UPDATED: escapeHtml(note.updated || '未知'),
      CLOZE_COUNT: note.clozeCount,
      WHY_COUNT: note.whyCount,
      TOPIC_PILLS: pillsHtml,
      CONTENT_HTML: note.html,
      MINDMAP_JSON: safeJsonForScript(note.mindmapMd),
      SEARCH_INDEX_JSON: searchIndexScriptJson,
    });

    fs.writeFileSync(path.join(distDir, `${topic.id}.html`), chapterHtml, 'utf8');
  }

  // Render index page
  allMnemonics.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const builtCount = mergedTopics.filter((t) => t.built).length;
  const totalCloze = mergedTopics.reduce((sum, t) => sum + t.clozeCount, 0);
  const totalWhy = mergedTopics.reduce((sum, t) => sum + t.whyCount, 0);
  const buildDate = new Date().toISOString().slice(0, 10);
  const indexHtml = injectTemplate(indexTemplate, {
    TOPICS_JSON: safeJsonForScript(mergedTopics),
    MNEMONICS_JSON: safeJsonForScript(allMnemonics),
    SEARCH_INDEX_JSON: searchIndexScriptJson,
    TOTAL_TOPICS: mergedTopics.length,
    BUILT_COUNT: builtCount,
    TOTAL_CLOZE: totalCloze,
    TOTAL_WHY: totalWhy,
    BUILD_DATE: buildDate,
  });

  fs.writeFileSync(path.join(distDir, 'index.html'), indexHtml, 'utf8');

  return {
    totalTopics: mergedTopics.length,
    builtCount,
    searchIndexCount: allSearchEntries.length,
    distDir,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = buildAll(ROOT_DIR);
  console.log(
    `✅ 构建成功: 已生成首页、${result.builtCount}/${result.totalTopics} 个专题页面及 ${result.searchIndexCount} 条搜索索引 -> ${path.relative(ROOT_DIR, result.distDir)}/`
  );
}
