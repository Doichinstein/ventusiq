// Account IDs and browser capabilities occupy separate namespaces. A client
// supplies a random secret, never an owner ID; only its digest is stored.
export async function browserOwner(request) {
  const header = request.headers.get('authorization') || '';
  if (!/^Bearer viq1_[a-f0-9]{64}$/.test(header)) return null;
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(header.slice(7)));
  return 'browser:' + [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, '0')).join('');
}
