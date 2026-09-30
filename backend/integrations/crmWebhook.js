import { integrationConfig } from '../config/integrationConfig.js';

const leadFields = ['name', 'email', 'phone', 'company', 'industry', 'interest', 'message'];

export function leadEventPayload(lead) {
  const fields = Object.fromEntries(
    leadFields.filter((key) => lead[key] !== undefined && lead[key] !== '').map((key) => [key, lead[key]]),
  );
  return { source: lead.source, event: 'new_lead', lead: fields, time: lead.created_at };
}

export async function sendLeadEvent(lead, config = integrationConfig, fetchImpl = fetch) {
  try {
    const url = new URL(config.webhookUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported webhook protocol');

    const headers = { 'Content-Type': 'application/json' };
    if (config.apiKey) headers['X-Webhook-Key'] = config.apiKey;

    const response = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(leadEventPayload(lead)),
      signal: AbortSignal.timeout(config.timeoutMs),
    });

    if (!response.ok) {
      console.warn(`CRM webhook returned HTTP ${response.status} for ${lead.id}`);
      return { status: 'pending', reason: `http_${response.status}` };
    }
    return { status: 'sent', sent_at: new Date().toISOString() };
  } catch (error) {
    console.warn(`CRM webhook failed for ${lead.id}: ${error.message}`);
    return { status: 'pending', reason: 'delivery_failed' };
  }
}
