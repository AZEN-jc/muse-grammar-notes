import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTopicsSchema } from './lint.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

/**
 * Collects completion metrics and pending confirmation items for all registered topics.
 */
export function collectNotesStatus(rootDir = ROOT_DIR) {
  const { topics } = loadTopicsSchema(rootDir);
  const notesDir = path.join(rootDir, 'notes');

  return topics.map((topic) => {
    const filePath = path.join(notesDir, `${topic.id}.md`);
    if (!fs.existsSync(filePath)) {
      return {
        id: topic.id,
        title: topic.title,
        order: topic.order,
        exists: false,
        lines: 0,
        clozeCount: 0,
        whyCount: 0,
        trapCount: 0,
        errataCount: 0,
        unconfirmed: [],
      };
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    const unconfirmed = [...raw.matchAll(/（待确认：[^）]+）/g)].map((m) => m[0]);

    return {
      id: topic.id,
      title: topic.title,
      order: topic.order,
      exists: true,
      lines: raw.split(/\r?\n/).length,
      clozeCount: (raw.match(/==[^=\n]+==/g) || []).length,
      whyCount: (raw.match(/^> \[!why\]/gm) || []).length,
      trapCount: (raw.match(/^> \[!trap\]/gm) || []).length,
      errataCount: (raw.match(/^> \[!errata\]/gm) || []).length,
      unconfirmed,
    };
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rows = collectNotesStatus(ROOT_DIR);
  const readyCount = rows.filter((r) => r.exists).length;
  console.log(`\n📚 语法笔记库状态总览 (${readyCount}/${rows.length} 个专题已入库)\n`);

  for (const r of rows) {
    const badge = r.exists ? '✅' : '⏳';
    if (!r.exists) {
      console.log(`${badge} ${r.id.padEnd(16)} ${r.title.padEnd(10)} | 尚未创建 notes/${r.id}.md`);
      continue;
    }
    const stats = `${String(r.lines).padStart(3)} 行 | 挖空:${String(r.clozeCount).padStart(2)} | [!why]:${r.whyCount} | [!trap]:${r.trapCount}`;
    const todo = r.unconfirmed.length > 0 ? ` | ⚠️ 待确认: ${r.unconfirmed.length}` : '';
    console.log(`${badge} ${r.id.padEnd(16)} ${r.title.padEnd(8)} | ${stats}${todo}`);
  }
  console.log('');
}
