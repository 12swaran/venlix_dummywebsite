import { randomUUID } from 'node:crypto';
import { catalogById, categories } from './catalog.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedEvents = new Set([
  'account_created', 'login_attempted', 'login_succeeded', 'search_performed', 'listing_viewed',
  'added_to_cart', 'checkout_started', 'demo_order_completed',
]);

export function isUuid(value) {
  return typeof value === 'string' && uuid.test(value);
}

function items(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) throw new Error('Cart items are required.');
  const normalized = value.map((entry) => {
    const product = catalogById.get(entry?.product_id);
    const quantity = entry?.quantity;
    if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) throw new Error('Invalid cart item.');
    return { product_id: product.id, quantity, unit_price: product.price };
  });
  if (new Set(normalized.map((item) => item.product_id)).size !== normalized.length) throw new Error('Duplicate cart item.');
  return { items: normalized, total: normalized.reduce((sum, item) => sum + item.unit_price * item.quantity, 0), currency: 'INR' };
}

export function prepareMarketplaceEvent(input, account = null) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid event.');
  if (!allowedEvents.has(input.event)) throw new Error('Unsupported event.');
  if (!isUuid(input.event_id) || !isUuid(input.visitor_id) || !isUuid(input.session_id)) throw new Error('Invalid event identity.');
  const occurredAt = new Date(input.occurred_at);
  if (Number.isNaN(occurredAt.getTime()) || occurredAt.getTime() > Date.now() + 300000) throw new Error('Invalid event time.');
  const details = input.properties && typeof input.properties === 'object' && !Array.isArray(input.properties) ? input.properties : {};
  let properties = {};

  if (input.event === 'search_performed') {
    if (!categories.includes(details.category)) throw new Error('Invalid search category.');
    if (!Number.isInteger(details.result_count) || details.result_count < 0 || details.result_count > 1000) throw new Error('Invalid result count.');
    properties = { category: details.category, result_count: details.result_count };
  } else if (input.event === 'listing_viewed' || input.event === 'added_to_cart') {
    const product = catalogById.get(details.product_id);
    if (!product) throw new Error('Unknown offering.');
    properties = { product_id: product.id, category: product.category };
    if (input.event === 'added_to_cart') {
      if (!Number.isInteger(details.quantity) || details.quantity < 1 || details.quantity > 10) throw new Error('Invalid quantity.');
      properties.quantity = details.quantity;
      properties.unit_price = product.price;
      properties.currency = 'INR';
    }
  } else if (input.event === 'checkout_started' || input.event === 'demo_order_completed') {
    if (!account) throw new Error('Sign in before checkout.');
    properties = items(details.items);
    properties.checkout_id = isUuid(details.checkout_id) ? details.checkout_id : randomUUID();
    properties.simulated = true;
  }

  return {
    event_id: input.event_id,
    source: 'aurelia_marketplace',
    event: input.event,
    visitor_id: input.visitor_id,
    session_id: input.session_id,
    user_id: account?.id || null,
    contact: account ? { name: account.name, email: account.email } : null,
    occurred_at: occurredAt.toISOString(),
    properties,
  };
}
