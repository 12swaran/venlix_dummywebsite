import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const directory = await mkdtemp(path.join(tmpdir(), 'aurelia-marketplace-'));
const requests = [];
let responseStatus = 503;
const crm = createServer(async (request, response) => {
  let body = '';
  for await (const chunk of request) body += chunk;
  requests.push({ headers: request.headers, body: JSON.parse(body), path: request.url });
  response.writeHead(responseStatus).end();
});
await new Promise((resolve) => crm.listen(0, '127.0.0.1', resolve));

process.env.MARKETPLACE_DATA_DIR = directory;
process.env.CRM_MARKETPLACE_WEBHOOK_URL = `http://127.0.0.1:${crm.address().port}/api/marketplace-events`;
process.env.LEAD_WEBHOOK_API_KEY = 'local-secret';

const { prepareMarketplaceEvent } = await import('../marketplaceEvent.js');
const { createMarketplaceEvent, readMarketplaceEvent, updateMarketplaceEventSync } = await import('../models/marketplaceEventStore.js');
const { deliverMarketplaceEvent, retryMarketplaceEvents } = await import('../integrations/marketplaceDelivery.js');

test('persists an activity event and retries its identical payload after CRM failure', async (t) => {
  t.after(async () => {
    if (crm.listening) await new Promise((resolve) => crm.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  const event = prepareMarketplaceEvent({
    event_id: randomUUID(), visitor_id: randomUUID(), session_id: randomUUID(),
    occurred_at: new Date().toISOString(), event: 'added_to_cart',
    properties: { product_id: 'mindful-reset', quantity: 1 },
  });
  const firstSave = await createMarketplaceEvent(event);
  assert.equal(firstSave.duplicate, false);
  assert.equal((await createMarketplaceEvent(event)).duplicate, true);
  await deliverMarketplaceEvent(event.event_id);
  const failed = await readMarketplaceEvent(event.event_id);
  assert.equal(failed.crm_sync.status, 'pending');
  assert.equal(failed.crm_sync.reason, 'http_503');
  assert.equal(failed.crm_sync.attempts, 1);
  responseStatus = 204;
  await updateMarketplaceEventSync(failed, { ...failed.crm_sync, next_retry_at: new Date(0).toISOString() });
  await retryMarketplaceEvents();
  const delivered = await readMarketplaceEvent(event.event_id);
  assert.equal(delivered.crm_sync.status, 'sent');
  assert.equal(delivered.crm_sync.attempts, 2);
  assert.deepEqual(requests[0].body, requests[1].body);
  assert.deepEqual(requests[0].body, event);
  assert.equal(requests[0].path, '/api/marketplace-events');
  assert.equal(requests[0].headers['x-webhook-key'], 'local-secret');
  assert.match(requests[0].headers['content-type'], /^application\/json/);
});
