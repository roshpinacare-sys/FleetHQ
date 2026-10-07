// Smoke test client for the foreman (dev tool).
import { io } from 'socket.io-client';

const PORT = process.argv[2] || '3011';
const socket = io(`http://localhost:${PORT}`, { path: '/', transports: ['websocket', 'polling'], timeout: 5000 });

const seen = { agent: 0, task: 0, log: 0, feed: 0, decision: 0, report: 0, goal: 0, bubble: 0 };
const bump = (k: keyof typeof seen) => {
  seen[k]++;
};

socket.on('connect', () => {
  console.log('connected', socket.id);
  socket.on('snapshot', (s: { status: { backend: string; message: { he: string } }; agents: unknown[]; books: unknown[] }) => {
    console.log('SNAPSHOT backend=', s.status.backend, '|', s.status.message.he, '| agents:', s.agents.length, '| books:', s.books.length);
    socket.emit('goal:submit', { text: 'בדיקת עשן: סרוק את ספרי הצי ודווח ממצאים' }, (r: { ok: boolean }) => {
      console.log('goal submit →', r);
    });
  });
  socket.on('agent', (a: { id: string; state: string; activity: string }) => bump('agent'));
  socket.on('task', (t: { id: string; title: string; status: string }) => {
    bump('task');
    if (seen.task <= 6) console.log('TASK', t.id, t.status, t.title);
  });
  socket.on('log', (l: { agentId: string; entry: { kind: string; text: string } }) => {
    bump('log');
    if (seen.log <= 10) console.log(`LOG[${l.agentId}] (${l.entry.kind})`, l.entry.text.slice(0, 90).replace(/\n/g, ' '));
  });
  socket.on('feed', (f: { kind: string; text: string }) => {
    bump('feed');
    if (seen.feed <= 6) console.log('FEED', f.kind, f.text.slice(0, 70));
  });
  socket.on('decision', (d: { id: string; question: string; status: string }) => {
    bump('decision');
    console.log('DECISION', d.id, d.status, d.question.slice(0, 60));
    socket.emit('decision:answer', { id: d.id, option: 'כן' });
  });
  socket.on('report', (r: { title: string }) => {
    bump('report');
    console.log('REPORT', r.title);
  });
  socket.on('goal', (g: { status: string; progress: number }) => {
    bump('goal');
    console.log('GOAL', g.status, (g.progress * 100).toFixed(0) + '%');
  });
  socket.on('bubble', (b: { agentId: string; text: string }) => {
    bump('bubble');
    if (seen.bubble <= 6) console.log('BUBBLE', b.agentId, b.text.slice(0, 60));
  });
  setTimeout(() => {
    console.log('COUNTS', seen);
    process.exit(0);
  }, Number(process.argv[3] || 60000));
});
socket.on('connect_error', (e: Error) => console.error('connect_error', e.message));
