/**
 * Cosine similarity for equal-length numeric vectors.
 * @param {number[]} a
 * @param {number[]} b
 */
export function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * @param {number[]} queryEmbedding
 * @param {{ _id: unknown, text: string, embedding: number[] }[]} chunks
 * @param {number} k
 * @returns {{ chunk: object, score: number }[]}
 */
export function topKCosine(queryEmbedding, chunks, k) {
  const scored = chunks
    .filter((c) => Array.isArray(c.embedding) && c.embedding.length === queryEmbedding.length)
    .map((c) => ({
      chunk: c,
      score: cosineSimilarity(queryEmbedding, c.embedding),
    }))
    .sort((x, y) => y.score - x.score);
  return scored.slice(0, k);
}
