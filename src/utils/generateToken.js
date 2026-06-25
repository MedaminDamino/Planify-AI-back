import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export const generateToken = (userId, sessionId = null) => {
  const payload = { userId };
  if (sessionId) {
    payload.sessionId = sessionId;
  }
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
};
