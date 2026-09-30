import { postEvent } from './api.js';

const visitorKey = 'aurelia.visitor';
const sessionKey = 'aurelia.session';
const outboxKey = 'aurelia.activity.outbox';
let flushing = null;

function id(storage, key) {
  let value = storage.getItem(key);
  if (!value) { value = crypto.randomUUID(); storage.setItem(key, value); }
  return value;
}

export function identity() {
  return { visitor_id: id(localStorage, visitorKey), session_id: id(sessionStorage, sessionKey) };
}

function readOutbox() {
  try {
    const items = JSON.parse(localStorage.getItem(outboxKey) || '[]');
    return Array.isArray(items) ? items : [];
  } catch { return []; }
}

function saveOutbox(items) { localStorage.setItem(outboxKey, JSON.stringify(items)); }

export async function flushActivity() {
  if (flushing) return flushing;
  flushing = (async () => {
    while (readOutbox().length) {
      const event = readOutbox()[0];
      try {
        await postEvent(event);
        saveOutbox(readOutbox().filter((item) => item.event_id !== event.event_id));
      } catch (error) {
        // A local server outage keeps the event in this browser until the next visit or reconnect.
        if (/unavailable/i.test(error.message) || /Sign in before checkout/i.test(error.message)) break;
        saveOutbox(readOutbox().filter((item) => item.event_id !== event.event_id));
        console.warn('Marketplace activity rejected:', error.message);
      }
    }
  })().finally(() => { flushing = null; });
  return flushing;
}

export async function trackActivity(event, properties = {}) {
  const activity = { event_id: crypto.randomUUID(), ...identity(), event, occurred_at: new Date().toISOString(), properties };
  saveOutbox([...readOutbox(), activity]);
  await flushActivity();
  return activity.event_id;
}
