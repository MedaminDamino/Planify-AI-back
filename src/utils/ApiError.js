export class ApiError extends Error {
  constructor(statusCode, message, options = {}) {
    super(message);

    this.statusCode = statusCode;
    if (options?.cause) {
      this.cause = options.cause;
    }
    if (options?.details !== undefined) {
      this.details = options.details;
    }
  }
}
