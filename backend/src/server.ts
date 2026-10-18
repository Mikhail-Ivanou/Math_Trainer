/**
 * Local server for the website and its admin page.
 *
 *   npm run server        # http://127.0.0.1:3101
 */
import { app, migrate } from './app.js';

const PORT = Number(process.env.PORT ?? 3101);
await migrate();
app.listen(PORT, '127.0.0.1', () => console.log(`math-trainer backend: http://127.0.0.1:${PORT}`));
