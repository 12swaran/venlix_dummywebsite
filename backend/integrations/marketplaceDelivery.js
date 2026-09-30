import { integrationConfig } from '../config/integrationConfig.js';
import { createMarketplaceEvent, listPendingMarketplaceEvents, readMarketplaceEvent, updateMarketplaceEventSync } from '../models/marketplaceEventStore.js';
import { sendMarketplaceEvent } from './marketplaceWebhook.js';

const active = new Set();
let scanning = false;

function retryDelay(attempts) { return Math.min(integrationConfig.retryBaseMs * 2 ** Math.min(attempts - 1, 10), integrationConfig.retryMaxMs); }

export async function deliverMarketplaceEvent(id) {
  if (active.has(id)) return;
  active.add(id);
  try {
    const event = await readMarketplaceEvent(id);
    if (!event || event.crm_sync.status === 'sent') return;
    const attempts = (event.crm_sync.attempts || 0) + 1;
    const result = await sendMarketplaceEvent(event);
    const sync = { ...result, attempts, last_attempt_at: new Date().toISOString(), next_retry_at: result.status === 'pending' ? new Date(Date.now() + retryDelay(attempts)).toISOString() : null };
    await updateMarketplaceEventSync(event, sync);
    console.info(`Marketplace event ${id} CRM sync ${sync.status} (${sync.reason || 'delivered'})`);
  } finally { active.delete(id); }
}

export async function queueMarketplaceEvent(event) {
  const result = await createMarketplaceEvent(event);
  if (result.stored.crm_sync.status === 'pending') {
    void deliverMarketplaceEvent(result.stored.event_id).catch((error) => console.error('Marketplace event delivery failed:', error));
  }
  return result;
}

export async function retryMarketplaceEvents() {
  if (scanning) return;
  scanning = true;
  try {
    for (const event of await listPendingMarketplaceEvents()) {
      if (event.crm_sync.next_retry_at && Date.parse(event.crm_sync.next_retry_at) > Date.now()) continue;
      try { await deliverMarketplaceEvent(event.event_id); }
      catch (error) { console.error(`Could not retry marketplace event ${event.event_id}:`, error); }
    }
  } catch (error) { console.error('Could not scan marketplace events:', error); }
  finally { scanning = false; }
}

export function startMarketplaceRetryWorker() {
  void retryMarketplaceEvents();
  return setInterval(() => void retryMarketplaceEvents(), integrationConfig.retryPollMs);
}
