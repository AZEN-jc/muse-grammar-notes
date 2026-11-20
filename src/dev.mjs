import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAll } from './build.mjs';
import { lintAll } from './lint.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 4173);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

function rebuild(reason = '') {
  const prefix = reason ? `🔄 检测到变更 (${reason})，正在重新构建...` : '📦 正在构建...';
  if (reason) console.log(prefix);
  const lintRes = lintAll(ROOT_DIR);
  if (lintRes.errors.length > 0) {
    console.warn(`⚠️ Lint 发现 ${lintRes.errors.length} 个错误（仍会尝试构建预览）：`);
    for (const err of lintRes.errors) {
      console.warn(`   ${err.file}:${err.line} ${err.message}`);
    }
  }
  const { builtCount, totalTopics } = buildAll(ROOT_DIR);
  console.log(`✅ 已构建 ${builtCount}/${totalTopics} 个专题至 dist/`);
}

const { distDir } = buildAll(ROOT_DIR);
rebuild();

let debounceTimer = null;
for (const dir of ['notes', 'templates', 'schema']) {
  const fullDir = path.join(ROOT_DIR, dir);
  if (!fs.existsSync(fullDir)) continue;
  fs.watch(fullDir, { recursive: false }, (_eventType, filename) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      try {
        rebuild(filename ? `${dir}/${filename}` : dir);
      } catch (err) {
        console.error('❌ 热构建失败:', err.message);
      }
    }, 200);
  });
}

const server = http.createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(distDir, safePath === '/' ? 'index.html' : safePath);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(distDir, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`🚀 本地预览已启动 (支持修改 notes/ 自动热构建): http://127.0.0.1:${PORT}`);
});
