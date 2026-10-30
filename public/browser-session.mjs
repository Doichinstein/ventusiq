// A capability for this browser only. Never send it to an external service,
// put it in a URL, or include it in a weather/places export.
export const BROWSER_KEY = 'ventusiq.browser-key.v1';
const valid = value => /^viq1_[a-f0-9]{64}$/.test(value || '');
export function browserKey(window) {
  try {
    let key = window.localStorage.getItem(BROWSER_KEY);
    if (key !== null && !valid(key)) throw Error('Invalid saved browser key');
    if (!key) {
      key = 'viq1_' + [...window.crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2, '0')).join('');
      window.localStorage.setItem(BROWSER_KEY, key);
      if (window.localStorage.getItem(BROWSER_KEY) !== key) throw Error('Browser key was not saved');
    }
    return key;
  } catch {
    throw Error('Private browser storage is unavailable. Allow site storage to manage watches, push and webhooks. Public weather tools still work.');
  }
}
export function browserFetch(window, fetcher = globalThis.fetch) {
  return (path, options = {}) => {
    const url = new URL(path, window.location.href);
    if (url.origin !== window.location.origin || !['/api/watches', '/api/push', '/api/webhooks'].includes(url.pathname)) throw Error('Browser key cannot be sent to this address');
    const headers = new Headers(options.headers);
    headers.set('Authorization', 'Bearer ' + browserKey(window));
    return fetcher(url.href, {...options, headers, credentials: 'omit', redirect: 'error', cache: 'no-store'});
  };
}
