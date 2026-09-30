// Point this at a reachable CRM address when the services run on different computers.
export const integrationConfig = {
  webhookUrl: (process.env.CRM_WEBHOOK_URL || 'http://localhost:3000/api/lead-events').trim(),
  marketplaceWebhookUrl: (process.env.CRM_MARKETPLACE_WEBHOOK_URL || 'http://localhost:3000/api/marketplace-events').trim(),
  apiKey: (process.env.LEAD_WEBHOOK_API_KEY || '').trim(),
  timeoutMs: 5000,
  retryPollMs: 5000,
  retryBaseMs: 10000,
  retryMaxMs: 300000,
};
