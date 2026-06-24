import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';
import { ApiError } from './ApiError.js';

const FIREBASE_CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let certCache = {
  expiresAt: 0,
  certs: null
};

function parseMaxAge(cacheControl = '') {
  const match = cacheControl.match(/max-age=(\d+)/i);
  return match ? Number(match[1]) : 3600;
}

async function getFirebaseCerts() {
  const now = Date.now();

  if (certCache.certs && certCache.expiresAt > now) {
    return certCache.certs;
  }

  const response = await fetch(FIREBASE_CERTS_URL);

  if (!response.ok) {
    throw new ApiError(503, 'Unable to verify Firebase token');
  }

  const certs = await response.json();
  const maxAge = parseMaxAge(response.headers.get('cache-control') || '');

  certCache = {
    certs,
    expiresAt: now + maxAge * 1000
  };

  return certs;
}

export async function verifyFirebaseIdToken(idToken) {
  if (!env.firebaseProjectId) {
    throw new ApiError(500, 'Firebase is not configured on the server');
  }

  const decodedHeader = jwt.decode(idToken, { complete: true });

  if (!decodedHeader?.header?.kid) {
    throw new ApiError(401, 'Invalid Firebase token');
  }

  const certs = await getFirebaseCerts();
  const cert = certs[decodedHeader.header.kid];

  if (!cert) {
    throw new ApiError(401, 'Invalid Firebase token');
  }

  try {
    const payload = jwt.verify(idToken, cert, {
      algorithms: ['RS256'],
      audience: env.firebaseProjectId,
      issuer: `https://securetoken.google.com/${env.firebaseProjectId}`
    });

    if (!payload?.sub) {
      throw new Error('Missing subject');
    }

    return payload;
  } catch {
    throw new ApiError(401, 'Invalid Firebase token');
  }
}
