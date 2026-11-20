import matter from 'gray-matter';
import { createSlugger } from './slug.mjs';

function cleanInlineText(text) {
  return text
    .replace(/==([^=]+)==/g, '$1')
    .trim();
}

function truncateText(text, maxLen = 40) {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}

/**
 * Extracts a concise Markmap-ready Markdown skeleton from a full note.
 * Keeps: # ~ #### headings (linked to #slug), concise list items, and
 * single-line summaries for [!mnemonic] (💡) and [!trap] (⚠️).
 * Excludes: tables, plain paragraphs, [!why], [!formula], [!errata],
 * and the entire `## 顺带拓展短语` section.
 */
export function extractMindmapMarkdown(rawMarkdown) {
  const { content } = matter(rawMarkdown);
  const lines = content.split(/\r?\n/);
  const slugify = createSlugger();
  const out = [];

  let inCodeBlock = false;
  let skipExtraSection = false;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      i++;
      continue;
    }
    if (inCodeBlock) {
      i++;
      continue;
    }

    // Headings (# ~ ####)
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const rawTitle = headingMatch[2].trim();
      const slug = slugify(rawTitle);

      if (level <= 2 && /^顺带拓展短语/.test(rawTitle)) {
        skipExtraSection = true;
        i++;
        continue;
      }
      if (level <= 2 && skipExtraSection) {
        skipExtraSection = false;
      }

      if (!skipExtraSection) {
        const displayTitle = cleanInlineText(rawTitle).replace(/([\[\]])/g, '\\$1');
        out.push(`${'#'.repeat(level)} [${displayTitle}](#${slug})`);
      }
      i++;
      continue;
    }

    if (skipExtraSection) {
      i++;
      continue;
    }

    // Blockquotes / semantic callouts
    const calloutMatch = line.match(/^\s*>\s*\[!([a-zA-Z0-9_-]+)\]\s*(.*)$/);
    if (calloutMatch) {
      const type = calloutMatch[1].toLowerCase();
      const headerTitle = cleanInlineText(calloutMatch[2] || '');
      const blockLines = [];
      let j = i + 1;
      while (j < lines.length && /^\s*>/.test(lines[j])) {
        const inner = lines[j].replace(/^\s*>\s?/, '').trim();
        if (inner) blockLines.push(cleanInlineText(inner));
        j++;
      }

      if (type === 'mnemonic' || type === 'trap') {
        const icon = type === 'mnemonic' ? '💡' : '⚠️';
        const genericTitles = new Set(['记忆口诀', '考试易错坑', '']);
        let summary = headerTitle;
        if (genericTitles.has(headerTitle) && blockLines.length > 0) {
          const firstLine = blockLines[0].replace(/^[-*+]\s+/, '');
          summary = headerTitle ? `${headerTitle}：${firstLine}` : firstLine;
        }
        if (summary) {
          out.push(`- ${icon} ${truncateText(summary, 36)}`);
        }
      }

      i = j;
      continue;
    }

    // Skip any other blockquote lines
    if (/^\s*>/.test(line)) {
      i++;
      continue;
    }

    // Skip Markdown tables
    if (line.trim().startsWith('|')) {
      i++;
      continue;
    }

    // Keep concise unordered list items (1st & 2nd level)
    const listMatch = line.match(/^(\s{0,3})[-*+]\s+(.+)$/);
    if (listMatch) {
      const indent = listMatch[1].length >= 2 ? '  ' : '';
      const itemText = cleanInlineText(listMatch[2]);
      if (itemText) {
        out.push(`${indent}- ${itemText}`);
      }
      i++;
      continue;
    }

    i++;
  }

  return out.join('\n').trim() + '\n';
}
