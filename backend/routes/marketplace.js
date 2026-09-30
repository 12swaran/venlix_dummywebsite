import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { catalog, categories } from '../catalog.js';
import { accountForToken, createAccount, createSession, deleteSession, publicAccount, sessionMaxAgeSeconds, tokenFromRequest, verifyAccount } from '../models/accountStore.js';
import { prepareMarketplaceEvent, isUuid } from '../marketplaceEvent.js';
import { queueMarketplaceEvent } from '../integrations/marketplaceDelivery.js';
import { readMarketplaceEvent } from '../models/marketplaceEventStore.js';

export const marketplaceRouter = Router();
export const authRouter = Router();

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const loginAttempts = new Map();

function normalizeEmail(value) { return typeof value === 'string' ? value.trim().toLowerCase() : ''; }
function cookieOptions(req) { return { httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/', maxAge: sessionMaxAgeSeconds * 1000 }; }
async function currentAccount(req) { return accountForToken(tokenFromRequest(req)); }

async function recordIdentity(req, account, eventName) {
  const visitorId = isUuid(req.body.visitor_id) ? req.body.visitor_id : randomUUID();
  const sessionId = isUuid(req.body.session_id) ? req.body.session_id : randomUUID();
  const event = prepareMarketplaceEvent({ event_id: randomUUID(), visitor_id: visitorId, session_id: sessionId, occurred_at: new Date().toISOString(), event: eventName }, account);
  await queueMarketplaceEvent(event);
}

marketplaceRouter.get('/catalog', (_req, res) => res.json({ products: catalog, categories }));

marketplaceRouter.post('/events', async (req, res) => {
  try {
    const account = await currentAccount(req);
    if (['checkout_started', 'demo_order_completed'].includes(req.body?.event) && !account) return res.status(401).json({ error: 'Sign in before checkout.' });
    const event = prepareMarketplaceEvent(req.body, account);
    const { stored, duplicate } = await queueMarketplaceEvent(event);
    return res.status(duplicate ? 200 : 202).json({ eventId: stored.event_id, saved: true, crmSync: stored.crm_sync.status, duplicate });
  } catch (error) {
    if (error.message?.startsWith('Invalid') || ['Unsupported event.', 'Unknown offering.', 'Sign in before checkout.', 'Cart items are required.', 'Duplicate cart item.'].includes(error.message)) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Could not save marketplace event:', error);
    return res.status(500).json({ error: 'Activity could not be saved.' });
  }
});

marketplaceRouter.get('/events/:id/status', async (req, res) => {
  try {
    const event = await readMarketplaceEvent(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found.' });
    return res.json({ eventId: event.event_id, crmSync: event.crm_sync.status });
  } catch (error) {
    console.error('Could not read event status:', error);
    return res.status(500).json({ error: 'Could not read event status.' });
  }
});

authRouter.get('/me', async (req, res) => {
  try { return res.json({ account: await currentAccount(req) }); }
  catch (error) { console.error('Could not read account:', error); return res.status(500).json({ error: 'Could not read account.' }); }
});

authRouter.post('/register', async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;
  if (!name || name.length > 100 || !emailPattern.test(email) || email.length > 254 || typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: 'Enter a name, valid email, and password of at least 8 characters.' });
  }
  try {
    const account = await createAccount({ name, email, password });
    const token = await createSession(account);
    res.cookie('aurelia_session', token, cookieOptions(req));
    await recordIdentity(req, account, 'account_created');
    return res.status(201).json({ account });
  } catch (error) {
    if (error.code === 'EEXIST') return res.status(409).json({ error: 'An account with this email already exists.' });
    console.error('Could not create account:', error);
    return res.status(500).json({ error: 'Could not create account.' });
  }
});

authRouter.post('/login', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;
  if (!emailPattern.test(email) || typeof password !== 'string') return res.status(400).json({ error: 'Enter a valid email and password.' });
  const now = Date.now();
  const attempts = loginAttempts.get(email) || { count: 0, since: now };
  if (now - attempts.since > 15 * 60 * 1000) { attempts.count = 0; attempts.since = now; }
  if (attempts.count >= 5) return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  try {
    const account = await verifyAccount(email, password);
    if (!account) {
      attempts.count += 1;
      loginAttempts.set(email, attempts);
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }
    loginAttempts.delete(email);
    const token = await createSession(account);
    res.cookie('aurelia_session', token, cookieOptions(req));
    await recordIdentity(req, account, 'login_succeeded');
    return res.json({ account });
  } catch (error) {
    console.error('Could not sign in:', error);
    return res.status(500).json({ error: 'Could not sign in.' });
  }
});

authRouter.post('/logout', async (req, res) => {
  try {
    await deleteSession(tokenFromRequest(req));
    res.clearCookie('aurelia_session', { path: '/', sameSite: 'lax' });
    return res.json({ ok: true });
  } catch (error) {
    console.error('Could not sign out:', error);
    return res.status(500).json({ error: 'Could not sign out.' });
  }
});
