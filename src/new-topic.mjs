import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i += 1;
      }
    }
  }
  return args;
}

/**
 * Registers a new grammar topic in schema/topics.json and scaffolds notes/<id>.md.
 */
export function createTopic({
  rootDir = ROOT_DIR,
  id,
  title,
  summary = '',
  sections = ['核心概念与分类', '高频考点与对比', '顺带拓展短语'],
  updated = new Date().toISOString().slice(0, 10),
}) {
  if (!title || typeof title !== 'string') {
    throw new Error('必须提供专题标题，例如: npm run new -- --id 07-adjectives --title "形容词与副词"');
  }

  const schemaPath = path.join(rootDir, 'schema', 'topics.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const maxOrder = schema.topics.reduce((max, t) => Math.max(max, Number(t.order) || 0), -1);
  const nextOrder = maxOrder + 1;

  const resolvedId = id
    ? String(id).trim()
    : `${String(nextOrder).padStart(2, '0')}-topic`;

  if (!/^\d{2}-[a-z0-9-]+$/i.test(resolvedId)) {
    throw new Error(`专题 id "${resolvedId}" 格式不规范，建议使用 "07-adjectives" 这类两位数字+英文短横线格式。`);
  }

  if (schema.topics.some((t) => t.id === resolvedId)) {
    throw new Error(`专题 id "${resolvedId}" 已存在于 schema/topics.json 中。`);
  }

  const notePath = path.join(rootDir, 'notes', `${resolvedId}.md`);
  if (fs.existsSync(notePath)) {
    throw new Error(`笔记文件 notes/${resolvedId}.md 已存在。`);
  }

  const resolvedSummary = summary.trim() || `${title}核心规则、高频考点与易错辨析`;
  const cleanSections = sections.includes('顺带拓展短语')
    ? sections
    : [...sections, '顺带拓展短语'];

  schema.topics.push({
    id: resolvedId,
    title: title.trim(),
    order: nextOrder,
    summary: resolvedSummary,
    sections: cleanSections,
  });

  fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2) + '\n', 'utf8');

  const sectionBlocks = cleanSections
    .map((sec) => {
      if (sec === '顺带拓展短语') {
        return `## ${sec}\n\n| 短语 | 释义 | 例句 / 备注 |\n| :--- | :--- | :--- |\n| （待补充） | — | — |`;
      }
      return `## ${sec}\n\n- **核心要点**：待补充 ==关键词==`;
    })
    .join('\n\n');

  const markdown = `---
id: ${resolvedId}
title: ${title.trim()}
order: ${nextOrder}
summary: ${resolvedSummary}
updated: ${updated}
---

# ${title.trim()}

${sectionBlocks}
`;

  fs.mkdirSync(path.dirname(notePath), { recursive: true });
  fs.writeFileSync(notePath, markdown, 'utf8');

  return { id: resolvedId, order: nextOrder, notePath, schemaPath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  try {
    const sections = args.sections
      ? String(args.sections).split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;
    const res = createTopic({
      id: args.id,
      title: args.title,
      summary: args.summary || '',
      sections,
    });
    console.log(`✅ 已注册新专题 "${res.id}" (order=${res.order})`);
    console.log(`📄 已生成模板文件: notes/${res.id}.md`);
    console.log(`💡 下一步: 可直接编辑 notes/${res.id}.md，或把新照片发给 Muse 按 SKILL.md 增量写入该文件。`);
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exitCode = 1;
  }
}
