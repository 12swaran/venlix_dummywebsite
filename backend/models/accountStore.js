import { createHash, randomBytes, randomUUID, scrypt as callbackScrypt, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scrypt = promisify(callbackScrypt);
const root = process.env.MARKETPLACE_DATA_DIR
  ? path.resolve(process.env.MARKETPLACE_DATA_DIR)
  : path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'marketplace');
const accountsDir = path.join(root, 'accounts');
const sessionsDir = path.join(root, 'sessions');
const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000;

function accountPath(email) {
  const key = createHash('sha256').update(email).digest('hex');
  return path.join(accountsDir, `${key}.json`);
}

function sessionPath(token) {
  const key = createHash('sha256').update(token).digest('hex');
  return path.join(sessionsDir, `${key}.json`);
}

export function publicAccount(account) {
  return { id: account.id, name: account.name, email: account.email };
}

export async function createAccount({ name, email, password }) {
  await mkdir(accountsDir, { recursive: true });
  const salt = randomBytes(16).toString('hex');
  const hash = (await scrypt(password, salt, 64)).toString('hex');
  const account = { id: randomUUID(), name, email, password: `${salt}:${hash}`, created_at: new Date().toISOString() };
  await writeFile(accountPath(email), JSON.stringify(account), { flag: 'wx', mode: 0o600 });
  return publicAccount(account);
}

export async function verifyAccount(email, password) {
  let account;
  try {
    account = JSON.parse(await readFile(accountPath(email), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const [salt, savedHash] = account.password.split(':');
  const suppliedHash = await scrypt(password, salt, 64);
  if (!timingSafeEqual(Buffer.from(savedHash, 'hex'), suppliedHash)) return null;
  return publicAccount(account);
}

export async function createSession(account) {
  await mkdir(sessionsDir, { recursive: true });
  const token = randomBytes(32).toString('hex');
  const session = { account, expires_at: new Date(Date.now() + sessionLifetimeMs).toISOString() };
  await writeFile(sessionPath(token), JSON.stringify(session), { flag: 'wx', mode: 0o600 });
  return token;
}

export async function accountForToken(token) {
  if (!/^[a-f0-9]{64}$/i.test(token || '')) return null;
  try {
    const session = JSON.parse(await readFile(sessionPath(token), 'utf8'));
    if (Date.parse(session.expires_at) <= Date.now()) {
      await deleteSession(token);
      return null;
    }
    return session.account;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function deleteSession(token) {
  if (!/^[a-f0-9]{64}$/i.test(token || '')) return;
  try {
    await unlink(sessionPath(token));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

export function tokenFromRequest(req) {
  const cookie = (req.headers.cookie || '').split(';').map((part) => part.trim())
    .find((part) => part.startsWith('aurelia_session='));
  return cookie?.slice('aurelia_session='.length) || null;
}

export const sessionMaxAgeSeconds = sessionLifetimeMs / 1000;
