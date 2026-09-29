// A stand-in for the GitHub repository-variables API (list of named variables, PATCH / POST like the real one).
export function fakeGitHub(initial = {}) {
  const store = { vars: { ...initial }, calls: [], down: false };
  const fetchImpl = async (url, init = {}) => {
    const method = init.method || 'GET';
    store.calls.push({ url, method, auth: init.headers?.Authorization, name: url.split('/').pop() });
    if (store.down) return new Response('boom', { status: 500 });
    const name = url.split('/').pop();
    if (method === 'GET') return name in store.vars ? Response.json({ name, value: store.vars[name] }) : new Response('{}', { status: 404 });
    const body = JSON.parse(init.body);
    if (method === 'PATCH' && !(body.name in store.vars)) return new Response('{}', { status: 404 });
    store.vars[body.name] = body.value;
    return new Response(null, { status: method === 'POST' ? 201 : 204 });
  };
  return { store, fetchImpl };
}
