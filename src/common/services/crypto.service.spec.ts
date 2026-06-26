import { ConfigService } from '@nestjs/config';
import { CryptoService } from './crypto.service';

function createService(base64Key: string | undefined): CryptoService {
  const config = { get: jest.fn().mockReturnValue(base64Key) } as unknown as ConfigService;
  return new CryptoService(config);
}

describe('CryptoService', () => {
  const validKey = Buffer.alloc(32, 7).toString('base64');

  it('throws on init when FIELD_ENCRYPTION_KEY is not configured', () => {
    const service = createService(undefined);
    expect(() => service.onModuleInit()).toThrow('FIELD_ENCRYPTION_KEY is not configured');
  });

  it('throws on init when the configured key does not decode to 32 bytes', () => {
    const service = createService(Buffer.alloc(16).toString('base64'));
    expect(() => service.onModuleInit()).toThrow('32 bytes');
  });

  it('round-trips plaintext through encrypt/decrypt', () => {
    const service = createService(validKey);
    service.onModuleInit();

    const plainText = 'PESEL-style patient reference: 02070112345';
    const cipherText = service.encrypt(plainText);

    expect(cipherText).not.toContain(plainText);
    expect(service.decrypt(cipherText)).toBe(plainText);
  });

  it('produces a different ciphertext each time due to a random IV', () => {
    const service = createService(validKey);
    service.onModuleInit();

    const first = service.encrypt('repeat-me');
    const second = service.encrypt('repeat-me');

    expect(first).not.toBe(second);
  });

  it('fails to decrypt when the ciphertext has been tampered with', () => {
    const service = createService(validKey);
    service.onModuleInit();

    const cipherText = service.encrypt('sensitive value');
    const tampered = Buffer.from(cipherText, 'base64');
    tampered[tampered.length - 1] ^= 0xff;

    expect(() => service.decrypt(tampered.toString('base64'))).toThrow();
  });
});
