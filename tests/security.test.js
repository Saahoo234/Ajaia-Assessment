import test from 'node:test';
import assert from 'node:assert/strict';
import { canView, canEdit, cleanHtml, validTitle, isKnownUser } from '../server/security.js';
test('owner and shared user can view and edit; unrelated user cannot', () => {
  assert.equal(canView('alice', ['bob'], 'alice'), true);
  assert.equal(canView('alice', ['bob'], 'bob'), true);
  assert.equal(canEdit('alice', ['bob'], 'bob'), true);
  assert.equal(canView('alice', ['bob'], 'charlie'), false);
  assert.equal(canEdit('alice', ['bob'], 'charlie'), false);
});
test('sanitizes scripts and handlers while preserving formatted text', () => {
  const html = cleanHtml('<h2 onclick="hack()">Hello</h2><script>alert(1)</script><p><strong>Bold</strong></p>');
  assert.match(html, /<h2>Hello<\/h2>/);
  assert.match(html, /<strong>Bold<\/strong>/);
  assert.doesNotMatch(html, /<script|onclick=/);
});
test('validates title and seeded users', () => {
  assert.equal(validTitle('  '), false);
  assert.equal(validTitle('x'.repeat(121)), false);
  assert.equal(validTitle('Planning notes'), true);
  assert.equal(isKnownUser('alice'), true);
  assert.equal(isKnownUser('unknown'), false);
});
