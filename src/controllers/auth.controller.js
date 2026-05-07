import bcrypt from "bcryptjs";

import User from "../models/User.js";

import { asyncHandler } from "../utils/asyncHandler.js";

import { ApiError } from "../utils/ApiError.js";

import { generateToken } from "../utils/generateToken.js";

export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  const existingUser = await User.findOne({ email });

  if (existingUser) {
    throw new ApiError(400, "User already exists");
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await User.create({
    name,
    email,
    password: hashedPassword,
    tokenBalance: 10000,
    trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  const token = generateToken(user._id);

  res.status(201).json({
    success: true,
    token,
    user,
  });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });

  if (!user) {
    throw new ApiError(401, "Invalid credentials");
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid credentials");
  }

  const token = generateToken(user._id);

  res.json({
    success: true,
    token,
    user,
  });
});

export const me = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    user: req.user,
  });
});

export const logout = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    message: "Logout successful",
  });
});
