import { Buffer } from 'buffer';
import * as zlib from 'zlib';

export class CachedStat {
  private privDeflate: Buffer | undefined;

  constructor(public readonly raw: Buffer) {
  }

  public get deflate(): Buffer {
    if (this.privDeflate === undefined) {
      this.privDeflate = zlib.deflateSync(this.raw);
    }
    return this.privDeflate;
  }
}
