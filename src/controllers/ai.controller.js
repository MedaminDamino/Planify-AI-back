import User from '../models/User.js';
import AIRequest from '../models/AIRequest.js';
import TokenTransaction from '../models/TokenTransaction.js';
import Course from '../models/Course.js';
import File from '../models/File.js';
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

  let selectedCourses = [];
  if (courseIds && courseIds.length > 0) {
    selectedCourses = await Course.find({ _id: { $in: courseIds }, userId: req.user._id });
  } else {
    selectedCourses = await Course.find({ userId: req.user._id, status: 'active' });
  }

  const plan = [];
  const hours = focusHours || 6;
  const startTime = 8; // starts at 8:00 AM

  if (selectedCourses.length > 0) {
    const hoursPerCourse = Math.max(1, Math.floor(hours / selectedCourses.length));
    for (let i = 0; i < selectedCourses.length; i++) {
      const course = selectedCourses[i];
      const startHr = startTime + i * hoursPerCourse;
      const endHr = startHr + hoursPerCourse;
      const timeStr = `${startHr.toString().padStart(2, '0')}:00 - ${endHr.toString().padStart(2, '0')}:00`;

      const activities = [
        `Solve past exam problems for ${course.title}`,
        `Review chapter formulas and slide notes for ${course.title}`,
        `Practice lab exercises and coding worksheets for ${course.title}`,
        `Summarize key concepts and definitions for ${course.title}`
      ];
      const activity = activities[i % activities.length];
      const priority = i === 0 ? 'high' : (i === 1 ? 'medium' : 'low');

      plan.push({
        time: timeStr,
        subject: course.title,
        activity,
        priority
      });
    }
  } else {
    // Fallback general study plan if user has no courses
    plan.push(
      { time: '08:00 - 10:00', subject: 'General Studies', activity: 'Read assigned chapters and highlight key terms', priority: 'high' },
      { time: '10:15 - 11:45', subject: 'Self Revision', activity: 'Practice active recall worksheets', priority: 'medium' }
    );
  }

  const dynamicResponse = {
    date: date || new Date().toISOString().split('T')[0],
    totalStudyHours: hours,
    plan,
    tip: 'Take a 10-minute break every 90 minutes to maintain focus.'
  };

  const aiReq = await AIRequest.create({
    userId: req.user._id,
    type: 'daily_plan',
    prompt: JSON.stringify(req.body),
    response: JSON.stringify(dynamicResponse),
    status: 'completed',
    tokensUsed: cost,
    model: 'db-dynamic-v1',
  });

  await deductTokens(req.user._id, cost, 'daily_plan', aiReq._id);

  res.json({ success: true, data: { plan: dynamicResponse, tokensUsed: cost } });
});

// ─── POST /api/ai/summarize ───────────────────────────────────────────────────
export const summarize = asyncHandler(async (req, res) => {
  const cost = TOKEN_COSTS.summary;
  const { fileId, courseId, text } = req.body;

  const user = await User.findById(req.user._id);
  if (user.tokenBalance < cost) throw new ApiError(402, 'Insufficient token balance');

  let title = 'Course Material';
  let summaryText = 'This document covers the fundamental concepts...';
  let keyPoints = [];

  if (fileId) {
    const file = await File.findOne({ _id: fileId, userId: req.user._id });
    if (file) {
      title = file.originalName;
      if (file.extractedText) {
        summaryText = `Summary of ${file.originalName}: ${file.extractedText.substring(0, 200)}...`;
      } else {
        summaryText = `This document summarizes the core topics in the uploaded file "${file.originalName}". It highlights critical definitions, schemas, and structure to prepare you for exams.`;
      }
      keyPoints = [
        `Key details from file: ${file.originalName}`,
        `Covers document type: ${file.type || 'study resource'}`,
        `Includes standard course definitions and lecture outline`,
        `Highly recommended to review for upcoming quizzes and final exams`
      ];
    }
  } else if (courseId) {
    const course = await Course.findOne({ _id: courseId, userId: req.user._id });
    if (course) {
      title = course.title;
      summaryText = `This document covers the key syllabus and study material for the course "${course.title}". It highlights the major lecture concepts, semester timelines, and core deliverables.`;
      keyPoints = [
        `Focus areas for ${course.title}: review teacher's material and lecture guides`,
        `Priority level: ${course.priority || 'medium'} priority course`,
        `Current course progress: ${course.progress || 0}% completed`,
        `Assigned tasks: total of ${course.totalTasks || 0} tasks tracked`
      ];
    }
  } else if (text) {
    title = 'Input Notes';
    summaryText = `This summary is generated from your pasted notes: "${text.substring(0, 100)}..."`;
    keyPoints = [
      `Key point 1: Direct summary of the provided text`,
      `Key point 2: Key facts and definitions condensed`,
      `Key point 3: Core takeaways extracted`
    ];
  } else {
    title = 'General Study Outline';
    summaryText = 'This document covers general revision techniques, active recall strategies, and spaced repetition models to optimize exam preparation.';
    keyPoints = [
      'Active recall is more efficient than passive reading',
      'Spaced repetition increases retention over time',
      'Reviewing summaries before sleep helps memory consolidation'
    ];
  }

  const dynamicResponse = {
    title,
    summary: summaryText,
    keyPoints,
    wordCount: text ? text.split(/\s+/).length : 1500,
    readingTime: text ? `${Math.ceil(text.split(/\s+/).length / 200)} minutes` : '5 minutes'
  };

  const aiReq = await AIRequest.create({
    userId: req.user._id,
    courseId: courseId || undefined,
    fileId: fileId || undefined,
    type: 'summary',
    prompt: text || (fileId ? `Summarize file ${fileId}` : 'Summarize the uploaded document'),
    response: JSON.stringify(dynamicResponse),
    status: 'completed',
    tokensUsed: cost,
    model: 'db-dynamic-v1',
  });

  await deductTokens(req.user._id, cost, 'summary', aiReq._id);

  res.json({ success: true, data: { summary: dynamicResponse, tokensUsed: cost } });
});

// ─── POST /api/ai/generate-exercises ─────────────────────────────────────────
export const generateExercises = asyncHandler(async (req, res) => {
  const cost = TOKEN_COSTS.exercises;
  const { courseId, topic, difficulty, count } = req.body;

  const user = await User.findById(req.user._id);
  if (user.tokenBalance < cost) throw new ApiError(402, 'Insufficient token balance');

  let courseTitle = 'General Studies';
  if (courseId) {
    const course = await Course.findOne({ _id: courseId, userId: req.user._id });
    if (course) {
      courseTitle = course.title;
    }
  }

  const topicName = topic || 'General';
  const difficultyName = difficulty || 'medium';
  const exerciseCount = count || 3;

  const exercises = [];

  const questionsTemplates = {
    database: [
      { question: 'Explain the difference between primary keys and foreign keys in a relational database.', type: 'open', hint: 'Think about database referential integrity and how tables connect.' },
      { question: 'Which SQL keyword is used to sort the result-set?', type: 'mcq', options: ['SORT BY', 'ORDER BY', 'GROUP BY', 'ARRANGE'], answer: 'ORDER BY' },
      { question: 'Write a SQL query to select all records from a table named "Students" where "Age" is greater than 20.', type: 'coding', language: 'sql', hint: 'Use WHERE clause.' },
      { question: 'Explain the ACID properties in database transactions.', type: 'open', hint: 'Atomicity, Consistency, Isolation, Durability.' }
    ],
    math: [
      { question: 'What is the determinant of a 2x2 identity matrix?', type: 'mcq', options: ['0', '1', '2', '-1'], answer: '1' },
      { question: 'Explain what eigenvalue and eigenvector mean geometrically.', type: 'open', hint: 'Think about vector scaling without direction change.' },
      { question: 'Write a Python function to calculate the factorial of a number using recursion.', type: 'coding', language: 'python', hint: 'Base case is n <= 1.' }
    ],
    general: [
      { question: 'Explain the difference between process and thread in an operating system.', type: 'open', hint: 'Think about memory sharing and isolation.' },
      { question: 'What is the time complexity of binary search?', type: 'mcq', options: ['O(n)', 'O(log n)', 'O(n²)', 'O(1)'], answer: 'O(log n)' },
      { question: 'Write a JavaScript function to reverse a string.', type: 'coding', language: 'javascript', hint: 'Use split, reverse, and join methods.' }
    ]
  };

  let pool = questionsTemplates.general;
  const normalizedCourse = courseTitle.toLowerCase();
  const normalizedTopic = topicName.toLowerCase();

  if (normalizedCourse.includes('data') || normalizedCourse.includes('sql') || normalizedCourse.includes('syst') || normalizedTopic.includes('data') || normalizedTopic.includes('sql') || normalizedTopic.includes('query')) {
    pool = questionsTemplates.database;
  } else if (normalizedCourse.includes('math') || normalizedCourse.includes('algebra') || normalizedCourse.includes('calculus') || normalizedTopic.includes('math') || normalizedTopic.includes('matrix')) {
    pool = questionsTemplates.math;
  }

  const shuffled = [...pool].sort(() => 0.5 - Math.random());
  const selected = shuffled.slice(0, Math.min(exerciseCount, shuffled.length));

  for (let i = 0; i < selected.length; i++) {
    exercises.push({
      id: i + 1,
      ...selected[i]
    });
  }

  const dynamicResponse = {
    topic: topicName,
    difficulty: difficultyName,
    exercises
  };

  const aiReq = await AIRequest.create({
    userId: req.user._id,
    courseId: courseId || undefined,
    type: 'exercises',
    prompt: `Generate ${exerciseCount} exercises on ${topicName} at ${difficultyName} difficulty`,
    response: JSON.stringify(dynamicResponse),
    status: 'completed',
    tokensUsed: cost,
    model: 'db-dynamic-v1',
  });

  await deductTokens(req.user._id, cost, 'exercises', aiReq._id);

  res.json({ success: true, data: { exercises: dynamicResponse, tokensUsed: cost } });
});

// ─── POST /api/ai/chat ────────────────────────────────────────────────────────
export const chat = asyncHandler(async (req, res) => {
  const cost = TOKEN_COSTS.chat;
  const { message, courseId } = req.body;

  if (!message) throw new ApiError(400, 'Message is required');

  const user = await User.findById(req.user._id);
  if (user.tokenBalance < cost) throw new ApiError(402, 'Insufficient token balance');

  let courseTitle = '';
  if (courseId) {
    const course = await Course.findOne({ _id: courseId, userId: req.user._id });
    if (course) {
      courseTitle = course.title;
    }
  }

  const replies = [];
  if (courseTitle) {
    replies.push(
      `Great question about your course "${courseTitle}"! I recommend focusing on the core principles of ${courseTitle} and checking the files uploaded under your Study Context.`,
      `That is an interesting concept in "${courseTitle}". Spaced repetition can help you remember this. Would you like me to quiz you on this topic?`,
      `Based on the syllabus for "${courseTitle}", you should allocate some time this week to review. I can generate practice exercises on this if you want!`
    );
  } else {
    replies.push(
      `Great question! I suggest breaking this topic into smaller parts and testing yourself with practice questions.`,
      `That's a complex topic. Let's start with the basics: make sure you understand the key terms first, then build up.`,
      `I recommend writing down a quick summary of what you learn. Active recall is the fastest way to study.`
    );
  }

  const reply = replies[Math.floor(Math.random() * replies.length)];

  const aiReq = await AIRequest.create({
    userId: req.user._id,
    courseId: courseId || undefined,
    type: 'chat',
    prompt: message,
    response: reply,
    status: 'completed',
    tokensUsed: cost,
    model: 'db-dynamic-v1',
  });

  await deductTokens(req.user._id, cost, 'chat', aiReq._id);

  res.json({ success: true, data: { reply, tokensUsed: cost } });
});

// ─── GET /api/ai/history ──────────────────────────────────────────────────────
export const getAIHistory = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 20;

  const history = await AIRequest.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('courseId', 'title')
    .populate('fileId', 'originalName fileName size');

  res.json({
    success: true,
    count: history.length,
    data: history
  });
});


