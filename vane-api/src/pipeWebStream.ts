import { Readable } from 'node:stream';
import type { Response } from 'express';

export function pipeWebReadableToResponse(
  webReadable: ReadableStream<Uint8Array>,
  res: Response,
  headers: Record<string, string>,
): void {
  for (const [k, v] of Object.entries(headers)) {
    res.setHeader(k, v);
  }
  const nodeReadable = Readable.fromWeb(
    webReadable as import('stream/web').ReadableStream,
  );
  nodeReadable.on('error', (err) => {
    console.error(err);
    if (!res.headersSent) res.sendStatus(500);
    else res.end();
  });
  nodeReadable.pipe(res);
}
