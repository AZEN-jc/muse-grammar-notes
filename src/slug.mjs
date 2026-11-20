/**
 * Creates a deterministic slugger per document so that headings in
 * mindmap-extractor.mjs and renderer.mjs always resolve to identical IDs.
 */
export function createSlugger() {
  const counts = new Map();

  return function slugify(rawText) {
    const cleaned = String(rawText)
      .replace(/==([^=]+)==/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[`*_~]/g, '')
      .trim()
      .toLowerCase();

    let base = cleaned
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    if (!base) {
      base = 'section';
    }

    const prev = counts.get(base) || 0;
    counts.set(base, prev + 1);
    return prev === 0 ? base : `${base}-${prev}`;
  };
}
