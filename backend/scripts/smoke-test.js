const baseUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
const password = process.env.APP_PASSWORD || '';
const testKey = `codex-smoke-${Date.now()}`;
const testChild = 987654321;

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (password) headers['X-App-Password'] = password;
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {}
  return { response, body };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const health = await request('/healthz');
  assert(health.response.ok, `/healthz failed with ${health.response.status}`);
  assert(health.body && health.body.ok === true, '/healthz did not return ok=true');

  if (password) {
    const unauth = await fetch(`${baseUrl}/api/regs`);
    assert(unauth.status === 401, `Expected /api/regs without password to return 401, got ${unauth.status}`);
  }

  const before = await request('/api/regs');
  assert(before.response.ok, `/api/regs failed with ${before.response.status}`);
  assert(before.body && typeof before.body === 'object' && !Array.isArray(before.body), '/api/regs did not return an object');

  const add = await request(`/api/regs/${encodeURIComponent(testKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ child: testChild }),
  });
  assert(add.response.ok, `POST /api/regs failed with ${add.response.status}`);

  const afterAdd = await request('/api/regs');
  assert(Array.isArray(afterAdd.body[testKey]), 'Smoke registration was not saved');
  assert(afterAdd.body[testKey].includes(testChild), 'Smoke child id was not returned after save');

  const remove = await request(`/api/regs/${encodeURIComponent(testKey)}/${testChild}`, {
    method: 'DELETE',
  });
  assert(remove.response.ok, `DELETE /api/regs failed with ${remove.response.status}`);

  const afterRemove = await request('/api/regs');
  assert(!afterRemove.body[testKey] || !afterRemove.body[testKey].includes(testChild), 'Smoke registration was not removed');

  console.log(`Smoke test passed for ${baseUrl} (${health.body.db})`);
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
