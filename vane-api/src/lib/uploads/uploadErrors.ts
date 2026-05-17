export class UploadRejectedError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'UploadRejectedError';
  }
}
