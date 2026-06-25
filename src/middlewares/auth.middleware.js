import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import UserSession from "../models/UserSession.js";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import { parseUserAgent, detectDeviceType, deriveLocation } from "../utils/deviceUtils.js";

export const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new ApiError(401, "Unauthorized");
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, env.jwtSecret);

    const user = await User.findById(decoded.userId).select("-password");

    if (!user) {
      throw new ApiError(401, "User not found");
    }

    let session = null;

    if (decoded.sessionId) {
      session = await UserSession.findOne({
        _id: decoded.sessionId,
        userId: decoded.userId,
        isRevoked: false,
        expiresAt: { $gt: new Date() }
      });

      if (!session) {
        throw new ApiError(401, "Session has been revoked or expired");
      }
    } else {
      // Legacy token: find or create session
      const ua = req.headers['user-agent'] || '';
      const ip = req.ip || '';
      const deviceId = req.headers['x-device-id'] || '';
      const { os, browser } = parseUserAgent(ua);
      const deviceType = detectDeviceType(ua);
      const location = deriveLocation(ip);

      // Generate fingerprint from userId, OS, browser, device type, and stable deviceId
      const fingerprintRaw = `${decoded.userId}_${os || ''}_${browser || ''}_${deviceType || ''}_${deviceId}`;
      const fingerprint = crypto.createHash('sha256').update(fingerprintRaw).digest('hex');

      session = await UserSession.findOne({
        userId: decoded.userId,
        fingerprint,
        isRevoked: false,
        expiresAt: { $gt: new Date() }
      });

      if (!session) {
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days fallback

        session = await UserSession.create({
          userId: decoded.userId,
          device: os,
          browser,
          os,
          deviceType,
          ipAddress: ip,
          location: location || undefined,
          userAgent: ua,
          isCurrent: true,
          isActive: true,
          isRevoked: false,
          lastActivity: new Date(),
          lastActivityAt: new Date(),
          expiresAt,
          fingerprint,
          deviceId,
        });

        session.tokenId = session._id.toString();
        await session.save();
      }
    }

    // Update last activity
    session.lastActivity = new Date();
    session.lastActivityAt = new Date();
    await session.save();

    req.sessionId = session._id;
    req.user = user;

    next();
  } catch (error) {
    next(error);
  }
};
