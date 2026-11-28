import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildReminderViewDeepLinkUrl,
  createDeepLinkIntentBuffer,
  parseDeepLinkIntent,
} from './deepLinkIntent';

test('widget URLs map to stable route intents', () => {
  assert.deepEqual(parseDeepLinkIntent('popreminder://?action=add'), { action: 'add' });
  assert.deepEqual(parseDeepLinkIntent('popreminder://?action=past'), { action: 'past' });
  assert.deepEqual(parseDeepLinkIntent('popreminder://?action=view&id=abc%20123'), {
    action: 'view',
    id: 'abc 123',
  });
  assert.equal(parseDeepLinkIntent('popreminder://?action=unknown'), null);
});

test('reminder view URL builder encodes reminder IDs and round-trips through parseDeepLinkIntent', () => {
  const url = buildReminderViewDeepLinkUrl('abc 123&x=1');
  assert.equal(url, 'popreminder://?action=view&id=abc%20123%26x%3D1');
  assert.deepEqual(parseDeepLinkIntent(url), {
    action: 'view',
    id: 'abc 123&x=1',
  });
});

test('intent received before bootstrap is retained and duplicate receipt is consumed once', () => {
  const buffer = createDeepLinkIntentBuffer();
  assert.equal(buffer.receive('popreminder://?action=add'), true);
  assert.equal(buffer.receive('popreminder://?action=add'), false);
  assert.deepEqual(buffer.consume(), { action: 'add' });
  assert.equal(buffer.consume(), null);
});
