const sanitizeKey = (key) => key.replace(/\$/g, '_').replace(/\./g, '_');

const sanitizeValue = (value) => {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }

  if (value && typeof value === 'object') {
    return sanitizeObject(value);
  }

  return value;
};

const sanitizeObject = (obj) => {
  const sanitized = {};

  for (const [key, value] of Object.entries(obj)) {
    sanitized[sanitizeKey(key)] = sanitizeValue(value);
  }

  return sanitized;
};

const replaceRequestBag = (target, source) => {
  for (const key of Object.keys(target)) {
    delete target[key];
  }

  Object.assign(target, source);
};

export const mongoSanitizeMiddleware = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }

  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeObject(req.params);
  }

  if (req.query && typeof req.query === 'object') {
    replaceRequestBag(req.query, sanitizeObject(req.query));
  }

  next();
};
