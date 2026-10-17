/**
 * Deletes every topic with its tasks and requests, and all "solved" marks.
 *
 *   npm run reset:topics              # list what would be deleted
 *   npm run reset:topics -- --yes     # delete
 */
import { adminFirestore } from '../firestore.js';

const db = adminFirestore();
const confirmed = process.argv.includes('--yes');

const topics = await db.collection('topics').get();
const progress = await db.collectionGroup('progress').get();
let tasks = 0;
for (const t of topics.docs) tasks += (await t.ref.collection('tasks').count().get()).data().count;
console.log(`topics: ${topics.size} (tasks inside: ${tasks}), progress marks: ${progress.size}`);
for (const t of topics.docs) console.log(`  ${t.id}  ${t.get('title') ?? ''}`);

if (!confirmed) {
  console.log('dry run — pass --yes to delete');
} else {
  for (const t of topics.docs) await db.recursiveDelete(t.ref);
  const writer = db.bulkWriter();
  for (const p of progress.docs) writer.delete(p.ref);
  await writer.close();
  console.log('deleted');
}
