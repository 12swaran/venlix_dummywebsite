async function request(url, options = {}) {
  let response;
  try {
    response = await fetch(url, { credentials: 'same-origin', ...options });
  } catch {
    throw new Error('The local website server is unavailable. Please try again.');
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Something went wrong. Please try again.');
  return result;
}

function json(method, body) {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export const getCatalog = () => request('/api/marketplace/catalog');
export const getAccount = () => request('/api/auth/me');
export const register = (details) => request('/api/auth/register', json('POST', details));
export const login = (details) => request('/api/auth/login', json('POST', details));
export const logout = () => request('/api/auth/logout', json('POST', {}));
export const postEvent = (event) => request('/api/marketplace/events', json('POST', event));
