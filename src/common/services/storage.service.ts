import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

export const ALLOWED_UPLOAD_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export const MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export interface StoredFile {
  storageKey: string;
  checksumSha256: string;
  fileSizeBytes: number;
}

/** RFC 5987 encoding so a client-supplied file name can never break the header or inject content. */
export function buildContentDisposition(fileName: string): string {
  const sanitizedAscii = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, "'");
  return `attachment; filename="${sanitizedAscii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/**
 * Files are never served as static assets. Every read goes through an
 * authenticated, permission-checked controller route (see portal module),
 * and storageKey is always a server-generated UUID - the client-supplied
 * file name is kept only as display metadata, never used to build a path
 * (prevents path traversal).
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private root!: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.root = this.config.get<string>('STORAGE_ROOT') ?? path.join(process.cwd(), 'storage');
    fs.mkdirSync(this.root, { recursive: true, mode: 0o700 });
  }

  async save(buffer: Buffer, subdirectory: 'invoices' | 'usg'): Promise<StoredFile> {
    const checksumSha256 = createHash('sha256').update(buffer).digest('hex');
    const storageKey = `${subdirectory}/${uuidv4()}`;
    const fullPath = this.resolveSafePath(storageKey);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true, mode: 0o700 });
    fs.writeFileSync(fullPath, buffer, { mode: 0o600 });
    // TODO: integrate antivirus scanning (e.g. ClamAV) here before the file
    // is considered available for download.
    return { storageKey, checksumSha256, fileSizeBytes: buffer.length };
  }

  async read(storageKey: string): Promise<Buffer> {
    const fullPath = this.resolveSafePath(storageKey);
    return fs.promises.readFile(fullPath);
  }

  private resolveSafePath(storageKey: string): string {
    const fullPath = path.resolve(this.root, storageKey);
    if (!fullPath.startsWith(path.resolve(this.root) + path.sep)) {
      throw new Error('Invalid storage key');
    }
    return fullPath;
  }
}
