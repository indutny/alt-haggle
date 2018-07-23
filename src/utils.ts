import * as crypto from 'crypto';

export function getPlayerHash(name: string): string {
  const match = name.match(/^(.*?)(?:#(.*))?$/);
  if (match === null) {
    throw new Error('Unexpected');
  }

  const priv = match[1];
  const tag = match[2];

  let res = crypto.createHash('sha256').update(priv).digest('hex');
  if (tag) {
    res += `-${tag}`;
  }
  return res;
}
