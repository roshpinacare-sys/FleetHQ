// ============================================================================
// FLEET HQ — R2 SOVEREIGNTY BACKUP (belt + braces over the git vault)
// ----------------------------------------------------------------------------
// Doctrine: the office's durable homes are the git repos (FleetHQ public +
// fleet-vault private). This script adds an OFF-BOX object-storage copy of the
// sealed artifacts, so even if every git account is lost, the encrypted state
// survives in R2. Zero dependencies — SigV4 implemented inline.
//
//   bun vault/r2-backup.ts <local-file> <object-key>      # upload one file
//   bun vault/r2-backup.ts --mirror                       # mirror the sealed vault + books
//
// Env (from the vault, deployed to .env / .env.local):
//   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET
//
// HONEST STATUS 2026-10-08: the Cloudflare account has NOT enabled R2 yet
// (owner one-click in the dashboard). Until then every run fails with a clear
// message — the script never pretends success. The credentials are sealed and
// ready for the moment R2 goes live.
// ============================================================================

import { createHash, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const ALGO = 'AWS4-HMAC-SHA256';

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Minimal AWS SigV4 PUT for R2 (service: s3, region: auto). */
async function r2Put(env: NodeJS.ProcessEnv, objectKey: string, body: Buffer): Promise<void> {
  const access = env.R2_ACCESS_KEY_ID;
  const secret = env.R2_SECRET_ACCESS_KEY;
  const endpoint = env.R2_ENDPOINT;
  const bucket = env.R2_BUCKET;
  if (!access || !secret || !endpoint || !bucket) {
    throw new Error('R2 env missing — run: bash vault/vault.sh open (need R2_ACCESS_KEY_ID/SECRET/ENDPOINT/BUCKET)');
  }
  const url = new URL(`${endpoint.replace(/\/$/, '')}/${bucket}/${objectKey}`);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body);
  const host = url.host;
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [
    'PUT', url.pathname, '', canonicalHeaders, signedHeaders, payloadHash,
  ].join('\n');
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = [ALGO, amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secret}`, dateStamp), 'auto'), 's3'), 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  const authorization = `${ALGO} Credential=${access}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'authorization': authorization,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    },
    body: new Uint8Array(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`R2 PUT ${res.status}: ${text.slice(0, 300)}`);
  }
  console.log(`r2-backup: uploaded ${objectKey} (${body.length} bytes) → ${bucket}`);
}

async function main(): Promise<void> {
  const [, , arg1, arg2] = process.argv;
  const root = new URL('..', import.meta.url).pathname;

  if (arg1 === '--mirror') {
    // mirror the artifacts that make the office restorable anywhere
    const sealed = await readFile(`${root}vault/keys.env.enc`).catch(() => null);
    if (!sealed) throw new Error('vault/keys.env.enc missing — nothing to mirror');
    await r2Put(process.env, `fleet-vault/keys.env.enc.${new Date().toISOString().slice(0, 10)}`, sealed);
    await r2Put(process.env, 'fleet-vault/keys.env.enc.latest', sealed);
    return;
  }

  if (!arg1 || !arg2) {
    console.log('usage: bun vault/r2-backup.ts <local-file> <object-key> | --mirror');
    process.exit(2);
  }
  const body = await readFile(arg1);
  await r2Put(process.env, arg2, body);
}

main().catch((e: Error) => {
  console.error(`r2-backup FAILED (honest, no pretend): ${e.message}`);
  process.exit(1);
});
