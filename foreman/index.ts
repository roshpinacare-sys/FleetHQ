import { Server } from 'socket.io';
import { createServer } from 'http';
import { Office } from './src/office';
import { excerptBook } from './src/books';

// Fleet HQ foreman — the real crew service.
//   AGENT_HQ_PORT       (default 3010)
//   AGENT_HQ_DATA_DIR   (default ./data — point it at your own books repo clone; the bundled demo uses ./demo-data)
//   AGENT_HQ_MODE       'sim' forces the clearly-labeled demo crew
// The socket owns the whole surface (path '/' is reserved by the gateway), so every RPC is an event.
const PORT = Number(process.env.AGENT_HQ_PORT || 3010);
if (process.env.AGENT_HQ_MODE === 'sim') {
  process.env.AGENT_HQ_DATA_DIR = process.env.AGENT_HQ_DATA_DIR || new URL('./demo-data', import.meta.url).pathname;
}

const httpServer = createServer((_req, res) => {
  res.writeHead(426, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'websocket upgrade required' }));
});

const io = new Server(httpServer, {
  // DO NOT change the path — the gateway forwards by it
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

const office = new Office((event, payload) => io.emit(event, payload));
void office.boot();

io.on('connection', (socket) => {
  socket.emit('snapshot', office.snapshot());

  socket.on('snapshot:request', () => socket.emit('snapshot', office.snapshot()));

  // SECURITY / AUTONOMY LAW — the socket is READ-ONLY for the public.
  // There is deliberately NO 'goal:submit' and NO 'decision:answer' handler:
  // goals are scheduled by the autonomous operator (patrol shifts) and every
  // agent question is resolved by the operator's own policy. A stranger with
  // a socket client gets a window, not a steering wheel.

  socket.on('book:preview', ({ id }: { id?: string }, ack?: (r: unknown) => void) => {
    if (!id || !ack) return;
    const ex = excerptBook(String(id), 2400);
    ack(ex ? { ok: true, id, excerpt: ex } : { ok: false, error: 'book not found' });
  });

  socket.on('books:refresh', () => office.refreshBooks());
});

httpServer.listen(PORT, () => {
  console.log(`[fleet-hq] foreman listening on :${PORT} (data: ${process.env.AGENT_HQ_DATA_DIR ?? './data'})`);
});
