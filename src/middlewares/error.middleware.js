export const errorMiddleware = (err, req, res, next) => {
  const isProd = process.env.NODE_ENV === 'production';

  // Always log the full error server-side
  console.error(err);

  const statusCode = err.statusCode || 500;

  const response = {
    success: false,
    message: err.message || 'Server Error',
  };

  // Expose stack trace only in development
  if (!isProd && err.stack) {
    response.stack = err.stack;
  }

  if (!isProd && err.details !== undefined) {
    response.details = err.details;
  }

  if (!isProd && err.validationIssues !== undefined) {
    response.validationIssues = err.validationIssues;
  }

  res.status(statusCode).json(response);
};
