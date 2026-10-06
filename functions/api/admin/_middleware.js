/* ============================================================================
   Gatekeeper for every /api/admin/* request.
   ----------------------------------------------------------------------------
   Cloudflare Access sits in front of /admin/* and /api/admin/* and only lets
   you through after you log in. It then adds a signed token
   (Cf-Access-Jwt-Assertion) to each request. This file verifies that token
   itself, so even if the Access application were ever misconfigured, the
   admin API (and the Supabase secret key behind it) stays locked.

   Environment variables:
     ACCESS_TEAM_DOMAIN   e.g. yourteam.cloudflareaccess.com
     ACCESS_AUD           the Access application's "Application Audience (AUD) Tag"
   Local development only (in .dev.vars, never in Cloudflare):
     DEV_ALLOW_NO_ACCESS=true   skips the check for localhost requests
   ============================================================================ */
import { error } from '../../_lib/http.js';

let certCache = { team: null, keys: null, expires: 0 };

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const b64urlJSON = s => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

async function getKeys(team) {
  if (certCache.team === team && certCache.expires > Date.now()) return certCache.keys;
  const r = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error('Access certs HTTP ' + r.status);
  const { keys } = await r.json();
  certCache = { team, keys, expires: Date.now() + 60 * 60 * 1000 };
  return keys;
}

async function verifyAccessJWT(token, team, aud) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const [h, p, s] = parts;
  const header = b64urlJSON(h);
  const payload = b64urlJSON(p);
  if (header.alg !== 'RS256') throw new Error('unexpected alg');

  const keys = await getKeys(team);
  const jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) throw new Error('unknown signing key');
  const key = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', key, b64urlToBytes(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw new Error('bad signature');

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < now) throw new Error('expired');
  if (typeof payload.nbf === 'number' && payload.nbf > now + 60) throw new Error('not yet valid');
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(aud)) throw new Error('wrong audience');
  if (payload.iss !== `https://${team}`) throw new Error('wrong issuer');
  return payload;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Writes must be same-origin JSON: blocks cross-site form posts riding on the login cookie.
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return error(403, 'cross-origin request refused');
    if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) {
      return error(415, 'expected application/json');
    }
  }

  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (isLocal && env.DEV_ALLOW_NO_ACCESS === 'true') {
    context.data.user = 'local-dev';
    return context.next();
  }

  const team = (env.ACCESS_TEAM_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const aud = env.ACCESS_AUD;
  if (!team || !aud) return error(503, 'admin API not configured (ACCESS_TEAM_DOMAIN / ACCESS_AUD)');

  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return error(401, 'not signed in — reload the page to log in through Cloudflare Access');

  try {
    const claims = await verifyAccessJWT(token, team, aud);
    context.data.user = claims.email || claims.sub || 'access-user';
  } catch (e) {
    console.warn('Access token rejected:', e.message);
    return error(401, 'sign-in expired or invalid — reload the page to log in again');
  }
  return context.next();
}
