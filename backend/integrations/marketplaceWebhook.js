import { integrationConfig } from '../config/integrationConfig.js';

export async function sendMarketplaceEvent(stored) {
  const { received_at, crm_sync, ...event } = stored;
  try {
    const url = new URL(integrationConfig.marketplaceWebhookUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported webhook protocol');
    const headers = { 'Content-Type': 'application/json' };
    if (integrationConfig.apiKey) headers['X-Webhook-Key'] = integrationConfig.apiKey;
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(event), signal: AbortSignal.timeout(integrationConfig.timeoutMs) });
    if (!response.ok) {
      console.warn(`Marketplace webhook returned HTTP ${response.status} for ${stored.event_id}`);
      return { status: 'pending', reason: `http_${response.status}` };
    }
    return { status: 'sent', sent_at: new Date().toISOString() };
  } catch (error) {
    console.warn(`Marketplace webhook failed for ${stored.event_id}: ${error.message}`);
    return { status: 'pending', reason: 'delivery_failed' };
  }
}
