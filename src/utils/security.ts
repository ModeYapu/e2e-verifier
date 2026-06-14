/**
 * Shared security primitives
 *
 * Centralises a handful of cryptographic, SSRF and path-traversal helpers so
 * every call site applies the same policy instead of re-implementing it
 * (and getting it subtly wrong).
 */

import * as crypto from 'crypto';
import * as dns from 'dns';
import * as path from 'path';
import { URL } from 'url';

// =====================================================
// Constant-time comparison
// =====================================================

/**
 * Constant-time string comparison.
 *
 * Falls back to a same-buffer compare when lengths differ so the timing
 * profile does not leak the secret length. Use this for any credential,
 * token or HMAC comparison.
 */
export function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(String(a));
  const bBuf = Buffer.from(String(b));
  if (aBuf.length !== bBuf.length) {
    // Keep the comparison work constant regardless of the mismatch reason.
    crypto.timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}

/**
 * Generate a cryptographically strong opaque token.
 *
 * @param prefix Human-readable prefix (e.g. `ev_proj_`)
 * @param bytes  Entropy length in bytes (default 32 → 256 bits)
 */
export function generateToken(prefix: string = '', bytes: number = 32): string {
  return `${prefix}${crypto.randomBytes(bytes).toString('hex')}`;
}

/** Short id suitable for resource identifiers (not secrets). */
export function generateId(prefix: string = ''): string {
  return `${prefix}${crypto.randomBytes(8).toString('hex')}`;
}

// =====================================================
// SSRF protection
// =====================================================

/**
 * Hostnames that are obvious SSRF / metadata-service targets and must never
 * be reached from server-side outbound requests.
 */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal',
  'metadata',
  '169.254.169.254', // double-dash variant
]);

/**
 * Returns true if a literal IPv4/IPv6 address belongs to a private, loopback,
 * link-local or otherwise non-routable range.
 */
export function isPrivateIp(ip: string): boolean {
  // IPv4
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [parseInt(v4[1], 10), parseInt(v4[2], 10)];
    if (a === 10) return true;                       // 10.0.0.0/8
    if (a === 127) return true;                      // 127.0.0.0/8 loopback
    if (a === 0) return true;                        // 0.0.0.0/8
    if (a === 169 && b === 254) return true;         // 169.254.0.0/16 link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;// 172.16.0.0/12
    if (a === 192 && b === 168) return true;         // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true;// 100.64.0.0/10 CGNAT
    return false;
  }

  // IPv6 (normalise)
  const v6 = ip.toLowerCase();
  if (v6 === '::1' || v6 === '::' || v6 === '0:0:0:0:0:0:0:1') return true;
  if (v6.startsWith('fc') || v6.startsWith('fd')) return true; // unique local fc00::/7
  if (v6.startsWith('fe80')) return true;                       // link-local
  if (v6.startsWith('::ffff:')) {
    // IPv4-mapped — re-check the embedded v4 address
    return isPrivateIp(v6.slice('::ffff:'.length));
  }
  return false;
}

/**
 * Synchronous hostname-only check. Catches the common cases (literal IPs,
 * well-known loopback / metadata names) without a DNS round-trip.
 */
export function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (host.endsWith('.internal') || host.endsWith('.local')) return true;
  return isPrivateIp(host);
}

/**
 * Asynchronously validate that a URL is safe to fetch server-side.
 *
 * Resolves the hostname and rejects private/loopback/link-local targets so
 * an attacker cannot pivot the server onto internal services. Throws on
 * anything that is not an absolute http(s) URL pointing at a public host.
 */
export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Disallowed URL scheme: ${parsed.protocol}`);
  }

  // Block userinfo (credentials) which has no place in server-side webhooks.
  if (parsed.username || parsed.password) {
    throw new Error('Embedded credentials are not allowed in outbound URLs');
  }

  const host = parsed.hostname;
  if (isPrivateHostname(host)) {
    throw new Error(`Refusing to contact private/loopback host: ${host}`);
  }

  // Resolve and check every returned address to defeat DNS rebinding where
  // the public name points at an internal IP.
  let addrs: string[];
  try {
    const looked = await dns.promises.lookup(host, { all: true });
    addrs = looked.map(r => r.address);
  } catch {
    throw new Error(`Unable to resolve host: ${host}`);
  }

  if (addrs.length === 0) {
    throw new Error(`No addresses resolved for host: ${host}`);
  }

  for (const addr of addrs) {
    if (isPrivateIp(addr)) {
      throw new Error(`Host ${host} resolves to private address ${addr}`);
    }
  }

  return parsed;
}

// =====================================================
// Path-traversal protection
// =====================================================

/**
 * Join `input` onto `base` and verify the result stays within `base`.
 *
 * Rejects absolute paths, drive letters and any `..` segment that would
 * escape the base directory. Use for any path constructed from
 * request-supplied input.
 */
export function safeJoinPath(base: string, input: string): string {
  if (typeof input !== 'string' || input.length === 0) {
    throw new Error('Path component must be a non-empty string');
  }
  // Reject absolute paths and Windows drive prefixes outright.
  if (path.isAbsolute(input) || /^[a-zA-Z]:[\\/]/.test(input)) {
    throw new Error(`Absolute paths are not allowed: ${input}`);
  }

  const joined = path.resolve(base, input);
  const normalizedBase = path.resolve(base) + path.sep;
  if (joined !== path.resolve(base) && !joined.startsWith(normalizedBase)) {
    throw new Error(`Path escapes base directory: ${input}`);
  }
  return joined;
}
