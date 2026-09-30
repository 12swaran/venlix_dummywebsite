import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { leadsRouter } from './routes/leads.js';
import { startLeadRetryWorker } from './integrations/leadDelivery.js';
import { authRouter, marketplaceRouter } from './routes/marketplace.js';
import { startMarketplaceRetryWorker } from './integrations/marketplaceDelivery.js';

const app = express();
const port = Number(process.env.PORT) || 3001;
const frontendDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../frontend/dist');

app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));
app.use('/api/leads', leadsRouter);
app.use('/api/marketplace', marketplaceRouter);
app.use('/api/auth', authRouter);
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use((error, _req, res, next) => {
  if (error instanceof SyntaxError && 'body' in error) return res.status(400).json({ error: 'Invalid JSON.' });
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
  next(error);
});

if (existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (_req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
}

app.listen(port, () => {
  console.info(`Aurelia API listening on http://localhost:${port}`);
  startLeadRetryWorker();
  startMarketplaceRetryWorker();
});
