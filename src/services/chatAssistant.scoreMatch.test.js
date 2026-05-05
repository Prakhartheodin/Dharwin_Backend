import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreMatch } from './chatAssistant.service.js';

test('100% overlap with zero pinecone score → 70', () => {
  assert.equal(scoreMatch(['React', 'Node'], ['React', 'Node'], 0), 70);
});

test('0% overlap with perfect pinecone score → 30', () => {
  assert.equal(scoreMatch([], ['React', 'Node'], 1), 30);
});

test('50% overlap with 0.5 pinecone score → 50', () => {
  // (1/2)*70 + 0.5*30 = 35 + 15 = 50
  assert.equal(scoreMatch(['React'], ['React', 'Node'], 0.5), 50);
});

test('no job skills → score = pineconeScore * 100', () => {
  assert.equal(scoreMatch(['React'], [], 0.8), 80);
  assert.equal(scoreMatch([], [], 0), 0);
});

test('case-insensitive skill matching', () => {
  assert.equal(scoreMatch(['react'], ['React'], 0), 70);
});

test('null/undefined candidateSkills treated as empty', () => {
  assert.equal(scoreMatch(null, ['React'], 0), 0);
  assert.equal(scoreMatch(undefined, ['React'], 0), 0);
});
