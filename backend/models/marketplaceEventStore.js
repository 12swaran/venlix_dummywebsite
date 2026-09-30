import { mkdir, readFile, readdir, writeFile, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isUuid } from '../marketplaceEvent.js';

const root = process.env.MARKETPLACE_DATA_DIR
  ? path.resolve(process.env.MARKETPLACE_DATA_DIR)
  : path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'marketplace');
const directory = path.join(root, 'events');

function filename(id) { return path.join(directory, `${id}.json`); }

async function persist(event) {
  await mkdir(directory, { recursive: true });
  const temporary = `${filename(event.event_id)}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(event, null, 2), { flag: 'wx' });
  await rename(temporary, filename(event.event_id));
}

export async function readMarketplaceEvent(id) {
  if (!isUuid(id)) return null;
  try { return JSON.parse(await readFile(filename(id), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export async function createMarketplaceEvent(event) {
  const existing = await readMarketplaceEvent(event.event_id);
  if (existing) return { stored: existing, duplicate: true };
  const stored = { ...event, received_at: new Date().toISOString(), crm_sync: { status: 'pending', reason: 'not_attempted', attempts: 0, next_retry_at: null } };
  await persist(stored);
  return { stored, duplicate: false };
}

export async function updateMarketplaceEventSync(event, sync) {
  const updated = { ...event, crm_sync: sync };
  await persist(updated);
  return updated;
}

export async function listPendingMarketplaceEvents() {
  await mkdir(directory, { recursive: true });
  const pending = [];
  for (const file of await readdir(directory)) {
    if (!/^[0-9a-f-]{36}\.json$/i.test(file)) continue;
    try {
      const event = JSON.parse(await readFile(path.join(directory, file), 'utf8'));
      if (event.crm_sync?.status === 'pending') pending.push(event);
    } catch (error) { console.error(`Could not read marketplace event ${file}:`, error); }
  }
  return pending.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
}
