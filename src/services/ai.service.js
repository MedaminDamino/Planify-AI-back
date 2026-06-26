import AIRequest from '../models/AIRequest.js';
import Course from '../models/Course.js';
import Exam from '../models/Exam.js';
import File from '../models/File.js';
import TokenTransaction from '../models/TokenTransaction.js';
import User from '../models/User.js';
import Task from '../models/Task.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getGeminiService, GeminiConfigurationError } from './gemini.service.js';
import {
  buildChatPrompt,
  buildDailyPlanPrompt,
  buildDashboardRecommendationsPrompt,
  buildGenerateExercisesPrompt,
  buildPrioritizeTasksPrompt,
  buildRevisionPlanPrompt,
  buildSummarizeFilePrompt,
  getBaseSystemInstruction,
} from '../utils/aiPromptBuilder.js';
import {
  loadAiBaseContext,
  loadCourseContext,
  loadExamContext,
  loadFileContext,
  loadTaskContext,
  toAiContextSnapshot,
} from './aiContext.service.js';

const TOKEN_COSTS = {
  daily_plan: 500,
  summarize_file: 800,
  exercises: 1000,
  prioritize_tasks: 500,
  revision_plan: 700,
  chat: 300,
  dashboard_recommendations: 250,
};

const AI_TYPES = {
  dailyPlan: 'daily_plan',
  summarizeFile: 'summarize_file',
  generateExercises: 'exercises',
  prioritizeTasks: 'prioritize_tasks',
  revisionPlan: 'revision_plan',
  chat: 'chat',
  dashboardRecommendations: 'dashboard_recommendations',
};

function logAiEvent(level, message, meta = {}) {
  const payload = {
    scope: 'ai',
    message,
    ...meta,
  };

  if (level === 'error') {
    console.error(payload);
    return;
  }

  console.info(payload);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeJsonParse(value) {
  if (isPlainObject(value)) return value;
  if (typeof value !== 'string') return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function safeString(value, fallback = '') {
  if (typeof value === 'string') return value.trim() || fallback;
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function pickNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeStringArray(value) {
  return safeArray(value).map((item) => safeString(item)).filter(Boolean);
}

function toIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function formatClock(date) {
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function daysUntil(value) {
  const diffMs = new Date(value).getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function createFallbackDailyPlan(context, input) {
  const hours = Math.max(1, Math.min(16, Number(input.focusHours) || 6));
  const baseCourse = context.courses[0];
  const baseTask = context.tasks.find((task) => task.status !== 'completed');
  const baseExam = context.exams.find((exam) => exam.status === 'upcoming');
  const date = input.date || new Date().toISOString().slice(0, 10);

  const plan = [];
  const startHour = 8;
  const blockCount = Math.max(2, Math.min(4, Math.ceil(hours / 2)));

  for (let index = 0; index < blockCount; index += 1) {
    const start = startHour + index * 2;
    const end = start + 2;
    plan.push({
      time: `${String(start).padStart(2, '0')}:00 - ${String(end).padStart(2, '0')}:00`,
      title: index === 0 && baseTask ? `Work on ${baseTask.title}` : baseCourse ? `Study ${baseCourse.title}` : 'General study block',
      activity: index === 0 && baseTask
        ? `Complete the next step for ${baseTask.title}`
        : baseExam
          ? `Review topics for ${baseExam.title}`
          : 'Review notes, revise key ideas, and do active recall',
      priority: index === 0 ? 'high' : index === 1 ? 'medium' : 'low',
      relatedTo: baseTask
        ? {
            type: 'task',
            id: baseTask.id,
            title: baseTask.title,
          }
        : baseCourse
          ? {
              type: 'course',
              id: baseCourse.id,
              title: baseCourse.title,
            }
          : null,
    });
  }

  return {
    date,
    focusHours: hours,
    overview: 'Fallback study plan created from your available academic data.',
    topPriorities: [
      {
        title: baseTask ? baseTask.title : 'Review your active course material',
        reason: baseTask
          ? 'This task is still open and should be completed first.'
          : 'Starting with a clear focus topic helps build momentum.',
      },
    ],
    plan,
    breaks: [
      {
        time: '10:00 - 10:15',
        durationMinutes: 15,
        note: 'Take a short reset break and stay hydrated.',
      },
    ],
    tips: [
      'Start with the most urgent task or exam topic.',
      'Use focused blocks and short breaks to keep energy stable.',
    ],
  };
}

function createFallbackSummary(context, input) {
  const file = input.file || null;
  const text = safeString(input.text);
  const title = file?.originalName || context.course?.title || 'Study Material';
  const sourceText = file?.extractedText || text || file?.description || context.course?.description || '';

  const summary = sourceText
    ? `This material covers ${title.toLowerCase()} and focuses on the key concepts students should review before an exam or assignment.`
    : `This material is connected to ${title} and should be reviewed alongside your course notes.`;

  return {
    title,
    summary,
    keyPoints: [
      sourceText ? `Review the main ideas from ${title}.` : 'Review the course overview and lecture notes.',
      'Focus on understanding the structure before memorizing details.',
      'Use the summary as a revision checklist.',
    ],
    topics: context.course?.title ? [context.course.title] : [title],
    studyTips: [
      'Read once for understanding, then again for recall.',
      'Turn each key point into a question and answer it from memory.',
    ],
    nextSteps: [
      'Highlight the most important sections.',
      'Revise the material again after a short break.',
    ],
  };
}

function createFallbackExercises(context, input) {
  const courseTitle = input.course?.title || context.course?.title || 'General Studies';
  const topic = safeString(input.topic, courseTitle);
  const difficulty = safeString(input.difficulty, 'medium');

  return {
    courseTitle,
    topic,
    difficulty,
    exercises: [
      {
        id: 1,
        question: `Explain the core idea of ${topic} in your own words.`,
        type: 'open',
        options: [],
        answer: 'A clear explanation that shows understanding of the main concept.',
        explanation: `This checks whether you can describe ${topic} simply and accurately.`,
        hint: 'Start with the definition, then add an example.',
      },
      {
        id: 2,
        question: `List two important facts or steps related to ${topic}.`,
        type: 'open',
        options: [],
        answer: 'Any two accurate facts or steps from the topic.',
        explanation: `This checks whether you can recall the key details of ${topic}.`,
        hint: 'Think about what your teacher repeats often.',
      },
    ],
  };
}

function createFallbackPriorities(context) {
  const tasks = [...(context.tasks || [])]
    .filter((task) => task.status !== 'completed')
    .sort((a, b) => {
      const priorityWeight = { high: 3, medium: 2, low: 1 };
      const aWeight = priorityWeight[a.priority] || 0;
      const bWeight = priorityWeight[b.priority] || 0;
      if (aWeight !== bWeight) return bWeight - aWeight;

      const aDeadline = a.deadline ? new Date(a.deadline).getTime() : Number.POSITIVE_INFINITY;
      const bDeadline = b.deadline ? new Date(b.deadline).getTime() : Number.POSITIVE_INFINITY;
      return aDeadline - bDeadline;
    });

  return {
    summary: 'Tasks ranked by urgency, priority, and deadline.',
    ranking: tasks.slice(0, 10).map((task, index) => ({
      taskId: task.id,
      title: task.title,
      score: 100 - index * 10,
      reason: task.deadline
        ? `Deadline is ${daysUntil(task.deadline)} day(s) away.`
        : `Marked as ${task.priority} priority.`,
      suggestedAction: task.status === 'todo'
        ? 'Start this task as soon as possible.'
        : 'Continue working on this task.',
    })),
    focusTips: [
      'Finish urgent work before starting new tasks.',
      'Move high-priority tasks into the next study block.',
    ],
  };
}

function createFallbackRevisionPlan(context, input) {
  const courseTitle = input.course?.title || context.course?.title || 'General Studies';
  const examTitle = input.exam?.title || context.exam?.title || courseTitle;
  const examDate = input.exam?.examDate || context.exam?.examDate || null;
  const topics = safeArray(input.exam?.topics || context.exam?.topics || context.course?.tags || []).filter(Boolean);

  return {
    title: `Revision plan for ${examTitle}`,
    summary: `A simple revision plan for ${courseTitle}.`,
    topicBreakdown: (topics.length ? topics : ['Core concepts', 'Practice questions', 'Weak areas']).map((topic, index) => ({
      topic,
      priority: index === 0 ? 'high' : 'medium',
      focus: `Review ${topic.toLowerCase()}`,
      timeEstimate: index === 0 ? '60 minutes' : '45 minutes',
    })),
    plan: [
      {
        day: 'Today',
        focus: 'Review the most important topics',
        tasks: ['Read notes', 'Solve questions', 'Summarize the main ideas'],
      },
      {
        day: 'Next session',
        focus: 'Practice weak areas',
        tasks: ['Do practice exercises', 'Review mistakes', 'Repeat key definitions'],
      },
    ],
    practiceIdeas: [
      'Use flashcards for definitions.',
      'Solve past papers under time pressure.',
    ],
    examTips: [
      examDate ? `The exam is coming up on ${new Date(examDate).toLocaleDateString()}.` : 'Keep revision sessions short and focused.',
      'Test yourself without looking at the notes first.',
    ],
  };
}

function createFallbackChat(context, input) {
  const courseTitle = input.course?.title || context.course?.title || null;
  const fileTitle = input.file?.originalName || context.file?.originalName || null;
  return {
    reply: courseTitle
      ? `Focus on the key ideas in ${courseTitle}, then test yourself with a short summary and a few practice questions.`
      : fileTitle
        ? `Use the selected file "${fileTitle}" as the source of truth, then identify the main ideas, key definitions, and likely exam questions.`
        : 'Break the topic into smaller parts, review the basics first, and then test yourself with active recall.',
    nextActions: [
      courseTitle ? `Review the latest notes for ${courseTitle}.` : 'Review your notes.',
      fileTitle ? `Open ${fileTitle} and highlight the key points.` : 'Choose a relevant file or topic.',
      'Write a short summary from memory.',
      'Try one or two practice questions.',
    ],
    followUpQuestion: 'Would you like a practice quiz or a shorter summary next?',
  };
}

function createFallbackDashboardRecommendations(context) {
  const recommendations = [];
  const topTask = context.tasks.find((task) => task.status !== 'completed');
  const nextExam = context.exams.find((exam) => exam.status === 'upcoming');
  const latestFile = context.files[0];
  const course = context.courses[0];

  if (topTask) {
    recommendations.push({
      title: 'Start with your top task',
      description: `${topTask.title} is still open and should be handled first.`,
      actionLabel: 'Open tasks',
      href: '/dashboard/tasks',
      tone: 'warning',
    });
  }

  if (nextExam) {
    recommendations.push({
      title: `Prepare for ${nextExam.title}`,
      description: nextExam.examDate
        ? `The exam is in ${Math.max(0, daysUntil(nextExam.examDate))} day(s).`
        : 'Review the exam topics as soon as possible.',
      actionLabel: 'Open exams',
      href: '/dashboard/exams',
      tone: 'info',
    });
  }

  if (latestFile) {
    recommendations.push({
      title: `Summarize ${latestFile.originalName}`,
      description: 'Turn your latest file into a short revision summary.',
      actionLabel: 'Open files',
      href: '/dashboard/files',
      tone: 'primary',
    });
  }

  if (course) {
    recommendations.push({
      title: `Review ${course.title}`,
      description: 'Use a focused block to move this course forward today.',
      actionLabel: 'Open courses',
      href: '/dashboard/courses',
      tone: 'success',
    });
  }

  return {
    summary: 'Actionable suggestions built from your current study context.',
    recommendations: recommendations.slice(0, 4),
    focusBlock: {
      title: topTask ? topTask.title : 'Study your most important topic',
      description: topTask
        ? 'Work on the most urgent task before moving to less important work.'
        : 'Use a focused block to make progress on your main subject today.',
    },
    studyTip: 'Use one deep-work block before checking notifications or social apps.',
  };
}

function extractGeminiObject(result) {
  if (isPlainObject(result) && !Object.prototype.hasOwnProperty.call(result, 'text')) {
    return result;
  }

  if (isPlainObject(result) && typeof result.text === 'string') {
    const parsed = safeJsonParse(result.text);
    return parsed;
  }

  if (typeof result === 'string') {
    return safeJsonParse(result) || { text: result };
  }

  return null;
}

function isUsablePayload(type, payload) {
  if (!isPlainObject(payload)) return false;

  switch (type) {
    case AI_TYPES.dailyPlan:
      return Array.isArray(payload.plan);
    case AI_TYPES.summarizeFile:
      return typeof payload.summary === 'string' && Array.isArray(payload.keyPoints);
    case AI_TYPES.generateExercises:
      return Array.isArray(payload.exercises);
    case AI_TYPES.prioritizeTasks:
      return Array.isArray(payload.ranking);
    case AI_TYPES.revisionPlan:
      return Array.isArray(payload.topicBreakdown) && Array.isArray(payload.plan);
    case AI_TYPES.chat:
      return typeof payload.reply === 'string';
    case AI_TYPES.dashboardRecommendations:
      return Array.isArray(payload.recommendations);
    default:
      return true;
  }
}

function normalizeDailyPlan(payload, context, input) {
  const planItems = safeArray(payload?.plan).map((item, index) => ({
    time: pickString(item?.time, `${String(8 + index * 2).padStart(2, '0')}:00 - ${String(10 + index * 2).padStart(2, '0')}:00`),
    title: pickString(item?.title, item?.subject, 'Study block'),
    subject: pickString(item?.subject, item?.title, context.courses[0]?.title, 'Study block'),
    activity: pickString(item?.activity, 'Review notes and practice active recall.'),
    priority: ['high', 'medium', 'low'].includes(item?.priority) ? item.priority : 'medium',
    relatedTo: isPlainObject(item?.relatedTo) ? {
      type: pickString(item.relatedTo.type, 'course'),
      id: pickString(item.relatedTo.id),
      title: pickString(item.relatedTo.title),
    } : null,
  }));

  return {
    date: pickString(payload?.date, input.date, new Date().toISOString().slice(0, 10)),
    focusHours: pickNumber(payload?.focusHours, pickNumber(input.focusHours, 6)),
    totalStudyHours: pickNumber(payload?.totalStudyHours, pickNumber(payload?.focusHours, pickNumber(input.focusHours, 6))),
    overview: pickString(payload?.overview, 'Plan created from your current study context.'),
    topPriorities: safeArray(payload?.topPriorities).map((item) => ({
      title: pickString(item?.title, 'Priority'),
      reason: pickString(item?.reason, 'Important for your study progress.'),
    })),
    plan: planItems,
    breaks: safeArray(payload?.breaks).map((item, index) => ({
      time: pickString(item?.time, `${String(10 + index * 2).padStart(2, '0')}:00 - ${String(10 + index * 2).padStart(2, '0')}:15`),
      durationMinutes: pickNumber(item?.durationMinutes, 15),
      note: pickString(item?.note, 'Take a short reset break.'),
    })),
    tips: normalizeStringArray(payload?.tips),
  };
}

function normalizeSummary(payload, context, input) {
  const wordCount = Number(payload?.wordCount);
  return {
    title: pickString(payload?.title, input.file?.originalName, context.course?.title, 'Study Material'),
    summary: pickString(payload?.summary, 'Summary unavailable.'),
    keyPoints: normalizeStringArray(payload?.keyPoints).slice(0, 8),
    topics: normalizeStringArray(payload?.topics).slice(0, 8),
    studyTips: normalizeStringArray(payload?.studyTips).slice(0, 8),
    nextSteps: normalizeStringArray(payload?.nextSteps).slice(0, 8),
    wordCount: Number.isFinite(wordCount) ? wordCount : null,
    readingTime: pickString(payload?.readingTime),
  };
}

function normalizeExercises(payload, context, input) {
  const exercises = safeArray(payload?.exercises).map((item, index) => ({
    id: pickNumber(item?.id, index + 1),
    question: pickString(item?.question, 'Practice question'),
    type: ['open', 'mcq', 'coding'].includes(item?.type) ? item.type : 'open',
    options: normalizeStringArray(item?.options).slice(0, 6),
    answer: pickString(item?.answer),
    explanation: pickString(item?.explanation),
    hint: pickString(item?.hint),
    language: pickString(item?.language),
  }));

  return {
    courseTitle: pickString(payload?.courseTitle, input.course?.title, context.course?.title, 'General Studies'),
    topic: pickString(payload?.topic, input.topic, 'General'),
    difficulty: ['easy', 'medium', 'hard'].includes(payload?.difficulty) ? payload.difficulty : pickString(input.difficulty, 'medium'),
    exercises,
  };
}

function normalizePriorities(payload, context) {
  const ranking = safeArray(payload?.ranking).map((item, index) => ({
    taskId: pickString(item?.taskId, item?.id, context.tasks[index]?.id),
    title: pickString(item?.title, context.tasks[index]?.title, 'Task'),
    score: pickNumber(item?.score, Math.max(0, 100 - index * 10)),
    reason: pickString(item?.reason, 'Prioritized from study context.'),
    suggestedAction: pickString(item?.suggestedAction, 'Start this task soon.'),
  }));

  return {
    summary: pickString(payload?.summary, 'Tasks ranked by urgency and deadline.'),
    ranking,
    focusTips: normalizeStringArray(payload?.focusTips),
  };
}

function normalizeRevisionPlan(payload, context, input) {
  return {
    title: pickString(payload?.title, input.exam?.title, input.course?.title, 'Revision plan'),
    summary: pickString(payload?.summary, 'Revision plan generated from your study context.'),
    topicBreakdown: safeArray(payload?.topicBreakdown).map((item) => ({
      topic: pickString(item?.topic, 'Topic'),
      priority: ['high', 'medium', 'low'].includes(item?.priority) ? item.priority : 'medium',
      focus: pickString(item?.focus, 'Review the core ideas.'),
      timeEstimate: pickString(item?.timeEstimate, '45 minutes'),
    })),
    plan: safeArray(payload?.plan).map((item) => ({
      day: pickString(item?.day, 'Day'),
      focus: pickString(item?.focus, 'Study session'),
      tasks: normalizeStringArray(item?.tasks),
    })),
    practiceIdeas: normalizeStringArray(payload?.practiceIdeas),
    examTips: normalizeStringArray(payload?.examTips),
  };
}

function normalizeChat(payload, context, input) {
  return {
    reply: pickString(payload?.reply, payload?.text, 'I can help you study this topic.'),
    nextActions: normalizeStringArray(payload?.nextActions).slice(0, 5),
    followUpQuestion: pickString(payload?.followUpQuestion, 'What should we work on next?'),
    tone: pickString(payload?.tone, context.user?.studyPreferences?.aiAssistantTone, 'friendly'),
    topic: pickString(payload?.topic, input.course?.title, input.file?.originalName, context.course?.title, context.file?.originalName),
    confidence: pickString(payload?.confidence, 'high'),
  };
}

function normalizeDashboardRecommendations(payload) {
  return {
    summary: pickString(payload?.summary, 'Here are your next actions for today.'),
    recommendations: safeArray(payload?.recommendations).map((item) => ({
      title: pickString(item?.title, 'Recommendation'),
      description: pickString(item?.description, 'Helpful next step.'),
      actionLabel: pickString(item?.actionLabel, 'Open'),
      href: pickString(item?.href, '/dashboard'),
      tone: ['primary', 'success', 'info', 'warning', 'ai', 'danger'].includes(item?.tone) ? item.tone : 'primary',
    })),
    focusBlock: {
      title: pickString(payload?.focusBlock?.title, 'Focus block'),
      description: pickString(payload?.focusBlock?.description, 'Do the most important work first.'),
    },
    studyTip: pickString(payload?.studyTip, 'Stay consistent with one focused block.'),
  };
}

async function reserveTokens(userId, cost, label) {
  const updated = await User.findOneAndUpdate(
    { _id: userId, tokenBalance: { $gte: cost } },
    { $inc: { tokenBalance: -cost } },
    { new: true }
  ).select('tokenBalance name email');

  if (!updated) {
    throw new ApiError(402, 'Insufficient token balance');
  }

  logAiEvent('info', `Reserved tokens for ${label}`, {
    userId: String(userId),
    cost,
    balanceAfter: updated.tokenBalance,
  });

  return {
    balanceBefore: updated.tokenBalance + cost,
    balanceAfter: updated.tokenBalance,
  };
}

async function refundTokens(userId, reservation, label) {
  if (!reservation) return;

  await User.updateOne({ _id: userId }, { $inc: { tokenBalance: reservation.balanceBefore - reservation.balanceAfter } });

  await TokenTransaction.create({
    userId,
    type: 'refund',
    amount: reservation.balanceBefore - reservation.balanceAfter,
    reason: `Refund for failed AI ${label} request`,
    balanceBefore: reservation.balanceAfter,
    balanceAfter: reservation.balanceBefore,
  });
}

async function chargeTokens(userId, reservation, cost, requestId, label) {
  await TokenTransaction.create({
    userId,
    type: 'usage',
    amount: -cost,
    reason: `AI ${label} request`,
    balanceBefore: reservation.balanceBefore,
    balanceAfter: reservation.balanceAfter,
    aiRequestId: requestId,
  });
}

async function createAiRequest({ userId, type, prompt, metadata, model, courseId, fileId, taskId, examId }) {
  return AIRequest.create({
    userId,
    courseId: courseId || undefined,
    fileId: fileId || undefined,
    taskId: taskId || undefined,
    examId: examId || undefined,
    type,
    prompt,
    status: 'pending',
    model,
    metadata,
  });
}

async function executeAiJob({
  req,
  type,
  label,
  cost,
  promptPackage,
  metadata,
  context,
  fallbackFactory,
  dataMapper,
  courseId,
  fileId,
  taskId,
  examId,
  maxOutputTokens = 2048,
}) {
  const gemini = getGeminiService();
  let reservation = null;
  let aiRequest = null;
  const prompt = promptPackage.userPrompt;

  try {
    reservation = await reserveTokens(req.user._id, cost, label);
    aiRequest = await createAiRequest({
      userId: req.user._id,
      type,
      prompt: safeString(promptPackage.historyPrompt, label),
      metadata: {
        ...metadata,
        historyPrompt: safeString(promptPackage.historyPrompt, label),
      },
      model: gemini.modelName,
      courseId,
      fileId,
      taskId,
      examId,
    });

    const rawResult = await gemini.generateJson(prompt, {
      systemInstruction: promptPackage.systemInstruction || getBaseSystemInstruction(),
      maxOutputTokens,
    });

    const normalized = extractGeminiObject(rawResult);
    const usable = normalized && isUsablePayload(type, normalized) ? normalized : fallbackFactory();
    const payload = dataMapper(usable, context);
    const historyResponse = type === AI_TYPES.chat
      ? safeString(payload.reply, JSON.stringify(payload))
      : JSON.stringify(payload);

    aiRequest.status = 'completed';
    aiRequest.response = historyResponse;
    aiRequest.tokensUsed = cost;
    aiRequest.internalTokensCost = cost;
    aiRequest.metadata = {
      ...metadata,
      source: 'gemini',
    };
    await aiRequest.save();

    await chargeTokens(req.user._id, reservation, cost, aiRequest._id, label);

    logAiEvent('info', `Completed AI ${label} request`, {
      userId: String(req.user._id),
      requestId: String(aiRequest._id),
      cost,
    });

    return { aiRequest, payload };
  } catch (error) {
    if (aiRequest) {
      aiRequest.status = 'failed';
      aiRequest.errorMessage = safeString(error?.message, 'AI request failed');
      aiRequest.tokensUsed = 0;
      aiRequest.internalTokensCost = 0;
      aiRequest.metadata = {
        ...metadata,
        source: 'gemini',
        error: safeString(error?.message, 'Unknown error'),
      };

      try {
        await aiRequest.save();
      } catch (saveError) {
        logAiEvent('error', 'Failed to persist AI request failure state', {
          userId: String(req.user._id),
          error: safeString(saveError?.message, 'Unknown save error'),
        });
      }
    }

    if (reservation) {
      await refundTokens(req.user._id, reservation, label);
    }

    logAiEvent('error', `Failed AI ${label} request`, {
      userId: String(req.user._id),
      requestId: aiRequest ? String(aiRequest._id) : null,
      error: safeString(error?.message, 'Unknown error'),
    });

    if (error instanceof GeminiConfigurationError) {
      throw new ApiError(500, error.message);
    }

    throw new ApiError(503, 'Gemini AI request failed. Please try again.');
  }
}

export const generateDailyPlan = asyncHandler(async (req, res) => {
  const baseContext = await loadAiBaseContext(req.user._id);
  const selectedCourseIds = Array.isArray(req.body.courseIds) && req.body.courseIds.length ? req.body.courseIds : [];
  const selectedCourses = selectedCourseIds.length
    ? await Course.find({ userId: req.user._id, _id: { $in: selectedCourseIds } }).lean()
    : [];

  const context = toAiContextSnapshot(baseContext, {
    date: req.body.date || new Date().toISOString().slice(0, 10),
    focusHours: req.body.focusHours || 6,
    selectedCourses: selectedCourses.map((course) => ({
      id: String(course._id),
      title: course.title,
      status: course.status,
      priority: course.priority,
      progress: Number(course.progress) || 0,
    })),
  });

  const promptPackage = buildDailyPlanPrompt(context);
  const { payload } = await executeAiJob({
    req,
    type: AI_TYPES.dailyPlan,
    label: 'daily plan',
    cost: TOKEN_COSTS.daily_plan,
    promptPackage,
    metadata: { endpoint: '/api/ai/daily-plan' },
    context,
    fallbackFactory: () => createFallbackDailyPlan(context, req.body),
    dataMapper: (data) => normalizeDailyPlan(data, context, req.body),
    courseId: selectedCourses[0]?._id,
    maxOutputTokens: 2048,
  });

  res.json({ success: true, data: { plan: payload, tokensUsed: TOKEN_COSTS.daily_plan } });
});

export const summarizeFile = asyncHandler(async (req, res) => {
  const baseContext = await loadAiBaseContext(req.user._id);
  const fileContext = req.body.fileId ? await loadFileContext(req.user._id, req.body.fileId) : null;
  const courseContext = req.body.courseId ? await loadCourseContext(req.user._id, req.body.courseId) : null;

  const context = toAiContextSnapshot(baseContext, {
    file: fileContext?.file || null,
    course: courseContext?.course || null,
    providedText: safeString(req.body.text),
  });

  const promptPackage = buildSummarizeFilePrompt(context);
  const { payload } = await executeAiJob({
    req,
    type: AI_TYPES.summarizeFile,
    label: 'file summary',
    cost: TOKEN_COSTS.summarize_file,
    promptPackage,
    metadata: { endpoint: '/api/ai/summarize-file' },
    context,
    fallbackFactory: () => createFallbackSummary(context, { file: fileContext?.file, text: req.body.text }),
    dataMapper: (data) => normalizeSummary(data, context, { file: fileContext?.file, text: req.body.text }),
    courseId: courseContext?.course?.id || undefined,
    fileId: fileContext?.file?.id || req.body.fileId,
    maxOutputTokens: 2048,
  });

  const summary = payload;

  if (fileContext?.file?.id) {
    await File.findByIdAndUpdate(fileContext.file.id, {
      aiSummary: summary.summary || '',
      keyPoints: safeArray(summary.keyPoints),
      status: 'processed',
    });
  }

  res.json({ success: true, data: { summary, tokensUsed: TOKEN_COSTS.summarize_file } });
});

export const generateExercises = asyncHandler(async (req, res) => {
  const baseContext = await loadAiBaseContext(req.user._id);
  const courseContext = req.body.courseId ? await loadCourseContext(req.user._id, req.body.courseId) : null;

  const context = toAiContextSnapshot(baseContext, {
    course: courseContext?.course || null,
    topic: safeString(req.body.topic),
    difficulty: safeString(req.body.difficulty, 'medium'),
    count: req.body.count || 3,
  });

  const promptPackage = buildGenerateExercisesPrompt(context);
  const { payload } = await executeAiJob({
    req,
    type: AI_TYPES.generateExercises,
    label: 'exercise generation',
    cost: TOKEN_COSTS.exercises,
    promptPackage,
    metadata: { endpoint: '/api/ai/generate-exercises' },
    context,
    fallbackFactory: () => createFallbackExercises(context, { course: courseContext?.course, topic: req.body.topic, difficulty: req.body.difficulty }),
    dataMapper: (data) => normalizeExercises(data, context, { course: courseContext?.course, topic: req.body.topic, difficulty: req.body.difficulty }),
    courseId: courseContext?.course?.id || undefined,
    maxOutputTokens: 2500,
  });

  res.json({ success: true, data: { exercises: payload, tokensUsed: TOKEN_COSTS.exercises } });
});

export const prioritizeTasks = asyncHandler(async (req, res) => {
  const baseContext = await loadAiBaseContext(req.user._id);
  const taskContext = await loadTaskContext(req.user._id, {
    taskIds: req.body.taskIds,
    courseId: req.body.courseId,
    status: req.body.status,
    priority: req.body.priority,
  });

  const context = toAiContextSnapshot(baseContext, {
    filters: {
      taskIds: req.body.taskIds || [],
      courseId: req.body.courseId || null,
      status: req.body.status || null,
      priority: req.body.priority || null,
      limit: req.body.limit || null,
    },
    tasks: taskContext.tasks,
  });

  const promptPackage = buildPrioritizeTasksPrompt(context);
  const { payload } = await executeAiJob({
    req,
    type: AI_TYPES.prioritizeTasks,
    label: 'task prioritization',
    cost: TOKEN_COSTS.prioritize_tasks,
    promptPackage,
    metadata: { endpoint: '/api/ai/prioritize-tasks' },
    context,
    fallbackFactory: () => createFallbackPriorities(context),
    dataMapper: (data) => normalizePriorities(data, context),
    taskId: req.body.taskIds?.[0] || undefined,
    maxOutputTokens: 2200,
  });

  res.json({ success: true, data: { prioritization: payload, tokensUsed: TOKEN_COSTS.prioritize_tasks } });
});

export const revisionPlan = asyncHandler(async (req, res) => {
  const baseContext = await loadAiBaseContext(req.user._id);
  const courseContext = req.body.courseId ? await loadCourseContext(req.user._id, req.body.courseId) : null;
  const examContext = req.body.examId ? await loadExamContext(req.user._id, req.body.examId) : null;

  const context = toAiContextSnapshot(baseContext, {
    course: courseContext?.course || null,
    exam: examContext?.exam || null,
    courseTasks: courseContext?.tasks || [],
    courseFiles: courseContext?.files || [],
    courseSchedule: courseContext?.schedule || [],
  });

  const promptPackage = buildRevisionPlanPrompt(context);
  const { payload } = await executeAiJob({
    req,
    type: AI_TYPES.revisionPlan,
    label: 'revision plan',
    cost: TOKEN_COSTS.revision_plan,
    promptPackage,
    metadata: { endpoint: '/api/ai/revision-plan' },
    context,
    fallbackFactory: () => createFallbackRevisionPlan(context, { course: courseContext?.course, exam: examContext?.exam }),
    dataMapper: (data) => normalizeRevisionPlan(data, context, { course: courseContext?.course, exam: examContext?.exam }),
    courseId: courseContext?.course?.id || undefined,
    examId: examContext?.exam?.id || undefined,
    maxOutputTokens: 2500,
  });

  res.json({ success: true, data: { revisionPlan: payload, tokensUsed: TOKEN_COSTS.revision_plan } });
});

export const chat = asyncHandler(async (req, res) => {
  const baseContext = await loadAiBaseContext(req.user._id);
  const courseContext = req.body.courseId ? await loadCourseContext(req.user._id, req.body.courseId) : null;
  const fileContext = req.body.fileId ? await loadFileContext(req.user._id, req.body.fileId) : null;
  const recentMessages = safeArray(req.body.recentMessages).map((item) => ({
    role: item.role,
    content: safeString(item.content),
    type: item.type || 'chat',
  }));

  const context = toAiContextSnapshot(baseContext, {
    message: req.body.message,
    course: courseContext?.course || null,
    file: fileContext?.file || null,
    recentTasks: baseContext.tasks.slice(0, 5),
    recentExams: baseContext.exams.slice(0, 5),
    recentFiles: baseContext.files.slice(0, 5),
    recentConversation: recentMessages,
  });

  const promptPackage = buildChatPrompt(context);
  const { payload } = await executeAiJob({
    req,
    type: AI_TYPES.chat,
    label: 'chat',
    cost: TOKEN_COSTS.chat,
    promptPackage,
    metadata: { endpoint: '/api/ai/chat' },
    context,
    fallbackFactory: () => createFallbackChat(context, { course: courseContext?.course, file: fileContext?.file }),
    dataMapper: (data) => normalizeChat(data, context, { course: courseContext?.course, file: fileContext?.file }),
    courseId: courseContext?.course?.id || undefined,
    fileId: fileContext?.file?.id || undefined,
    maxOutputTokens: 1200,
  });

  res.json({ success: true, data: { reply: payload.reply, message: payload.reply, chat: payload, tokensUsed: TOKEN_COSTS.chat } });
});

export const dashboardRecommendations = asyncHandler(async (req, res) => {
  const baseContext = await loadAiBaseContext(req.user._id);
  const context = toAiContextSnapshot(baseContext, {
    targetDate: req.body.date || new Date().toISOString().slice(0, 10),
    todayTasks: baseContext.tasks.slice(0, 8),
    todayExams: baseContext.exams.slice(0, 8),
    todayFiles: baseContext.files.slice(0, 5),
    todaySchedule: baseContext.schedule.slice(0, 8),
  });

  const promptPackage = buildDashboardRecommendationsPrompt(context);
  const { payload } = await executeAiJob({
    req,
    type: AI_TYPES.dashboardRecommendations,
    label: 'dashboard recommendations',
    cost: TOKEN_COSTS.dashboard_recommendations,
    promptPackage,
    metadata: { endpoint: '/api/ai/dashboard-recommendations' },
    context,
    fallbackFactory: () => createFallbackDashboardRecommendations(context),
    dataMapper: (data) => normalizeDashboardRecommendations(data, context),
    maxOutputTokens: 1800,
  });

  res.json({ success: true, data: { recommendations: payload, tokensUsed: TOKEN_COSTS.dashboard_recommendations } });
});

export const getAIHistory = asyncHandler(async (req, res) => {
  const limit = Math.max(1, Math.min(100, Number.parseInt(req.query.limit, 10) || 20));

  const history = await AIRequest.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('courseId', 'title teacher semester')
    .populate('fileId', 'originalName fileName size')
    .populate('taskId', 'title priority status')
    .lean();

  res.json({
    success: true,
    count: history.length,
    data: history,
  });
});

export const getTokenCosts = () => ({ ...TOKEN_COSTS });
