import './lib/db/migrate';
import './lib/config/index';

process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection:', reason);
});

import cors from 'cors';
import express from 'express';
import { apiRouter } from './routes/index';

const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api', apiRouter);

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  },
);

app.listen(PORT, () => {
  console.log(`vane-api listening on http://localhost:${PORT}`);
});
