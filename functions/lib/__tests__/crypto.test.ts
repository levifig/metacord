import { describe, it, expect } from 'vitest';
import {
  encryptToken,
  decryptToken,
  createPkceVerifier,
  createPkceChallenge,
} from '../crypto';

const TEST_SECRET = 'test-secret-key-for-unit-tests';

describe('encryptToken / decryptToken', () => {
  it('round-trips: encrypt then decrypt returns original value', async () => {
    const original = 'my-secret-token-12345';
    const encrypted = await encryptToken(original, TEST_SECRET);
    const decrypted = await decryptToken(encrypted, TEST_SECRET);
    expect(decrypted).toBe(original);
  });

  it('round-trips with empty string', async () => {
    const encrypted = await encryptToken('', TEST_SECRET);
    const decrypted = await decryptToken(encrypted, TEST_SECRET);
    expect(decrypted).toBe('');
  });

  it('round-trips with unicode content', async () => {
    const original = 'token-with-émojis-🎉-and-ünïcödë';
    const encrypted = await encryptToken(original, TEST_SECRET);
    const decrypted = await decryptToken(encrypted, TEST_SECRET);
    expect(decrypted).toBe(original);
  });

  it('produces different ciphertexts for same input (random IV)', async () => {
    const value = 'same-value';
    const a = await encryptToken(value, TEST_SECRET);
    const b = await encryptToken(value, TEST_SECRET);
    expect(a).not.toBe(b);
  });

  it('produces different ciphertexts for different inputs', async () => {
    const a = await encryptToken('value-a', TEST_SECRET);
    const b = await encryptToken('value-b', TEST_SECRET);
    expect(a).not.toBe(b);
  });

  it('encrypted value has iv.data format', async () => {
    const encrypted = await encryptToken('test', TEST_SECRET);
    const parts = encrypted.split('.');
    expect(parts).toHaveLength(2);
    expect(parts[0].length).toBeGreaterThan(0);
    expect(parts[1].length).toBeGreaterThan(0);
  });

  it('decrypt fails with wrong secret', async () => {
    const encrypted = await encryptToken('my-token', TEST_SECRET);
    await expect(decryptToken(encrypted, 'wrong-secret-key')).rejects.toThrow();
  });

  it('decrypt fails with malformed payload (no dot)', async () => {
    await expect(decryptToken('nodothere', TEST_SECRET)).rejects.toThrow(
      'Invalid encrypted token payload',
    );
  });

  it('decrypt fails with tampered data', async () => {
    const encrypted = await encryptToken('my-token', TEST_SECRET);
    const [iv, data] = encrypted.split('.');
    const tampered = `${iv}.${data}AAAA`;
    await expect(decryptToken(tampered, TEST_SECRET)).rejects.toThrow();
  });
});

describe('createPkceVerifier', () => {
  it('returns a string', () => {
    const verifier = createPkceVerifier();
    expect(typeof verifier).toBe('string');
  });

  it('returns a base64url-encoded string (no +, /, or = characters)', () => {
    const verifier = createPkceVerifier();
    expect(verifier).not.toMatch(/[+/=]/);
  });

  it('returns a string of reasonable length (64 bytes → ~86 base64url chars)', () => {
    const verifier = createPkceVerifier();
    // 64 bytes base64url encoded = ceil(64 * 4/3) ≈ 86 chars (no padding)
    expect(verifier.length).toBeGreaterThanOrEqual(80);
    expect(verifier.length).toBeLessThanOrEqual(90);
  });

  it('generates unique verifiers', () => {
    const a = createPkceVerifier();
    const b = createPkceVerifier();
    expect(a).not.toBe(b);
  });
});

describe('createPkceChallenge', () => {
  it('returns a string', async () => {
    const verifier = createPkceVerifier();
    const challenge = await createPkceChallenge(verifier);
    expect(typeof challenge).toBe('string');
  });

  it('returns a base64url-encoded string', async () => {
    const verifier = createPkceVerifier();
    const challenge = await createPkceChallenge(verifier);
    expect(challenge).not.toMatch(/[+/=]/);
  });

  it('is deterministic: same verifier produces same challenge', async () => {
    const verifier = 'fixed-test-verifier-string';
    const a = await createPkceChallenge(verifier);
    const b = await createPkceChallenge(verifier);
    expect(a).toBe(b);
  });

  it('different verifiers produce different challenges', async () => {
    const a = await createPkceChallenge('verifier-a');
    const b = await createPkceChallenge('verifier-b');
    expect(a).not.toBe(b);
  });

  it('returns SHA-256 digest length (32 bytes → 43 base64url chars)', async () => {
    const verifier = createPkceVerifier();
    const challenge = await createPkceChallenge(verifier);
    // SHA-256 = 32 bytes → base64url = ceil(32 * 4/3) = 43 chars (no padding)
    expect(challenge.length).toBe(43);
  });
});
