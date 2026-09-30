import { integrationConfig } from '../config/integrationConfig.js';
import { listPendingLeads, readLead, updateLeadSync } from '../models/leadStore.js';
import { sendLeadEvent } from './crmWebhook.js';

const activeLeads = new Set();
let retryPassRunning = false;

function nextDelay(attempts) {
  return Math.min(integrationConfig.retryBaseMs * 2 ** Math.min(attempts - 1, 10), integrationConfig.retryMaxMs);
}

export async function deliverLead(id) {
  if (activeLeads.has(id)) return { status: 'pending', reason: 'delivery_in_progress' };
  activeLeads.add(id);
  try {
    const lead = await readLead(id);
    if (!lead) throw new Error(`Saved lead ${id} was not found`);
    if (lead.crm_sync.status === 'sent') return lead.crm_sync;

    const attempts = (lead.crm_sync.attempts || 0) + 1;
    const attemptTime = new Date().toISOString();
    const result = await sendLeadEvent(lead);
    const sync = {
      ...result,
      attempts,
      last_attempt_at: attemptTime,
      next_retry_at: result.status === 'pending'
        ? new Date(Date.now() + nextDelay(attempts)).toISOString()
        : null,
    };
    await updateLeadSync(lead, sync);
    console.info(`Lead ${id} CRM sync ${sync.status} (${sync.reason || 'delivered'}), attempt ${attempts}`);
    return sync;
  } finally {
    activeLeads.delete(id);
  }
}

export async function retryPendingLeads() {
  if (retryPassRunning) return;
  retryPassRunning = true;
  try {
    const pending = await listPendingLeads();
    for (const lead of pending) {
      if (lead.crm_sync.next_retry_at && Date.parse(lead.crm_sync.next_retry_at) > Date.now()) continue;
      try {
        await deliverLead(lead.id);
      } catch (error) {
        console.error(`Could not retry lead ${lead.id}:`, error);
      }
    }
  } catch (error) {
    console.error('Could not scan pending leads:', error);
  } finally {
    retryPassRunning = false;
  }
}

export function startLeadRetryWorker() {
  void retryPendingLeads();
  return setInterval(() => void retryPendingLeads(), integrationConfig.retryPollMs);
}
