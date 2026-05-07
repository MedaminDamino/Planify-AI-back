import xss from 'xss';

/**
 * Recursively sanitizes all string values in an object against XSS.
 * Arrays and nested objects are handled.
 */
const sanitizeValue = (value) => {
  if (typeof value === 'string') return xss(value);
  if (Array.isArray(value))     return value.map(sanitizeValue);
  if (value && typeof value === 'object') return sanitizeObject(value);
  return value;
};

const sanitizeObject = (obj) => {
  const sanitized = {};
  for (const key of Object.keys(obj)) {
    sanitized[key] = sanitizeValue(obj[key]);
  }
  return sanitized;
};

/**
 * Express middleware that sanitizes req.body, req.params, and req.query
 * against XSS attacks. Safe for JSON bodies and multipart (file uploads)
 * since multer populates req.body after this runs at route level.
 */
export const xssSanitize = (req, res, next) => {
  if (req.body   && typeof req.body   === 'object') req.body   = sanitizeObject(req.body);
  if (req.params && typeof req.params === 'object') req.params = sanitizeObject(req.params);
  if (req.query  && typeof req.query  === 'object') req.query  = sanitizeObject(req.query);
  next();
};
