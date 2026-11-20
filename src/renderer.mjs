import matter from 'gray-matter';
import { Marked } from 'marked';
import { createSlugger } from './slug.mjs';

const CALLOUT_META = {
  why: { label: '底层逻辑', icon: '💡' },
  trap: { label: '考试易错坑', icon: '⚠️' },
  mnemonic: { label: '记忆口诀', icon: '🧠' },
  formula: { label: '句型公式', icon: '📐' },
  errata: { label: '原稿勘误', icon: '📝' },
};

export function formatUpdatedDate(val) {
  if (!val) return '';
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return val.toISOString().slice(0, 10);
  }
  return String(val).trim();
}

export function renderMarkdownToHtml(rawMarkdown) {
  const { data, content } = matter(rawMarkdown);
  const slugify = createSlugger();

  const marked = new Marked({
    gfm: true,
    breaks: false,
  });

  marked.use({
    extensions: [
      {
        name: 'cloze',
        level: 'inline',
        start(src) {
          return src.indexOf('==');
        },
        tokenizer(src) {
          const match = /^==((?:(?!==)[^\n])+)==/.exec(src);
          if (match) {
            return {
              type: 'cloze',
              raw: match[0],
              text: match[1],
              tokens: this.lexer.inlineTokens(match[1]),
            };
          }
          return undefined;
        },
        renderer(token) {
          return `<mark class="cloze-mark" tabindex="0" role="button">${this.parser.parseInline(token.tokens)}</mark>`;
        },
      },
    ],
    renderer: {
      heading({ tokens, depth, text }) {
        const slug = slugify(text);
        const inner = this.parser.parseInline(tokens);
        return `<h${depth} id="${slug}" class="doc-heading">${inner}<a class="heading-anchor" href="#${slug}" aria-label="跳转锚点">#</a></h${depth}>\n`;
      },
      table(token) {
        const headerCells = token.header
          .map((cell, idx) => {
            const align = token.align[idx] ? ` style="text-align:${token.align[idx]}"` : '';
            return `<th${align}>${this.parser.parseInline(cell.tokens)}</th>`;
          })
          .join('');

        const bodyRows = token.rows
          .map((row) => {
            const cells = row
              .map((cell, idx) => {
                const align = token.align[idx] ? ` style="text-align:${token.align[idx]}"` : '';
                return `<td${align}>${this.parser.parseInline(cell.tokens)}</td>`;
              })
              .join('');
            return `<tr>${cells}</tr>`;
          })
          .join('');

        return `<div class="table-wrap"><table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table></div>\n`;
      },
      blockquote({ tokens }) {
        const rawBody = this.parser.parse(tokens);
        const pMatch = rawBody.match(/^\s*<p>([\s\S]*?)<\/p>([\s\S]*)$/i);
        if (!pMatch) {
          return `<blockquote>${rawBody}</blockquote>\n`;
        }

        const tagMatch = pMatch[1].match(
          /^\s*\[!(why|trap|mnemonic|formula|errata)\]([^\n]*?)(?:(?:\r?\n|<br\s*\/?>)([\s\S]*))?$/i
        );
        if (!tagMatch) {
          return `<blockquote>${rawBody}</blockquote>\n`;
        }

        const type = tagMatch[1].toLowerCase();
        const meta = CALLOUT_META[type];
        const customTitle = tagMatch[2].trim();
        const title = customTitle || meta.label;
        const firstParaRest = (tagMatch[3] || '').trim();
        const restHtml = pMatch[2] || '';
        const bodyHtml = (firstParaRest ? `<p>${firstParaRest}</p>` : '') + restHtml;

        if (type === 'errata') {
          return (
            `<details class="callout callout-errata">\n` +
            `  <summary class="callout-title"><span class="callout-icon">${meta.icon}</span><span>${title}</span><span class="callout-toggle-hint">点击展开</span></summary>\n` +
            `  <div class="callout-body">${bodyHtml}</div>\n` +
            `</details>\n`
          );
        }

        return (
          `<aside class="callout callout-${type}">\n` +
          `  <div class="callout-title"><span class="callout-icon">${meta.icon}</span><span>${title}</span></div>\n` +
          `  <div class="callout-body">${bodyHtml}</div>\n` +
          `</aside>\n`
        );
      },
    },
  });

  const html = marked.parse(content);
  const meta = {
    id: data.id || '',
    title: data.title || '',
    order: typeof data.order === 'number' ? data.order : 999,
    summary: data.summary || '',
    updated: formatUpdatedDate(data.updated),
  };

  return { meta, html };
}

export function injectTemplate(templateHtml, replacements) {
  let result = templateHtml;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replaceAll(`{{${key}}}`, () => String(value ?? ''));
  }
  return result;
}
