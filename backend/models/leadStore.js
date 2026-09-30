import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDirectory = process.env.LEAD_DATA_DIR
  ? path.resolve(process.env.LEAD_DATA_DIR)
  : path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'leads');

async function persist(lead) {
  await mkdir(dataDirectory, { recursive: true });
  const destination = path.join(dataDirectory, `${lead.id}.json`);
  const temporary = `${destination}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(lead, null, 2), { flag: 'wx' });
  await rename(temporary, destination);
}

export async function createLead(fields) {
  const lead = {
    id: `lead_${randomUUID()}`,
    source: 'dummy_website',
    ...fields,
    created_at: new Date().toISOString(),
    crm_sync: { status: 'pending', reason: 'not_attempted', attempts: 0, next_retry_at: null },
  };
  await persist(lead);
  return lead;
}

export async function updateLeadSync(lead, crmSync) {
  const updated = { ...lead, crm_sync: crmSync };
  await persist(updated);
  return updated;
}

export async function readLead(id) {
  const safeId = /^lead_[a-f0-9-]{36}$/i.test(id) ? id : null;
  if (!safeId) return null;
  try {
    return JSON.parse(await readFile(path.join(dataDirectory, `${safeId}.json`), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function listPendingLeads() {
  await mkdir(dataDirectory, { recursive: true });
  const leads = [];
  for (const file of await readdir(dataDirectory)) {
    if (!/^lead_[a-f0-9-]{36}\.json$/i.test(file)) continue;
    try {
      const lead = JSON.parse(await readFile(path.join(dataDirectory, file), 'utf8'));
      if (lead.crm_sync?.status === 'pending') leads.push(lead);
    } catch (error) {
      console.error(`Could not read saved lead ${file}:`, error);
    }
  }
  return leads;
}
