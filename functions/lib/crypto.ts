const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const keyCache = new Map<string, CryptoKey>();

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
  const binary = atob(`${base64}${padding}`);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getAesKey(secret: string): Promise<CryptoKey> {
  const cached = keyCache.get(secret);
  if (cached) return cached;

  const secretBytes = textEncoder.encode(secret);
  const digest = await crypto.subtle.digest('SHA-256', secretBytes);
  const key = await crypto.subtle.importKey(
    'raw',
    digest,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  keyCache.set(secret, key);
  return key;
}

export async function encryptToken(value: string, secret: string): Promise<string> {
  const key = await getAesKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = textEncoder.encode(value);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(encrypted))}`;
}

export async function decryptToken(value: string, secret: string): Promise<string> {
  const [ivPart, dataPart] = value.split('.');
  if (!ivPart || !dataPart) {
    throw new Error('Invalid encrypted token payload');
  }
  const key = await getAesKey(secret);
  const iv = fromBase64Url(ivPart);
  const data = fromBase64Url(dataPart);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return textDecoder.decode(decrypted);
}

export function createPkceVerifier(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(64));
  return toBase64Url(bytes);
}

export async function createPkceChallenge(verifier: string): Promise<string> {
  const data = textEncoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toBase64Url(new Uint8Array(digest));
}
