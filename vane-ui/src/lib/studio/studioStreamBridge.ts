export type PendingStudioStream = {
  chatId: string;
  messageId: string;
  displayQuery: string;
  reader: ReadableStreamDefaultReader<Uint8Array>;
};

let pending: PendingStudioStream | null = null;

export function setPendingStudioStream(stream: PendingStudioStream): void {
  pending = stream;
}

export function consumePendingStudioStream(
  chatId: string,
): PendingStudioStream | null {
  if (pending?.chatId === chatId) {
    const value = pending;
    pending = null;
    return value;
  }
  return null;
}
