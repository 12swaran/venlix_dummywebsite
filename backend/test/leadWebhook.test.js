import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const directory = await mkdtemp(path.join(tmpdir(), 'aurelia-leads-'));
const requests = [];
let responseStatus = 503;
const crm = createServer(async (request, response) => {
  let body = '';
  for await (const chunk of request) body += chunk;
  requests.push({ method: request.method, path: request.url, headers: request.headers, body: JSON.parse(body) });
  response.writeHead(responseStatus).end();
});
await new Promise((resolve) => crm.listen(0, '127.0.0.1', resolve));

process.env.LEAD_DATA_DIR = directory;
process.env.CRM_WEBHOOK_URL = `http://127.0.0.1:${crm.address().port}/api/lead-events`;
process.env.LEAD_WEBHOOK_API_KEY = 'local-secret';

const { createLead, readLead, updateLeadSync } = await import('../models/leadStore.js');
const { deliverLead, retryPendingLeads } = await import('../integrations/leadDelivery.js');
const { sendLeadEvent } = await import('../integrations/crmWebhook.js');

test('saves a failed delivery and retries the identical event with the configured key', async (t) => {
  t.after(async () => {
    if (crm.listening) await new Promise((resolve) => crm.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });

  const lead = await createLead({
    name: 'Rahul Sharma', email: 'rahul@example.com', phone: '9876543210',
    company: 'ABC Healthcare', industry: 'Healthcare', interest: 'Expert consultations',
    message: 'Please contact me',
  });
  const first = await deliverLead(lead.id);
  assert.equal(first.status, 'pending');
  assert.equal(first.reason, 'http_503');
  assert.equal(first.attempts, 1);
  assert.ok(first.next_retry_at);

  const stored = await readLead(lead.id);
  assert.equal(stored.created_at, lead.created_at);
  assert.equal(stored.crm_sync.status, 'pending');

  responseStatus = 202;
  await updateLeadSync(stored, { ...stored.crm_sync, next_retry_at: new Date(0).toISOString() });
  await retryPendingLeads();

  const delivered = await readLead(lead.id);
  assert.equal(delivered.crm_sync.status, 'sent');
  assert.equal(delivered.crm_sync.attempts, 2);
  assert.equal(delivered.crm_sync.next_retry_at, null);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0].body, requests[1].body);
  assert.deepEqual(requests[0].body, {
    source: 'dummy_website', event: 'new_lead',
    lead: {
      name: 'Rahul Sharma', email: 'rahul@example.com', phone: '9876543210',
      company: 'ABC Healthcare', industry: 'Healthcare', interest: 'Expert consultations',
      message: 'Please contact me',
    },
    time: lead.created_at,
  });
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].path, '/api/lead-events');
  assert.match(requests[0].headers['content-type'], /^application\/json/);
  assert.equal(requests[0].headers['x-webhook-key'], 'local-secret');

  const optionalLead = await createLead({ name: 'Sam', email: 'sam@example.com', phone: '+1 555 123 4567' });
  responseStatus = 204;
  const withoutKey = await sendLeadEvent(optionalLead, {
    webhookUrl: process.env.CRM_WEBHOOK_URL, apiKey: '', timeoutMs: 5000,
  });
  assert.equal(withoutKey.status, 'sent');
  assert.equal(requests[2].headers['x-webhook-key'], undefined);
  assert.deepEqual(requests[2].body.lead, {
    name: 'Sam', email: 'sam@example.com', phone: '+1 555 123 4567',
  });

  await new Promise((resolve) => crm.close(resolve));
  const networkLead = await createLead({ name: 'Alex', email: 'alex@example.com', phone: '9876543210' });
  const networkFailure = await deliverLead(networkLead.id);
  assert.equal(networkFailure.status, 'pending');
  assert.equal(networkFailure.reason, 'delivery_failed');
  assert.equal((await readLead(networkLead.id)).crm_sync.status, 'pending');
});
