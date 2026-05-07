import { ApiError } from '../utils/ApiError.js';

/**
 * Zod validation middleware factory.
 *
 * Usage:
 *   import { validate } from '../middlewares/validate.middleware.js';
 *   import { registerSchema } from '../validators/auth.validator.js';
 *
 *   router.post('/register', validate(registerSchema), register);
 *
 * The schema can validate any combination of:
 *   - req.body   → schema.shape.body
 *   - req.params → schema.shape.params
 *   - req.query  → schema.shape.query
 *
 * Or pass a flat schema that validates req.body directly.
 */
export const validate = (schema) => (req, res, next) => {
  try {
    // Support scoped schemas { body, params, query } or flat body-only schemas
    if (schema.shape && (schema.shape.body || schema.shape.params || schema.shape.query)) {
      const toValidate = {};

      if (schema.shape.body)   toValidate.body   = req.body;
      if (schema.shape.params) toValidate.params = req.params;
      if (schema.shape.query)  toValidate.query  = req.query;

      const result = schema.safeParse(toValidate);

      if (!result.success) {
        const message = result.error.errors
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join('; ');
        return next(new ApiError(422, message));
      }

      // Assign validated + coerced values back to request
      if (result.data.body)   req.body   = result.data.body;
      if (result.data.params) req.params = result.data.params;
      if (result.data.query)  req.query  = result.data.query;
    } else {
      // Flat schema — validates req.body directly
      const result = schema.safeParse(req.body);

      if (!result.success) {
        const message = result.error.errors
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join('; ');
        return next(new ApiError(422, message));
      }

      req.body = result.data;
    }

    next();
  } catch (err) {
    next(err);
  }
};
