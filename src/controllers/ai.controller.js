import User from '../models/User.js';
import AIRequest from '../models/AIRequest.js';
import TokenTransaction from '../models/TokenTransaction.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';

// ─── Token cost per action ─────────────────────────────────────────────────────
const TOKEN_COSTS = {
  daily_plan: 500,
  summary: 800,
  exercises: 1000,
  chat: 300,
};

// ─── Helper: deduct tokens and create transaction ─────────────────────────────
const deductTokens = async (userId, cost, type, aiRequestId) => {
  const user = await User.findById(userId);
  if (user.tokenBalance < cost) {
    throw new ApiError(402, 'Insufficient token balance');
  }

  const balanceBefore = user.tokenBalance;
  user.tokenBalance -= cost;
  await user.save({ validateBeforeSave: false });

  await TokenTransaction.create({
    userId,
    type: 'usage',
    amount: -cost,
    reason: `AI ${type} request`,
    balanceBefore,
    balanceAfter: user.tokenBalance,
    aiRequestId,
  });

  return user.tokenBalance;
};

// ─── POST /api/ai/daily-plan ──────────────────────────────────────────────────
export const generateDailyPlan = asyncHandler(async (req, res) => {
  const cost = TOKEN_COSTS.daily_plan;
  const { courseIds, focusHours, date } = req.body;

  const user = await User.findById(req.user._id);
  if (user.tokenBalance < cost) throw new ApiError(402, 'Insufficient token balance');

  const mockResponse = {
    date: date || new Date().toISOString().split('T')[0],
    totalStudyHours: focusHours || 6,
    plan: [
      { time: '08:00 - 10:00', subject: 'Mathematics', activity: 'Solve past exam problems', priority: 'high' },
      { time: '10:15 - 11:45', subject: 'Physics', activity: 'Review chapter 5 formulas', priority: 'medium' },
      { time: '13:00 - 14:30', subject: 'Algorithms', activity: 'Implement sorting algorithms', priority: 'high' },
      { time: '15:00 - 16:00', subject: 'English', activity: 'Write a technical essay', priority: 'low' },
      { time: '16:30 - 18:00', subject: 'Database', activity: 'Practice SQL queries', priority: 'medium' },
    ],
    tip: 'Take a 10-minute break every 90 minutes to maintain focus.',
  };

  const aiReq = await AIRequest.create({
    userId: req.user._id,
    type: 'daily_plan',
    prompt: JSON.stringify(req.body),
    response: JSON.stringify(mockResponse),
    status: 'completed',
    tokensUsed: cost,
    model: 'mock-v1',
  });

  await deductTokens(req.user._id, cost, 'daily_plan', aiReq._id);

  res.json({ success: true, data: { plan: mockResponse, tokensUsed: cost } });
});

// ─── POST /api/ai/summarize ───────────────────────────────────────────────────
export const summarize = asyncHandler(async (req, res) => {
  const cost = TOKEN_COSTS.summary;
  const { fileId, courseId, text } = req.body;

  const user = await User.findById(req.user._id);
  if (user.tokenBalance < cost) throw new ApiError(402, 'Insufficient token balance');

  const mockResponse = {
    summary:
      'This document covers the fundamental concepts of distributed systems, including consistency models, CAP theorem, and fault-tolerance strategies. Key topics include leader election algorithms, vector clocks, and eventual consistency patterns used in modern cloud platforms.',
    keyPoints: [
      'CAP Theorem: Consistency, Availability, Partition Tolerance — only two can be guaranteed simultaneously.',
      'Vector clocks track causality between events in distributed nodes.',
      'Leader election ensures a single coordinator in a cluster.',
      'Eventual consistency is a tradeoff used by systems like DynamoDB and Cassandra.',
    ],
    wordCount: 3200,
    readingTime: '12 minutes',
  };

  const aiReq = await AIRequest.create({
    userId: req.user._id,
    courseId: courseId || undefined,
    fileId: fileId || undefined,
    type: 'summary',
    prompt: text || 'Summarize the uploaded document',
    response: JSON.stringify(mockResponse),
    status: 'completed',
    tokensUsed: cost,
    model: 'mock-v1',
  });

  await deductTokens(req.user._id, cost, 'summary', aiReq._id);

  res.json({ success: true, data: { summary: mockResponse, tokensUsed: cost } });
});

// ─── POST /api/ai/generate-exercises ─────────────────────────────────────────
export const generateExercises = asyncHandler(async (req, res) => {
  const cost = TOKEN_COSTS.exercises;
  const { courseId, topic, difficulty, count } = req.body;

  const user = await User.findById(req.user._id);
  if (user.tokenBalance < cost) throw new ApiError(402, 'Insufficient token balance');

  const mockResponse = {
    topic: topic || 'General',
    difficulty: difficulty || 'medium',
    exercises: [
      {
        id: 1,
        question: 'Explain the difference between process and thread in an operating system.',
        type: 'open',
        hint: 'Think about memory sharing and isolation.',
      },
      {
        id: 2,
        question: 'What is the time complexity of binary search?',
        type: 'mcq',
        options: ['O(n)', 'O(log n)', 'O(n²)', 'O(1)'],
        answer: 'O(log n)',
      },
      {
        id: 3,
        question: 'Write a function to reverse a linked list.',
        type: 'coding',
        language: 'python',
        hint: 'Use three pointers: prev, current, next.',
      },
    ],
  };

  const aiReq = await AIRequest.create({
    userId: req.user._id,
    courseId: courseId || undefined,
    type: 'exercises',
    prompt: `Generate ${count || 3} exercises on ${topic || 'general topics'} at ${difficulty || 'medium'} difficulty`,
    response: JSON.stringify(mockResponse),
    status: 'completed',
    tokensUsed: cost,
    model: 'mock-v1',
  });

  await deductTokens(req.user._id, cost, 'exercises', aiReq._id);

  res.json({ success: true, data: { exercises: mockResponse, tokensUsed: cost } });
});

// ─── POST /api/ai/chat ────────────────────────────────────────────────────────
export const chat = asyncHandler(async (req, res) => {
  const cost = TOKEN_COSTS.chat;
  const { message, courseId } = req.body;

  if (!message) throw new ApiError(400, 'Message is required');

  const user = await User.findById(req.user._id);
  if (user.tokenBalance < cost) throw new ApiError(402, 'Insufficient token balance');

  const mockResponses = [
    `Great question! Based on your studies, I suggest breaking this topic into smaller chunks and reviewing it daily using spaced repetition.`,
    `That's a complex concept. Think of it this way: start with the fundamentals and build up incrementally. Practice with examples first.`,
    `I recommend focusing on understanding the "why" before the "how". This will make it easier to apply the concept in different contexts.`,
    `Based on your current schedule, you have 2 hours available tomorrow morning. That would be a great time to tackle this topic when your mind is fresh.`,
  ];

  const mockReply = mockResponses[Math.floor(Math.random() * mockResponses.length)];

  const aiReq = await AIRequest.create({
    userId: req.user._id,
    courseId: courseId || undefined,
    type: 'chat',
    prompt: message,
    response: mockReply,
    status: 'completed',
    tokensUsed: cost,
    model: 'mock-v1',
  });

  await deductTokens(req.user._id, cost, 'chat', aiReq._id);

  res.json({ success: true, data: { reply: mockReply, tokensUsed: cost } });
});
