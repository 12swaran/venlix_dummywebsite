import { Router } from 'express';
import { createLead, readLead } from '../models/leadStore.js';
import { deliverLead } from '../integrations/leadDelivery.js';

export const leadsRouter = Router();

const limits = { name: 100, email: 254, phone: 40, company: 120, industry: 80, interest: 100, message: 1000 };

function validateLead(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'Invalid lead data.' };
  const fields = {};
  for (const [key, limit] of Object.entries(limits)) {
    const value = input[key];
    if (value === undefined || value === null || value === '') continue;
    if (typeof value !== 'string') return { error: `${key} must be text.` };
    const trimmed = value.trim();
    if (trimmed.length > limit) return { error: `${key} is too long.` };
    if (trimmed) fields[key] = trimmed;
  }
  if (!fields.name || !fields.email || !fields.phone) return { error: 'Name, email, and phone are required.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) return { error: 'Enter a valid email address.' };
  if (!/^\+?[\d\s().-]+$/.test(fields.phone) || fields.phone.replace(/\D/g, '').length < 7 || fields.phone.replace(/\D/g, '').length > 15) {
    return { error: 'Enter a valid phone number.' };
  }
  return { fields };
}

leadsRouter.post('/', async (req, res) => {
  const { fields, error } = validateLead(req.body);
  if (error) return res.status(400).json({ error });

  try {
    const lead = await createLead(fields);
    let sync = lead.crm_sync;
    try {
      sync = await deliverLead(lead.id);
    } catch (deliveryError) {
      console.error(`Lead ${lead.id} saved, but delivery could not complete:`, deliveryError);
    }
    return res.status(201).json({ id: lead.id, saved: true, crmSync: sync.status });
  } catch (saveError) {
    console.error('Could not save lead:', saveError);
    return res.status(500).json({ error: 'We could not save your request. Please try again.' });
  }
});

leadsRouter.get('/:id/status', async (req, res) => {
  try {
    const lead = await readLead(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found.' });
    return res.json({ id: lead.id, crmSync: lead.crm_sync.status });
  } catch (error) {
    console.error('Could not read lead status:', error);
    return res.status(500).json({ error: 'Could not read delivery status.' });
  }
});
