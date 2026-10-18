// Runs the routes in-process against the real Firestore (read-only calls).
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { app, migrate } from '../src/app.js';

let base = '';
let server: ReturnType<typeof app.listen>;
before(async () => {
  await migrate();
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

test('website routes need a Firebase ID token', async () => {
  const r = await fetch(`${base}/api/match`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"grade":5,"request":"x"}' });
  assert.equal(r.status, 401);
});

test('admin lists books with sections and rules', async () => {
  const { books } = await (await fetch(`${base}/api/admin/books`)).json();
  assert.ok(books.length >= 5);
  const math5 = books.find((b: { id: string }) => b.id === 'math5-1');
  assert.equal(math5.hasPdf, true);
  const { sections } = await (await fetch(`${base}/api/admin/books/math5-1/sections`)).json();
  const p9 = sections.find((s: { id: string }) => s.id === 'math5-1-c1-p09');
  assert.ok(p9.rules.some((r: { title: string }) => r.title === 'Распределительный закон умножения'));
  assert.equal(p9.canResplit, true);
});

test('bad requests get a message', async () => {
  const r = await fetch(`${base}/api/admin/books`, { method: 'POST' });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /PDF или id/);
  const notPdf = await fetch(`${base}/api/admin/books`, { method: 'POST', headers: { 'content-type': 'application/pdf' }, body: 'hello' });
  assert.match((await notPdf.json()).error, /не PDF/);
  const dup = await fetch(`${base}/api/admin/books?portalId=1149`, { method: 'POST' });
  assert.equal(dup.status, 409); // math5-1 is already in the library
  assert.equal((await fetch(`${base}/api/admin/books/nope/sections`)).status, 404);
});
