import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORIES,
  MAX_TEXT_LENGTH,
  buildRequest,
  extractScores,
  flaggedCategories,
  prepareText,
  shouldHide,
} from '../src/moderation.js';

test('prepareText skips short text and truncates long text', () => {
  assert.equal(prepareText('  hi  '), null);
  assert.equal(prepareText(null), null);
  assert.equal(prepareText('a   reasonably\n\nlong forum post'), 'a reasonably long forum post');
  assert.equal(prepareText('x'.repeat(MAX_TEXT_LENGTH + 100)).length, MAX_TEXT_LENGTH);
});

test('buildRequest asks one noul per category', () => {
  const request = buildRequest('some post');
  assert.equal(request.model, 'jev-latest');
  assert.deepEqual(request.state, { post: 'some post' });
  assert.deepEqual(Object.keys(request.questions), CATEGORIES);
  for (const q of Object.values(request.questions)) assert.equal(q.type, 'noul');
});

test('extractScores reads noul values and rejects incomplete responses', () => {
  const response = {
    answers: {
      racist: { type: 'noul', noul: 0.1 },
      sexist: { type: 'noul', noul: 0.8 },
      violent: { type: 'noul', noul: 0.05 },
    },
  };
  assert.deepEqual(extractScores(response), { racist: 0.1, sexist: 0.8, violent: 0.05 });
  assert.throws(() => extractScores({}));
  assert.throws(() => extractScores({ answers: { racist: { noul: 0.1 } } }));
});

test('shouldHide when any category reaches the threshold', () => {
  const clean = { racist: 0.1, sexist: 0.2, violent: 0.69 };
  const violent = { racist: 0.1, sexist: 0.2, violent: 0.7 };
  assert.equal(shouldHide(clean, 0.7), false);
  assert.equal(shouldHide(violent, 0.7), true);
  assert.deepEqual(flaggedCategories(violent, 0.7), ['violent']);
});
