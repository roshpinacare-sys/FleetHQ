#!/usr/bin/env bun
/**
 * GIT_SSH shim — sovereign deploy-key git transport for machines with no ssh binary.
 *
 * Git invokes:  <shim> [-p PORT] [-l USER] HOST "COMMAND"
 * (also accepts the ssh(1)-style variants git may pass: -o Option, -4/-6, user@host)
 *
 * Auth: SSH deploy key chosen by repo name via SOVEREIGN_SSH_DIR (default: ../ = vault/ssh).
 * Zero output on stdout except the remote command stream (git protocol) — everything
 * else goes to stderr. Never prints the key material.
 *
 * Usage from git:
 *   GIT_SSH_COMMAND="bun /path/to/vault/ssh/tool/git-ssh-shim.mjs" \
 *   git clone git@github.com:roshpinacare-sys/fleet-vault.git
 *
 * Key mapping (SOVEREIGN_SSH_DIR/deploy_<repo>) is resolved from the repo name in the
 * remote command ("git-upload-pack 'roshpinacare-sys/<repo>.git'").
 */
import { Client } from 'ssh2';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
let port = '22';
let host = '';
let user = 'git';
let command = '';
const opts = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '-p') { port = args[++i]; continue; }
  if (a === '-l') { user = args[++i]; continue; }
  if (a === '-o' || a === '-4' || a === '-6' || a === '-q' || a === '-T' || a === '-i') { if (a === '-o' || a === '-i') i++; continue; }
  if (!host && a.includes('@')) { const [u, h] = a.split('@'); user = u; host = h; continue; }
  if (!host && !a.startsWith('-')) { host = a; continue; }
  opts.push(a);
}
if (opts.length) command = opts.join(' ');
if (!command && args.length) command = args[args.length - 1];

if (!host || !command) { console.error('git-ssh-shim: cannot parse git invocation', JSON.stringify(args)); process.exit(2); }

const toolDir = dirname(fileURLToPath(import.meta.url));
const sshRoot = process.env.SOVEREIGN_SSH_DIR || join(toolDir, '..');

// repo name from the git command: git-upload-pack 'owner/repo.git'
const m = command.match(/['"]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?['"]/);
const repo = m ? m[2] : null;
const keyPath = repo && existsSync(join(sshRoot, `deploy_${repo}`)) ? join(sshRoot, `deploy_${repo}`) : null;

if (!keyPath) {
  console.error(`git-ssh-shim: no deploy key for repo "${repo || '?'}" under ${sshRoot}`);
  process.exit(3);
}

const conn = new Client();
const keyBuf = readFileSync(keyPath);

conn.on('ready', () => {
  conn.exec(command, { pty: false }, (err, stream) => {
    if (err) { console.error('git-ssh-shim: exec failed:', err.message); process.exit(4); }
    process.stdin.on('data', (d) => stream.write(d));
    process.stdin.on('end', () => stream.end());
    process.stdin.resume();
    stream.on('data', (d) => process.stdout.write(d));
    stream.stderr.on('data', (d) => process.stderr.write(d));
    stream.on('close', (code) => { conn.end(); process.exit(code ?? 0); });
  });
}).on('error', (e) => {
  console.error('git-ssh-shim: connect failed:', e.message);
  process.exit(5);
}).connect({
  host, port: parseInt(port, 10), username: user,
  privateKey: keyBuf,
  readyTimeout: 20000,
  keepaliveInterval: 10000,
});
