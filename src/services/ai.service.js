import AIRequest from '../models/AIRequest.js';
import { randomUUID } from 'node:crypto';
import Course from '../models/Course.js';
import Exam from '../models/Exam.js';
import File from '../models/File.js';
import ScheduleEvent from '../models/ScheduleEvent.js';
import TokenTransaction from '../models/TokenTransaction.js';
import User from '../models/User.js';
import Task from '../models/Task.js';
import { z } from 'zod';
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
  buildScheduleBuilderChatPrompt,
  buildScheduleBuilderGeneratePrompt,
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
  schedule_builder_chat: 300,
  schedule_builder_generate: 1200,
};

const AI_TYPES = {
  dailyPlan: 'daily_plan',
  summarizeFile: 'summarize_file',
  generateExercises: 'exercises',
  prioritizeTasks: 'prioritize_tasks',
  revisionPlan: 'revision_plan',
  chat: 'chat',
  dashboardRecommendations: 'dashboard_recommendations',
  scheduleBuilderChat: 'schedule_builder_chat',
  scheduleBuilderGenerate: 'schedule_builder_generate',
};

const CHAT_RESPONSE_TYPES = new Set([
  'chat',
  'exam',
  'summary',
  'exercises',
  'flashcards',
  'daily_plan',
  'revision_plan',
  'prioritize_tasks',
  'schedule_builder_chat',
  'schedule_builder_generate',
]);

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
    const trimmed = value.trim();
    const firstObject = trimmed.indexOf('{');
    const lastObject = trimmed.lastIndexOf('}');

    if (firstObject >= 0 && lastObject > firstObject) {
      try {
        return JSON.parse(trimmed.slice(firstObject, lastObject + 1));
      } catch {
        // fall through
      }
    }

    const firstArray = trimmed.indexOf('[');
    const lastArray = trimmed.lastIndexOf(']');

    if (firstArray >= 0 && lastArray > firstArray) {
      try {
        return JSON.parse(trimmed.slice(firstArray, lastArray + 1));
      } catch {
        // fall through
      }
    }

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

function createConversationId() {
  return randomUUID();
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

function summarizeText(value, maxLength = 48) {
  const text = safeString(value);
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}â€¦` : text;
}

function buildConversationTitle(mode, message, topic = '') {
  const cleaned = summarizeText(topic || message, 36) || 'New chat';
  switch (mode) {
    case 'exam':
      return `Exam prep: ${cleaned}`;
    case 'exercise':
      return `Exercises: ${cleaned}`;
    case 'flashcards':
      return `Flashcards: ${cleaned}`;
    case 'summary':
      return `Summary: ${cleaned}`;
    case 'daily_plan':
      return `Study plan: ${cleaned}`;
    case 'prioritize_tasks':
      return `Task priorities: ${cleaned}`;
    case 'revision_plan':
      return `Revision plan: ${cleaned}`;
    case 'schedule_builder_chat':
    case 'schedule_builder_generate':
      return `Schedule Builder: ${cleaned}`;
    default:
      return cleaned;
  }
}

function isDevelopment() {
  return safeString(process.env.NODE_ENV, 'development') === 'development';
}

function truncateForLog(value, maxLength = 4000) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength)}... [truncated ${text.length - maxLength} chars]` : text;
}

function safeJsonStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function getErrorStatus(error) {
  const status = Number(error?.statusCode || error?.status);
  return Number.isFinite(status) ? status : null;
}

function parseGeminiErrorPayload(error) {
  const message = safeString(error?.message);
  const parsed = safeJsonParse(message);
  if (isPlainObject(parsed?.error)) {
    return {
      status: Number(parsed.error.code || parsed.error.status || error?.status || error?.statusCode) || null,
      message: safeString(parsed.error.message, message),
      code: safeString(parsed.error.status, ''),
      rawMessage: message,
    };
  }

  return {
    status: getErrorStatus(error),
    message,
    code: safeString(error?.code, ''),
    rawMessage: message,
  };
}

function isRetryableGeminiError(error) {
  const status = getErrorStatus(error);
  if ([429, 500, 503, 504, 408].includes(status)) return true;

  const message = safeString(error?.message).toLowerCase();
  return [
    'timed out',
    'timeout',
    'network',
    'fetch failed',
    'econnreset',
    'etimedout',
    'eai_again',
    'socket hang up',
  ].some((token) => message.includes(token));
}

function buildGeminiErrorResponse(error, fallbackMessage = 'Gemini AI request failed. Please try again.') {
  const parsed = parseGeminiErrorPayload(error);
  const status = parsed.status && parsed.status >= 400 ? parsed.status : 503;
  const message = isDevelopment() && parsed.message ? parsed.message : fallbackMessage;

  const apiError = new ApiError(status, message, { cause: error });
  apiError.stack = error?.stack || apiError.stack;
  apiError.rawGeminiError = parsed.rawMessage;
  apiError.geminiStatus = parsed.status;
  apiError.geminiCode = parsed.code;
  return apiError;
}

function summarizeScheduleContextForLog(context) {
  return {
    courses: safeArray(context?.courses).length,
    tasks: safeArray(context?.tasks).length,
    exams: safeArray(context?.exams).length,
    files: safeArray(context?.files).length,
    schedule: safeArray(context?.schedule).length,
    recentSchedule: safeArray(context?.recentSchedule).length,
    busyPeriods: safeArray(context?.busyPeriods).length,
    freePeriods: safeArray(context?.freePeriods).length,
    conversationHistory: safeArray(context?.conversationHistory).length,
  };
}

function getPromptStats(promptPackage, prompt) {
  const systemInstruction = safeString(promptPackage?.systemInstruction);
  const schema = promptPackage?.responseSchema || null;

  return {
    promptLength: safeString(prompt).length,
    systemInstructionLength: systemInstruction.length,
    schemaLength: safeJsonStringify(schema).length,
  };
}

function getWeekBounds(dateValue = new Date()) {
  const base = new Date(dateValue);
  const day = base.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(base);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + mondayOffset);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return {
    start,
    end,
  };
}

function sanitizeResponseType(value, fallback = 'chat') {
  const type = safeString(value).toLowerCase();
  const alias = {
    exercise: 'exercises',
    flashcard: 'flashcards',
    study_plan: 'daily_plan',
    studyplan: 'daily_plan',
    roadmap: 'revision_plan',
    plan: 'daily_plan',
  };
  const canonicalType = alias[type] || type;
  return CHAT_RESPONSE_TYPES.has(canonicalType) ? canonicalType : fallback;
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
    ? `This material centers on ${title.toLowerCase()} and should be reviewed for the main ideas, supporting details, and the links between concepts.`
    : `This material is connected to ${title} and is best reviewed alongside your course notes and recent exercises.`;

  return {
    title,
    summary,
    keyPoints: [
      sourceText ? `Focus on the central ideas from ${title}.` : 'Review the course overview and lecture notes.',
      'Connect each important point to an example or application.',
      'Use the summary as a revision checklist and a recall prompt.',
    ],
    topics: context.course?.title ? [context.course.title] : [title],
    studyTips: [
      'Read once for understanding, then again for recall without notes.',
      'Turn each key point into a question and answer it from memory.',
    ],
    nextSteps: [
      'Highlight the sections that are most likely to be tested.',
      'Revise the material again after a short break.',
    ],
  };
}

function createFallbackExercises(context, input) {
  const courseTitle = input.course?.title || context.course?.title || 'General Studies';
  const topic = safeString(input.topic, courseTitle);
  const difficulty = safeString(input.difficulty, 'medium');
  const count = Math.max(1, Math.min(20, Number(input.count) || 5));
  const stems = [
    {
      question: `What is the most important principle to remember about ${topic}?`,
      answer: `The learner should identify the core principle that organizes ${topic} and explain why it matters.`,
      explanation: `This checks whether the student can isolate the foundational idea behind ${topic}.`,
      hint: `Focus on the main purpose of ${topic}.`,
    },
    {
      question: `How would you apply ${topic} in a realistic academic or professional situation?`,
      answer: `A strong answer links ${topic} to a concrete scenario and explains the reasoning step by step.`,
      explanation: `Application questions test whether knowledge can be transferred to practice.`,
      hint: `Think of a real use case.`,
    },
    {
      question: `Which trade-off or limitation should be considered when using ${topic}?`,
      answer: `A solid answer mentions a realistic limitation, explains the impact, and suggests a sensible mitigation.`,
      explanation: `Good learners do not only memorize benefits; they also recognize constraints.`,
      hint: `Look for a practical drawback.`,
    },
    {
      question: `How does ${topic} compare with a closely related approach or alternative?`,
      answer: `The comparison should identify similarities, differences, and the best scenario for each approach.`,
      explanation: `Comparison develops deeper understanding and helps with exam-style reasoning.`,
      hint: `Use contrast and justify the choice.`,
    },
    {
      question: `What mistake would most likely lead to an incorrect use of ${topic}?`,
      answer: `Common mistakes usually come from misunderstanding scope, prerequisites, or when the concept should be applied.`,
      explanation: `Recognizing common errors improves accuracy and retention.`,
      hint: `Think about what students often confuse.`,
    },
  ];
  const exercises = Array.from({ length: count }, (_, index) => {
    const item = stems[index % stems.length];
    return {
      id: index + 1,
      question: item.question,
      type: 'open',
      options: [],
      answer: item.answer,
      explanation: item.explanation,
      hint: item.hint,
      language: '',
    };
  });

  return {
    courseTitle,
    topic,
    difficulty,
    count,
    exercises,
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

function buildFallbackExamChoices(baseTopic, focusLabel) {
  const topic = safeString(baseTopic, 'the topic');
  const focus = safeString(focusLabel, 'the concept');
  return [
    `A practical application of ${topic} that helps explain ${focus}.`,
    `A surface-level interpretation of ${topic} that ignores the main trade-offs.`,
    `A process that is unrelated to ${topic} but sounds academic.`,
    `A memorized definition that does not fit the real context.`,
  ];
}

function createTopicAwareExamQuestions(baseTopic, questionCount) {
  const topic = safeString(baseTopic, 'the topic');
  const normalizedTopic = topic.toLowerCase();

  const cloudQuestions = [
    {
      question: `Which statement best describes the primary advantage of cloud computing for a growing team?`,
      answer: 'It allows the team to scale resources on demand without buying new hardware upfront.',
      options: [
        'It allows the team to scale resources on demand without buying new hardware upfront.',
        'It requires every workload to run on a single local server.',
        'It removes the need for internet connectivity entirely.',
        'It guarantees the same cost regardless of usage.',
      ],
      explanation: 'Cloud computing is designed to provide elastic resources that can expand or shrink with demand.',
    },
    {
      question: `In cloud computing, which service model gives you the most control over operating systems and installed software?`,
      answer: 'Infrastructure as a Service (IaaS)',
      options: [
        'Infrastructure as a Service (IaaS)',
        'Software as a Service (SaaS)',
        'Function as a Service (FaaS) only',
        'Platform as a Service (PaaS)',
      ],
      explanation: 'IaaS exposes virtual machines, storage, and networking while leaving more control to the customer.',
    },
    {
      question: `Which deployment choice is usually best when an organization wants to combine private control with public cloud scalability?`,
      answer: 'Hybrid cloud',
      options: [
        'Hybrid cloud',
        'Single-user cloud',
        'Local-only deployment',
        'Offline deployment model',
      ],
      explanation: 'A hybrid cloud combines private and public environments to balance control and scalability.',
    },
    {
      question: `What is the main reason cloud providers use regions and availability zones?`,
      answer: 'To improve fault tolerance and reduce the impact of outages.',
      options: [
        'To improve fault tolerance and reduce the impact of outages.',
        'To keep all users on one physical machine.',
        'To eliminate the need for backups.',
        'To make applications run only during business hours.',
      ],
      explanation: 'Regions and zones support resilience, redundancy, and lower-latency architecture choices.',
    },
    {
      question: `Which practice best improves cloud cost control over time?`,
      answer: 'Right-sizing resources and monitoring usage continuously.',
      options: [
        'Right-sizing resources and monitoring usage continuously.',
        'Provisioning the largest possible instance for every workload.',
        'Ignoring unused storage volumes.',
        'Avoiding metrics and logs.',
      ],
      explanation: 'Cost management in the cloud depends on matching resources to actual demand.',
    },
    {
      question: `Which security concept is most important for limiting what a user can do in the cloud?`,
      answer: 'Least privilege access control',
      options: [
        'Least privilege access control',
        'Public by default access',
        'Shared password for every user',
        'Disabling authentication logs',
      ],
      explanation: 'Least privilege gives users only the permissions required for their tasks.',
    },
  ];

  const genericQuestions = [
    {
      question: `Which option best captures the core idea of ${topic}?`,
      answer: `A structured set of principles and practices related to ${topic}.`,
      options: buildFallbackExamChoices(topic, 'the core idea'),
      explanation: `This checks whether the learner understands the foundational purpose of ${topic}.`,
    },
    {
      question: `Which example most clearly shows how ${topic} is applied in practice?`,
      answer: `A scenario where ${topic} is used to solve a real problem effectively.`,
      options: [
        `A scenario where ${topic} is used to solve a real problem effectively.`,
        `A case where ${topic} is mentioned but never actually used.`,
        `A situation unrelated to ${topic} that happens by coincidence.`,
        `A purely memorized definition with no application.`,
      ],
      explanation: `This moves beyond recall and checks practical understanding of ${topic}.`,
    },
    {
      question: `What is the best reason to compare different approaches within ${topic}?`,
      answer: 'To choose the option that best fits the constraints and objective.',
      options: [
        'To choose the option that best fits the constraints and objective.',
        'To avoid making any decision at all.',
        'To memorize vocabulary without understanding.',
        'To keep the solution identical in every situation.',
      ],
      explanation: `Comparison questions test whether the learner can evaluate trade-offs in ${topic}.`,
    },
    {
      question: `Which action most strongly shows mastery of ${topic}?`,
      answer: `Applying ${topic} correctly in a realistic scenario and explaining the reasoning.`,
      options: [
        `Applying ${topic} correctly in a realistic scenario and explaining the reasoning.`,
        `Repeating a definition without context.`,
        `Guessing the answer quickly.`,
        `Skipping explanation entirely.`,
      ],
      explanation: `Mastery means the learner can use the concept, not only recognize it.`,
    },
  ];

  const bank = /cloud/.test(normalizedTopic) ? cloudQuestions : genericQuestions;

  return Array.from({ length: questionCount }, (_, index) => {
    const item = bank[index % bank.length];
    return {
      id: index + 1,
      type: 'mcq',
      question: item.question,
      options: item.options,
      answer: item.answer,
      explanation: item.explanation,
    };
  });
}

function createFallbackExam(context, input) {
  const courseTitle = input.course?.title || context.course?.title || 'General Studies';
  const subject = safeString(input.topic, courseTitle);
  const baseTopic = subject || courseTitle;
  const questionCount = Math.max(1, Math.min(20, Number(input.count) || 3));
  const questions = createTopicAwareExamQuestions(baseTopic, questionCount);

  return {
    responseType: 'exam',
    title: `Multiple-choice exam on ${baseTopic}`,
    subject: baseTopic,
    level: 'medium',
    instructions: 'Answer each question carefully. For MCQ items, choose the single best option and review the explanation after completion.',
    durationMinutes: Math.max(20, questionCount * 4),
    questions,
    answerKey: questions.map((question) => ({
      id: question.id,
      answer: question.answer,
      explanation: question.explanation,
    })),
    nextActions: [
      'Complete all questions before checking the answer key.',
      'Review the explanations for any item you missed.',
      'Ask for a corrected version if you want a harder exam next.',
    ],
    followUpQuestion: 'Would you like a corrected version or a harder exam on the same topic?',
    confidence: 'high',
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
      return Array.isArray(payload.exercises) && payload.exercises.length > 0;
    case AI_TYPES.prioritizeTasks:
      return Array.isArray(payload.ranking);
    case AI_TYPES.revisionPlan:
      return Array.isArray(payload.topicBreakdown) && Array.isArray(payload.plan);
    case AI_TYPES.chat:
      return typeof payload.reply === 'string'
        || CHAT_RESPONSE_TYPES.has(safeString(payload.responseType).toLowerCase())
        || isPlainObject(payload.exam)
        || isPlainObject(payload.summary)
        || isPlainObject(payload.exercises)
        || isPlainObject(payload.flashcards)
        || isPlainObject(payload.revisionPlan)
        || isPlainObject(payload.prioritizedTasks)
        || isPlainObject(payload.dailyPlan);
    case AI_TYPES.scheduleBuilderChat:
      return typeof payload.reply === 'string'
        || typeof payload.followUpQuestion === 'string'
        || payload.readyToGenerate === true;
    case AI_TYPES.scheduleBuilderGenerate:
      return Array.isArray(payload.events) && payload.events.length > 0
        || Array.isArray(payload.generatedSchedule) && payload.generatedSchedule.length > 0
        || Array.isArray(payload.schedule) && payload.schedule.length > 0
        || isPlainObject(payload.metadata);
    case AI_TYPES.dashboardRecommendations:
      return Array.isArray(payload.recommendations);
    default:
      return true;
  }
}

function isMeaningfulExerciseText(value) {
  const text = safeString(value);
  if (!text) return false;
  if (/^(exercise|question)\s*\d*$/i.test(text)) return false;
  return true;
}

function isMeaningfulExercisesPayload(payload, input = {}) {
  const desiredCount = Math.max(1, Math.min(20, Number(input.count) || 5));
  const exercises = safeArray(payload?.exercises);
  if (exercises.length < desiredCount) return false;
  return exercises.every((item) => isMeaningfulExerciseText(item?.question) && safeString(item?.answer));
}

function isMeaningfulExamPayload(payload, input = {}) {
  const requestedCount = Math.max(1, Math.min(20, Number(input.count) || 3));
  const questions = safeArray(payload?.questions);
  if (!questions.length) return false;
  if (questions.length < requestedCount) return false;
  const answerKey = safeArray(payload?.answerKey);

  const allQuestionsValid = questions.every((item, index) => {
    const questionText = safeString(item?.question);
    const answerText = safeString(item?.answer, safeString(answerKey[index]?.answer, safeString(item?.correctAnswer)));
    const type = safeString(item?.type, 'open').toLowerCase();
    const optionCount = safeArray(item?.options).filter((option) => typeof option === 'string' && option.trim()).length;

    if (!questionText || /^(question|exercise)\s*\d*$/i.test(questionText)) return false;
    if (!answerText) return false;
    if (type === 'mcq' && optionCount < 4) return false;
    return true;
  });

  return allQuestionsValid && answerKey.length >= requestedCount;
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
  const desiredCount = Math.max(1, Math.min(20, Number(input.count) || Number(context.count) || 5));
  const exercises = safeArray(payload?.exercises).map((item, index) => ({
    id: pickNumber(item?.id, index + 1),
    question: pickString(item?.question),
    type: ['open', 'mcq', 'coding'].includes(item?.type) ? item.type : 'open',
    options: normalizeStringArray(item?.options).slice(0, 6),
    answer: pickString(item?.answer),
    explanation: pickString(item?.explanation),
    hint: pickString(item?.hint),
    language: pickString(item?.language),
  }));

  while (exercises.length < desiredCount) {
    const nextIndex = exercises.length + 1;
    exercises.push({
      id: nextIndex,
      question: `Explain one important idea related to ${pickString(input.topic, context.course?.title, 'the topic')}.`,
      type: 'open',
      options: [],
      answer: `A correct answer should show understanding of ${pickString(input.topic, context.course?.title, 'the topic')}.`,
      explanation: `This checks understanding of the requested topic.`,
      hint: `Recall the main concept and one example.`,
      language: '',
    });
  }

  return {
    courseTitle: pickString(payload?.courseTitle, input.course?.title, context.course?.title, 'General Studies'),
    topic: pickString(payload?.topic, input.topic, 'General'),
    difficulty: ['easy', 'medium', 'hard'].includes(payload?.difficulty) ? payload.difficulty : pickString(input.difficulty, 'medium'),
    count: desiredCount,
    exercises: exercises.slice(0, desiredCount),
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

function normalizeExamQuestion(item, answerKeyItem = null) {
  const type = safeString(item?.type, 'open').toLowerCase();
  const normalizedType = ['mcq', 'open', 'short_answer', 'true_false'].includes(type) ? type : 'open';
  const options = normalizeStringArray(item?.options).slice(0, 6);

  return {
    id: Number.isFinite(Number(item?.id)) ? Number(item.id) : item?.id ?? null,
    type: normalizedType,
    question: pickString(item?.question),
    options: normalizedType === 'mcq' ? options : [],
    answer: pickString(item?.answer, item?.correctAnswer, answerKeyItem?.answer),
    explanation: pickString(item?.explanation, answerKeyItem?.explanation),
  };
}

function normalizeExamResponse(payload, context, input) {
  const answerKey = safeArray(payload?.answerKey).map((item, index) => ({
    id: Number.isFinite(Number(item?.id)) ? Number(item.id) : item?.id ?? index + 1,
    answer: pickString(item?.answer, item?.correctAnswer, 'Answer pending'),
    explanation: pickString(item?.explanation, 'Review the concept carefully.'),
  }));
  const questions = safeArray(payload?.questions).map((item, index) => normalizeExamQuestion(item, answerKey[index] || null)).filter(Boolean);
  const fallback = createFallbackExam(context, input);

  return {
    title: pickString(payload?.title, fallback.title),
    subject: pickString(payload?.subject, fallback.subject),
    level: ['easy', 'medium', 'hard'].includes(safeString(payload?.level).toLowerCase()) ? safeString(payload?.level).toLowerCase() : fallback.level,
    instructions: pickString(payload?.instructions, fallback.instructions),
    durationMinutes: Math.max(10, Math.min(180, Number(payload?.durationMinutes) || fallback.durationMinutes)),
    questions: questions.length ? questions : fallback.questions,
    answerKey: answerKey.length ? answerKey : fallback.answerKey,
    nextActions: normalizeStringArray(payload?.nextActions).slice(0, 5).length
      ? normalizeStringArray(payload?.nextActions).slice(0, 5)
      : fallback.nextActions,
    followUpQuestion: pickString(payload?.followUpQuestion, fallback.followUpQuestion),
    confidence: pickString(payload?.confidence, 'high'),
    responseType: 'exam',
  };
}

function normalizeSummaryPayload(payload, context, input) {
  return {
    title: pickString(payload?.title, input.file?.originalName, context.course?.title, 'Study Material'),
    summary: pickString(payload?.summary, payload?.overview, 'Summary unavailable.'),
    keyPoints: normalizeStringArray(payload?.keyPoints).slice(0, 8),
    topics: normalizeStringArray(payload?.topics).slice(0, 8),
    studyTips: normalizeStringArray(payload?.studyTips).slice(0, 8),
    nextSteps: normalizeStringArray(payload?.nextSteps).slice(0, 8),
    wordCount: Number.isFinite(Number(payload?.wordCount)) ? Number(payload.wordCount) : null,
    readingTime: pickString(payload?.readingTime),
  };
}

function normalizeExercisesPayload(payload, context, input) {
  const desiredCount = Math.max(1, Math.min(20, Number(input.count) || Number(context.count) || 5));
  const exercises = safeArray(payload?.exercises).map((item, index) => ({
    id: pickNumber(item?.id, index + 1),
    question: pickString(item?.question),
    type: ['open', 'mcq', 'coding'].includes(safeString(item?.type)) ? safeString(item?.type) : 'open',
    options: normalizeStringArray(item?.options).slice(0, 6),
    answer: pickString(item?.answer),
    explanation: pickString(item?.explanation),
    hint: pickString(item?.hint),
    language: pickString(item?.language),
  }));

  return {
    courseTitle: pickString(payload?.courseTitle, input.course?.title, context.course?.title, 'General Studies'),
    topic: pickString(payload?.topic, input.topic, 'General'),
    difficulty: ['easy', 'medium', 'hard'].includes(safeString(payload?.difficulty)) ? safeString(payload?.difficulty) : pickString(input.difficulty, 'medium'),
    count: desiredCount,
    exercises: exercises.length ? exercises.slice(0, desiredCount) : normalizeExercisesPayload(createFallbackExercises(context, input), context, input).exercises,
  };
}

function normalizeFlashcardsPayload(payload, context, input) {
  const cards = safeArray(payload?.cards || payload?.flashcards).map((item, index) => ({
    id: pickNumber(item?.id, index + 1),
    front: pickString(item?.front, item?.question),
    back: pickString(item?.back, item?.answer),
    hint: pickString(item?.hint),
  })).filter((card) => card.front || card.back);

  return {
    topic: pickString(payload?.topic, input.topic, input.course?.title, context.course?.title, 'Study topic'),
    title: pickString(payload?.title, `Flashcards for ${pickString(payload?.topic, input.topic, context.course?.title, 'the topic')}`),
    cards,
    reviewTips: normalizeStringArray(payload?.reviewTips || payload?.tips).slice(0, 6),
  };
}

function normalizeRevisionPlanPayload(payload, context, input) {
  return {
    title: pickString(payload?.title, input.exam?.title, input.course?.title, 'Revision plan'),
    summary: pickString(payload?.summary, 'Revision plan generated from your study context.'),
    topicBreakdown: safeArray(payload?.topicBreakdown).map((item) => ({
      topic: pickString(item?.topic, 'Topic'),
      priority: ['high', 'medium', 'low'].includes(safeString(item?.priority)) ? safeString(item?.priority) : 'medium',
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

function normalizePrioritizedTasksPayload(payload, context) {
  return {
    summary: pickString(payload?.summary, 'Tasks ranked by urgency and deadline.'),
    ranking: safeArray(payload?.ranking).map((item, index) => ({
      taskId: pickString(item?.taskId, item?.id, context.tasks[index]?.id),
      title: pickString(item?.title, context.tasks[index]?.title, 'Task'),
      score: pickNumber(item?.score, Math.max(0, 100 - index * 10)),
      reason: pickString(item?.reason, 'Prioritized from study context.'),
      suggestedAction: pickString(item?.suggestedAction, 'Start this task soon.'),
    })),
    focusTips: normalizeStringArray(payload?.focusTips),
  };
}

function normalizeChat(payload, context, input) {
  const hintedType = sanitizeResponseType(payload?.responseType, 'chat');
  const responseType = hintedType !== 'chat'
    ? hintedType
    : isPlainObject(payload?.exam)
      ? 'exam'
      : isPlainObject(payload?.summary)
        ? 'summary'
        : isPlainObject(payload?.exercises)
          ? 'exercises'
          : isPlainObject(payload?.flashcards)
            ? 'flashcards'
            : isPlainObject(payload?.revisionPlan)
              ? 'revision_plan'
              : isPlainObject(payload?.prioritizedTasks)
                ? 'prioritize_tasks'
                : isPlainObject(payload?.dailyPlan)
                  ? 'daily_plan'
                  : 'chat';
  const examData = responseType === 'exam' ? normalizeExamResponse(payload?.exam || payload, context, input) : null;
  const summaryData = responseType === 'summary' ? normalizeSummaryPayload(payload?.summary || payload, context, input) : null;
  const exercisesData = responseType === 'exercises' ? normalizeExercisesPayload(payload?.exercises || payload, context, input) : null;
  const flashcardsData = responseType === 'flashcards' ? normalizeFlashcardsPayload(payload?.flashcards || payload, context, input) : null;
  const revisionPlanData = responseType === 'revision_plan' ? normalizeRevisionPlanPayload(payload?.revisionPlan || payload, context, input) : null;
  const prioritizedTasksData = responseType === 'prioritize_tasks' ? normalizePrioritizedTasksPayload(payload?.prioritizedTasks || payload, context, input) : null;
  const dailyPlanData = responseType === 'daily_plan' ? normalizeDailyPlan(payload?.dailyPlan || payload, context, input) : null;

  const inferredTopic = pickString(
    payload?.topic,
    input.course?.title,
    input.file?.originalName,
    context.course?.title,
    context.file?.originalName,
    responseType === 'exam' ? examData?.subject : ''
  );

  return {
    reply: responseType === 'exam'
      ? pickString(
          payload?.reply,
          examData?.instructions,
          examData?.title ? `I created ${examData.title}.` : '',
          'I created an exam for you.'
        )
      : responseType === 'summary'
        ? pickString(payload?.reply, summaryData?.summary, summaryData?.title ? `I created ${summaryData.title}.` : '')
        : responseType === 'exercises'
          ? pickString(payload?.reply, exercisesData?.exercises?.[0]?.question, 'I created practice exercises for you.')
          : responseType === 'flashcards'
            ? pickString(payload?.reply, flashcardsData?.cards?.[0]?.front, 'I created a flashcard deck for you.')
            : responseType === 'revision_plan'
              ? pickString(payload?.reply, revisionPlanData?.summary, revisionPlanData?.title ? `I created ${revisionPlanData.title}.` : '')
              : responseType === 'prioritize_tasks'
                ? pickString(payload?.reply, prioritizedTasksData?.summary, 'I ranked your tasks.')
                : responseType === 'daily_plan'
                  ? pickString(payload?.reply, dailyPlanData?.overview, 'I created a study plan for today.')
      : pickString(payload?.reply, payload?.text, 'I can help you study this topic.'),
    nextActions: normalizeStringArray(payload?.nextActions).slice(0, 5),
    followUpQuestion: responseType === 'exam'
      ? pickString(payload?.followUpQuestion, examData?.followUpQuestion, 'Would you like a harder version or a correction sheet?')
      : responseType === 'summary'
        ? pickString(payload?.followUpQuestion, 'Would you like a shorter summary, flashcards, or practice questions?')
        : responseType === 'exercises'
          ? pickString(payload?.followUpQuestion, 'Would you like a harder set or an answer review?')
          : responseType === 'flashcards'
            ? pickString(payload?.followUpQuestion, 'Would you like spaced-repetition questions next?')
            : responseType === 'revision_plan'
              ? pickString(payload?.followUpQuestion, 'Would you like this roadmap turned into a calendar plan?')
              : responseType === 'prioritize_tasks'
                ? pickString(payload?.followUpQuestion, 'Would you like these priorities turned into a study schedule?')
                : responseType === 'daily_plan'
                  ? pickString(payload?.followUpQuestion, 'Would you like a version with longer focus blocks?')
                  : pickString(payload?.followUpQuestion, 'What should we work on next?'),
    tone: pickString(payload?.tone, context.user?.studyPreferences?.aiAssistantTone, 'friendly'),
    topic: inferredTopic,
    confidence: pickString(payload?.confidence, 'high'),
    responseType,
    exam: examData,
    summary: summaryData,
    exercises: exercisesData,
    flashcards: flashcardsData,
    revisionPlan: revisionPlanData,
    prioritizedTasks: prioritizedTasksData,
    dailyPlan: dailyPlanData,
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

function mapAiConversationHistory(requests = []) {
  const messages = [];

  for (const request of requests) {
    const userMessage = pickString(request?.originalUserMessage, request?.prompt);
    const assistantMessage = pickString(request?.assistantMessage, request?.response);

    if (userMessage) {
      messages.push({
        role: 'user',
        content: userMessage,
        type: request?.type || 'schedule_builder_chat',
      });
    }

    if (assistantMessage) {
      messages.push({
        role: 'assistant',
        content: assistantMessage,
        type: request?.type || 'schedule_builder_chat',
      });
    }
  }

  return messages.slice(-20);
}

const SCHEDULE_BUILDER_TYPES = [AI_TYPES.scheduleBuilderChat, AI_TYPES.scheduleBuilderGenerate];

function parseScheduleBound(value, fallback) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function clampDateToRange(value, minValue, maxValue) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const minTime = new Date(minValue).getTime();
  const maxTime = new Date(maxValue).getTime();
  const time = Math.min(Math.max(date.getTime(), minTime), maxTime);
  return new Date(time);
}

function formatValidationIssues(issues = []) {
  return issues.map((issue) => {
    const path = issue.path || 'payload';
    return `${path}: ${issue.message}`;
  }).join('; ');
}

function resolveScheduleWeekBounds(input = {}) {
  const base = input.date ? new Date(input.date) : new Date();

  if (input.weekStart || input.weekEnd) {
    const fallbackBounds = getWeekBounds(base);
    return {
      start: parseScheduleBound(input.weekStart, fallbackBounds.start),
      end: parseScheduleBound(input.weekEnd, fallbackBounds.end),
    };
  }

  return getWeekBounds(base);
}

const scheduleGenerationEventSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(''),
  category: z.enum(['class', 'study', 'exam', 'task', 'break', 'personal', 'work', 'appointment']),
  start: z.string().min(1),
  end: z.string().min(1),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  flexibility: z.enum(['fixed', 'flexible']).default('flexible'),
  reason: z.string().min(1),
}).superRefine((event, ctx) => {
  const start = toValidScheduleDate(event.start);
  const end = toValidScheduleDate(event.end);

  if (!start) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['start'],
      message: 'start must be a valid ISO datetime string.',
    });
  }

  if (!end) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['end'],
      message: 'end must be a valid ISO datetime string.',
    });
  }

  if (start && end && end.getTime() <= start.getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['end'],
      message: 'end must be later than start.',
    });
  }
});

const scheduleGenerationOutputSchema = z.object({
  type: z.literal('schedule_generation'),
  metadata: z.object({
    title: z.string().min(1),
    weekStart: z.string().min(1),
    weekEnd: z.string().min(1),
    timezone: z.string().min(1),
    language: z.string().min(1),
  }),
  summary: z.string().min(1),
  events: z.array(scheduleGenerationEventSchema),
  recommendations: z.array(z.string().min(1)).default([]),
  warnings: z.array(z.string().min(1)).default([]),
  conflicts: z.array(z.string().min(1)).default([]),
}).superRefine((value, ctx) => {
  const weekStart = toValidScheduleDate(value.metadata.weekStart);
  const weekEnd = toValidScheduleDate(value.metadata.weekEnd);

  if (!weekStart) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['metadata', 'weekStart'],
      message: 'metadata.weekStart must be a valid ISO datetime string.',
    });
  }

  if (!weekEnd) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['metadata', 'weekEnd'],
      message: 'metadata.weekEnd must be a valid ISO datetime string.',
    });
  }

  if (weekStart && weekEnd && weekEnd.getTime() <= weekStart.getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['metadata', 'weekEnd'],
      message: 'metadata.weekEnd must be later than metadata.weekStart.',
    });
  }

  if (weekStart && weekEnd) {
    value.events.forEach((event, index) => {
      const eventStart = toValidScheduleDate(event.start);
      const eventEnd = toValidScheduleDate(event.end);

      if (eventStart && eventStart.getTime() < weekStart.getTime()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['events', index, 'start'],
          message: 'Event start must fall within the selected week.',
        });
      }

      if (eventEnd && eventEnd.getTime() > weekEnd.getTime()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['events', index, 'end'],
          message: 'Event end must fall within the selected week.',
        });
      }

      if (eventStart && eventEnd && eventEnd.getTime() <= eventStart.getTime()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['events', index, 'end'],
          message: 'Event end must be later than event start.',
        });
      }
    });
  }
});

function normalizeScheduleBuilderChat(payload, context) {
  const readyToGenerate = Boolean(payload?.readyToGenerate || safeString(payload?.conversationStage).toLowerCase() === 'ready');
  const reply = pickString(payload?.reply, readyToGenerate
    ? 'I have enough context to build the schedule when you are ready.'
    : 'Tell me a bit more about your week so I can plan it well.');

  return {
    reply,
    followUpQuestion: pickString(payload?.followUpQuestion, readyToGenerate ? '' : 'What are your fixed commitments and study priorities?'),
    readyToGenerate,
    conversationStage: readyToGenerate ? 'ready' : 'gathering',
    nextActions: normalizeStringArray(payload?.nextActions).slice(0, 5),
    missingInformation: normalizeStringArray(payload?.missingInformation).slice(0, 5),
    summary: pickString(payload?.summary, readyToGenerate ? 'Enough information collected to generate a weekly schedule.' : 'More context is needed before generating the schedule.'),
    confidence: pickString(payload?.confidence, 'high'),
    topic: pickString(payload?.topic, context.course?.title || 'Schedule planning'),
  };
}

function normalizeScheduleGenerationPayload(payload, context) {
  const parsed = isPlainObject(payload) ? payload : safeJsonParse(safeString(payload?.text)) || {};
  const raw = isPlainObject(parsed) ? parsed : {};
  logAiEvent('info', 'Parsed Gemini schedule generation payload', {
    type: safeString(raw.type || raw?.metadata?.type || 'schedule_generation'),
    keys: Object.keys(raw || {}),
    rawPreview: truncateForLog(raw, 12000),
  });
  const candidate = {
    type: 'schedule_generation',
    metadata: {
      title: pickString(raw?.metadata?.title, 'Weekly schedule'),
      weekStart: pickString(raw?.metadata?.weekStart, context.week?.start || new Date().toISOString()),
      weekEnd: pickString(raw?.metadata?.weekEnd, context.week?.end || new Date().toISOString()),
      timezone: pickString(raw?.metadata?.timezone, context.timezone || 'UTC'),
      language: pickString(raw?.metadata?.language, context.language || 'en'),
    },
    summary: isPlainObject(raw?.summary)
      ? pickString(raw.summary.overview, raw.summary.title, 'Weekly schedule')
      : pickString(raw?.summary, 'Weekly schedule'),
    events: safeArray(raw?.events || raw?.generatedSchedule || raw?.scheduleGeneration || raw?.schedule).map((item, index) => {
      const startRaw = toIsoDate(item?.start) || toIsoDate(item?.startDateTime) || null;
      const endRaw = toIsoDate(item?.end) || toIsoDate(item?.endDateTime) || null;
      const weekStart = context.week?.start || new Date().toISOString();
      const weekEnd = context.week?.end || new Date().toISOString();
      const clampedStart = startRaw ? clampDateToRange(startRaw, weekStart, weekEnd) : null;
      const clampedEnd = endRaw ? clampDateToRange(endRaw, weekStart, weekEnd) : null;
      const categoryAlias = {
        class: 'course',
        course: 'course',
        study: 'study_session',
        study_session: 'study_session',
        exam: 'exam',
        task: 'task',
        break: 'break',
        personal: 'personal',
        work: 'other',
        appointment: 'other',
        other: 'other',
      };
      const category = safeString(item?.category).toLowerCase();
      return {
        title: pickString(item?.title, `Schedule block ${index + 1}`),
        description: pickString(item?.description),
        category: ['class', 'study', 'exam', 'task', 'break', 'personal', 'work', 'appointment'].includes(category)
          ? category
          : 'study',
        start: clampedStart ? clampedStart.toISOString() : pickString(item?.start, item?.startDateTime),
        end: clampedEnd ? clampedEnd.toISOString() : pickString(item?.end, item?.endDateTime),
        priority: ['low', 'medium', 'high'].includes(safeString(item?.priority)) ? safeString(item?.priority) : 'medium',
        flexibility: ['fixed', 'flexible'].includes(safeString(item?.flexibility)) ? safeString(item?.flexibility) : 'flexible',
        reason: pickString(item?.reason, 'Selected by Gemini based on the current scheduling context.'),
        _mappedCategory: categoryAlias[category] || 'study_session',
      };
    }),
    recommendations: normalizeStringArray(raw?.recommendations || raw?.suggestions || raw?.nextActions).slice(0, 10),
    warnings: normalizeStringArray(raw?.warnings || raw?.notes).slice(0, 10),
    conflicts: normalizeStringArray(raw?.conflicts || raw?.issues).slice(0, 10),
  };

  const parsedCandidate = scheduleGenerationOutputSchema.safeParse(candidate);

  if (!parsedCandidate.success) {
    const issues = parsedCandidate.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    }));
    logAiEvent('error', 'Gemini schedule generation payload validation failed', {
      type: safeString(raw.type || raw?.metadata?.type || 'schedule_generation'),
      issues,
      rawKeys: Object.keys(raw || {}),
      rawPreview: truncateForLog(raw, 12000),
      parsedPreview: truncateForLog(candidate, 12000),
    });
    const message = isDevelopment()
      ? `Gemini returned an invalid schedule generation payload: ${formatValidationIssues(issues)}`
      : 'Gemini returned an invalid schedule generation payload.';
    const error = new ApiError(502, message, {
      details: {
        issues,
        rawKeys: Object.keys(raw || {}),
        parsedPreview: candidate,
      },
    });
    error.validationIssues = issues;
    error.rawPayload = raw;
    throw error;
  }

  const normalized = parsedCandidate.data;
  const events = candidate.events
    .map((item) => {
      const start = toIsoDate(item.start);
      const end = toIsoDate(item.end);

      if (!start || !end) {
        return null;
      }

      return {
        title: item.title,
        description: item.description,
        category: item.category,
        start,
        end,
        priority: item.priority,
        flexibility: item.flexibility,
        reason: item.reason,
        mappedCategory: mapScheduleGenerationCategoryToEventType(item.category),
        startDateTime: start,
        endDateTime: end,
        courseId: '',
        taskId: '',
        examId: '',
      };
    })
    .filter(Boolean)
    .filter((item) => new Date(item.end).getTime() > new Date(item.start).getTime());

  if (!events.length) {
    const issues = [
      {
        path: 'events',
        message: 'No valid events could be normalized from the Gemini response.',
      },
    ];
    logAiEvent('error', 'Gemini schedule generation payload normalized to zero valid events', {
      rawKeys: Object.keys(raw || {}),
      issues,
      rawPreview: truncateForLog(raw, 12000),
      parsedPreview: truncateForLog(normalized, 12000),
    });
    const error = new ApiError(502, isDevelopment()
      ? `Gemini returned no usable schedule events after normalization. Parsed payload keys: ${Object.keys(normalized || {}).join(', ')}`
      : 'Gemini returned no usable schedule events.', {
      details: {
        issues,
        parsedPreview: normalized,
      },
    });
    error.rawPayload = raw;
    throw error;
  }

  return {
    type: normalized.type,
    metadata: normalized.metadata,
    summary: normalized.summary,
    events,
    recommendations: normalized.recommendations,
    warnings: normalized.warnings,
    conflicts: normalized.conflicts,
  };
}

function buildScheduleBuilderContext(baseContext, extra = {}) {
  const preferredLanguage = baseContext.userPreference?.language || baseContext.studyPreferences?.language || 'English (US)';
  const timezone = baseContext.userPreference?.timezone || 'UTC';
  const currentDate = extra.currentDate || new Date().toISOString();
  const weekStart = extra.weekStart || new Date(currentDate);
  const weekEnd = extra.weekEnd || new Date(new Date(currentDate).getTime() + 6 * 86400000);
  const recentSchedule = safeArray(extra.recentSchedule).length ? safeArray(extra.recentSchedule) : safeArray(baseContext.schedule);
  const trimmedBaseContext = {
    ...baseContext,
    courses: safeArray(baseContext.courses).slice(0, 6),
    tasks: safeArray(baseContext.tasks).slice(0, 8),
    exams: safeArray(baseContext.exams).slice(0, 6),
    files: safeArray(baseContext.files).slice(0, 4),
    schedule: recentSchedule.slice(0, 12),
  };

  return toAiContextSnapshot(trimmedBaseContext, {
    currentDate,
    timezone,
    language: preferredLanguage,
    week: {
      start: new Date(weekStart).toISOString(),
      end: new Date(weekEnd).toISOString(),
    },
    eventCategories: ['course', 'td', 'tp', 'exam', 'study_session', 'task', 'break', 'personal', 'other'],
    conversationHistory: safeArray(extra.conversationHistory).slice(0, 10),
    recentSchedule: recentSchedule.slice(0, 20),
    busyPeriods: safeArray(extra.busyPeriods).slice(0, 12),
    freePeriods: safeArray(extra.freePeriods).slice(0, 12),
    generatedSchedule: safeArray(extra.generatedSchedule),
    conversationId: safeString(extra.conversationId),
  });
}

function mapScheduleEventForBuilder(event) {
  const course = typeof event?.courseId === 'object' && event.courseId?.title
    ? {
        id: String(event.courseId._id || event.courseId.id || ''),
        title: event.courseId.title,
      }
    : null;

  return {
    id: String(event?._id || event?.id || ''),
    title: pickString(event?.title, 'Untitled event'),
    description: pickString(event?.description),
    category: pickString(event?.type, 'other'),
    startDateTime: safeString(event?.start ? new Date(event.start).toISOString() : ''),
    endDateTime: safeString(event?.end ? new Date(event.end).toISOString() : ''),
    location: pickString(event?.location),
    aiSuggested: Boolean(event?.aiSuggested),
    status: pickString(event?.status, 'scheduled'),
    course,
  };
}

function buildFreePeriods(busyPeriods, weekStart, weekEnd) {
  const dayStartHour = 8;
  const dayEndHour = 21;
  const dayMs = 24 * 60 * 60 * 1000;
  const periods = [];
  const startDate = new Date(weekStart);

  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    const dayBase = new Date(startDate.getTime() + dayIndex * dayMs);
    const dayStart = new Date(dayBase);
    dayStart.setHours(dayStartHour, 0, 0, 0);
    const dayEnd = new Date(dayBase);
    dayEnd.setHours(dayEndHour, 0, 0, 0);

    const dayBusy = busyPeriods
      .filter((period) => {
        const periodStart = new Date(period.startDateTime);
        return periodStart.toDateString() === dayStart.toDateString();
      })
      .sort((a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime());

    let cursor = new Date(dayStart);

    for (const period of dayBusy) {
      const periodStart = new Date(period.startDateTime);
      const periodEnd = new Date(period.endDateTime);
      if (periodStart > cursor) {
        periods.push({
          dayIndex,
          startDateTime: cursor.toISOString(),
          endDateTime: periodStart.toISOString(),
        });
      }

      if (periodEnd > cursor) {
        cursor = new Date(periodEnd);
      }
    }

    if (cursor < dayEnd) {
      periods.push({
        dayIndex,
        startDateTime: cursor.toISOString(),
        endDateTime: dayEnd.toISOString(),
      });
    }
  }

  return periods.filter((period) => new Date(period.endDateTime) > new Date(period.startDateTime));
}

function getScheduleColor(category) {
  const map = {
    course: '#3b82f6',
    td: '#0ea5e9',
    tp: '#06b6d4',
    exam: '#8b5cf6',
    study_session: '#10b981',
    task: '#f97316',
    break: '#94a3b8',
    personal: '#ec4899',
    other: '#64748b',
  };

  return map[safeString(category)] || map.other;
}

function mapScheduleGenerationCategoryToEventType(category) {
  const value = safeString(category).toLowerCase();
  const mapping = {
    class: 'course',
    course: 'course',
    study: 'study_session',
    study_session: 'study_session',
    exam: 'exam',
    task: 'task',
    break: 'break',
    personal: 'personal',
    work: 'other',
    appointment: 'other',
    other: 'other',
  };

  return mapping[value] || 'study_session';
}

function toValidScheduleDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildScheduleEventCreatePayload(item, userId) {
  const start = toValidScheduleDate(item?.startDateTime);
  const end = toValidScheduleDate(item?.endDateTime);

  if (!start || !end || end <= start) {
    return null;
  }

  const courseId = /^[a-f\d]{24}$/i.test(safeString(item?.courseId)) ? safeString(item?.courseId) : undefined;
  const taskId = /^[a-f\d]{24}$/i.test(safeString(item?.taskId)) ? safeString(item?.taskId) : undefined;
  const examId = /^[a-f\d]{24}$/i.test(safeString(item?.examId)) ? safeString(item?.examId) : undefined;
  const recurrence = isPlainObject(item?.recurrence)
    ? {
        enabled: Boolean(item.recurrence.enabled),
        frequency: ['daily', 'weekly', 'monthly', 'none'].includes(safeString(item.recurrence.frequency))
          ? safeString(item.recurrence.frequency)
          : 'none',
        daysOfWeek: normalizeStringArray(item.recurrence.daysOfWeek),
        until: item.recurrence.until ? toValidScheduleDate(item.recurrence.until) || undefined : undefined,
      }
    : undefined;

  return {
    userId,
    courseId,
    taskId,
    examId,
    title: pickString(item?.title, 'Study block'),
    description: pickString(item?.description),
    type: mapScheduleGenerationCategoryToEventType(item?.mappedCategory || item?.category),
    start,
    end,
    location: pickString(item?.location),
    color: getScheduleColor(item?.mappedCategory || item?.category),
    recurrence: recurrence && (recurrence.enabled || recurrence.frequency !== 'none' || recurrence.daysOfWeek.length || recurrence.until)
      ? recurrence
      : undefined,
    aiSuggested: true,
    status: 'scheduled',
  };
}

async function loadScheduleBuilderConversation(req, conversationId) {
  const query = {
    userId: req.user._id,
    type: { $in: SCHEDULE_BUILDER_TYPES },
  };

  if (conversationId) {
    query.conversationId = conversationId;
  }

  const requests = await AIRequest.find(query)
    .sort({ createdAt: 1 })
    .limit(100)
    .lean();

  return requests;
}

async function reserveTokens(userId, cost, label) {
  const updated = await User.findOneAndUpdate(
    { _id: userId, tokenBalance: { $gte: cost } },
    { $inc: { tokenBalance: -cost } },
    { returnDocument: 'after' }
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

async function createAiRequest({
  userId,
  type,
  prompt,
  originalUserMessage,
  assistantMessage,
  suggestedActions,
  followUpQuestions,
  tokenCost,
  conversationId,
  conversationTitle,
  metadata,
  model,
  courseId,
  fileId,
  taskId,
  examId,
}) {
  return AIRequest.create({
    userId,
    courseId: courseId || undefined,
    fileId: fileId || undefined,
    taskId: taskId || undefined,
    examId: examId || undefined,
    conversationId: conversationId || undefined,
    conversationTitle: conversationTitle || undefined,
    type,
    prompt,
    originalUserMessage: originalUserMessage || undefined,
    assistantMessage: assistantMessage || undefined,
    suggestedActions: Array.isArray(suggestedActions) ? suggestedActions : undefined,
    followUpQuestions: Array.isArray(followUpQuestions) ? followUpQuestions : undefined,
    tokenCost: Number.isFinite(tokenCost) ? tokenCost : 0,
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
  payloadValidator = null,
  allowFallback = true,
  courseId,
  fileId,
  taskId,
  examId,
  conversationId,
  conversationTitle,
  maxOutputTokens = 2048,
}) {
  const gemini = getGeminiService();
  let reservation = null;
  let aiRequest = null;
  const prompt = promptPackage.userPrompt;
  const originalUserMessage = safeString(metadata?.originalUserMessage, safeString(req.body?.message));
  const historyPrompt = safeString(metadata?.originalUserMessage, safeString(promptPackage.historyPrompt, label));
  const retryPrompt = type === AI_TYPES.scheduleBuilderGenerate
    ? `${prompt}\n\nAdditional instruction: regenerate from scratch as a compact weekly schedule with 4 to 16 meaningful events only. Do not generate daily routines, wake-up blocks, sleep blocks, or filler blocks. Keep descriptions short and ensure the JSON closes completely.`
    : `${prompt}\n\nAdditional instruction: regenerate from scratch. Every required field must be filled with real, topic-specific content. Do not use placeholder text like "Question", "Exercise", or blank strings.`;
  const timeoutMs = type === AI_TYPES.scheduleBuilderGenerate
    ? 60000
    : type === AI_TYPES.scheduleBuilderChat
      ? 45000
      : 30000;
  const temperature = type === AI_TYPES.scheduleBuilderGenerate
    ? 0.1
    : type === AI_TYPES.scheduleBuilderChat
      ? 0.15
      : undefined;
  const thinkingConfig = [AI_TYPES.scheduleBuilderChat, AI_TYPES.scheduleBuilderGenerate].includes(type)
    ? { thinkingBudget: 0, includeThoughts: false }
    : undefined;
  const startedAt = Date.now();

  try {
    reservation = await reserveTokens(req.user._id, cost, label);
    aiRequest = await createAiRequest({
      userId: req.user._id,
      type,
      prompt: historyPrompt,
      originalUserMessage,
      metadata: {
        ...metadata,
        historyPrompt: safeString(promptPackage.historyPrompt, label),
      },
      model: gemini.modelName,
      courseId,
      fileId,
      taskId,
      examId,
      conversationId,
      conversationTitle,
    });

    const baseRequestLog = {
      userId: String(req.user._id),
      type,
      label,
      requestId: String(aiRequest._id),
      conversationId,
      conversationTitle,
      model: gemini.modelName,
      cost,
      ...getPromptStats(promptPackage, prompt),
      contextSummary: summarizeScheduleContextForLog(context),
    };

    logAiEvent('info', `Gemini request started for ${label}`, {
      ...baseRequestLog,
      prompt: truncateForLog(prompt, 12000),
      systemInstruction: truncateForLog(promptPackage.systemInstruction || getBaseSystemInstruction(), 4000),
      responseSchema: truncateForLog(promptPackage.responseSchema, 12000),
    });

    const requestOptions = {
      systemInstruction: promptPackage.systemInstruction || getBaseSystemInstruction(),
      maxOutputTokens,
      responseSchema: promptPackage.responseSchema,
      temperature,
      timeoutMs,
      thinkingConfig,
      onRequest: (details) => logAiEvent('info', `Gemini SDK request details for ${label}`, {
        ...baseRequestLog,
        ...details,
      }),
      onResponse: (details) => logAiEvent('info', `Gemini SDK response for ${label}`, {
        ...baseRequestLog,
        durationMs: details.durationMs,
        responseTextLength: details.responseTextLength,
        modelVersion: details.modelVersion,
        responseId: details.responseId,
        usageMetadata: details.usageMetadata,
        promptFeedback: details.promptFeedback,
        rawResponseText: truncateForLog(details.rawText, 12000),
      }),
      onParseError: (details) => logAiEvent('error', `Gemini response was not valid JSON for ${label}`, {
        ...baseRequestLog,
        durationMs: details.durationMs,
        responseTextLength: details.responseTextLength,
        rawResponseText: truncateForLog(details.rawText, 12000),
      }),
      onError: (error) => {
        const parsed = parseGeminiErrorPayload(error);
        logAiEvent('error', `Gemini SDK error for ${label}`, {
          ...baseRequestLog,
          status: parsed.status,
          code: parsed.code,
          message: parsed.message,
          errorName: error?.name,
          errorStack: truncateForLog(error?.stack || '', 12000),
        });
      },
    };

    const generateWithRetry = async (promptValue, options, phase) => {
      let lastError = null;

      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          if (attempt > 1) {
            logAiEvent('info', `Retrying Gemini ${phase} for ${label}`, {
              ...baseRequestLog,
              attempt,
              promptLength: safeString(promptValue).length,
            });
          }

          return await gemini.generateJson(promptValue, options);
        } catch (error) {
          lastError = error;
          if (attempt === 1 && isRetryableGeminiError(error)) {
            logAiEvent('info', `Transient Gemini error detected for ${label}; retrying once.`, {
              ...baseRequestLog,
              phase,
              status: getErrorStatus(error),
              message: safeString(error?.message),
            });
            await new Promise((resolve) => setTimeout(resolve, 750));
            continue;
          }

          throw error;
        }
      }

      throw lastError;
    };

    const rawResult = await generateWithRetry(prompt, requestOptions, 'initial request');

    let normalized = extractGeminiObject(rawResult);
    let usable = normalized && isUsablePayload(type, normalized) ? normalized : null;

    if (usable && typeof payloadValidator === 'function' && !payloadValidator(usable)) {
      usable = null;
    }

    if (!usable) {
      logAiEvent('info', `Gemini initial payload unusable for ${label}`, {
        ...baseRequestLog,
        normalizedType: typeof normalized,
        parsedKeys: isPlainObject(normalized) ? Object.keys(normalized) : [],
      });
      const retryResult = await generateWithRetry(retryPrompt, {
        ...requestOptions,
        temperature: 0.05,
      }, 'retry request');

      normalized = extractGeminiObject(retryResult);
      usable = normalized && isUsablePayload(type, normalized) ? normalized : null;

      if (usable && typeof payloadValidator === 'function' && !payloadValidator(usable)) {
        usable = null;
      }
    }

    if (!usable) {
      if (!allowFallback) {
        throw new ApiError(502, `Gemini returned an invalid ${label} payload.`);
      }

      usable = fallbackFactory();
    }

    const payload = dataMapper(usable, context);
    const historyResponse = JSON.stringify(payload);
    const assistantMessage = [AI_TYPES.chat, AI_TYPES.scheduleBuilderChat].includes(type)
      ? safeString(payload.reply, JSON.stringify(payload))
      : type === AI_TYPES.scheduleBuilderGenerate
        ? safeString(payload.summary, JSON.stringify(payload))
        : undefined;

    aiRequest.status = 'completed';
    aiRequest.response = historyResponse;
    aiRequest.originalUserMessage = originalUserMessage || aiRequest.originalUserMessage;
    aiRequest.assistantMessage = assistantMessage || aiRequest.assistantMessage;
    aiRequest.suggestedActions = [AI_TYPES.chat, AI_TYPES.scheduleBuilderChat].includes(type) ? safeArray(payload.nextActions).slice(0, 5) : aiRequest.suggestedActions;
    aiRequest.followUpQuestions = [AI_TYPES.chat, AI_TYPES.scheduleBuilderChat].includes(type) && payload.followUpQuestion
      ? [safeString(payload.followUpQuestion)]
      : aiRequest.followUpQuestions;
    aiRequest.tokenCost = cost;
    aiRequest.conversationId = conversationId || aiRequest.conversationId;
    aiRequest.conversationTitle = conversationTitle || aiRequest.conversationTitle;
    aiRequest.tokensUsed = cost;
    aiRequest.internalTokensCost = cost;
    aiRequest.metadata = {
      ...metadata,
      source: 'gemini',
      responseType: [AI_TYPES.chat, AI_TYPES.scheduleBuilderChat, AI_TYPES.scheduleBuilderGenerate].includes(type)
        ? payload.responseType || type
        : undefined,
    };
    await aiRequest.save();

    await chargeTokens(req.user._id, reservation, cost, aiRequest._id, label);

    logAiEvent('info', `Completed AI ${label} request`, {
      userId: String(req.user._id),
      requestId: String(aiRequest._id),
      cost,
      durationMs: Date.now() - startedAt,
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

    if (error instanceof GeminiConfigurationError) {
      logAiEvent('error', `Failed AI ${label} request`, {
        userId: String(req.user._id),
        requestId: aiRequest ? String(aiRequest._id) : null,
        errorName: error?.name,
        error: error?.message,
        stack: truncateForLog(error?.stack || '', 12000),
      });
      throw buildGeminiErrorResponse(error, error.message);
    }

    if (error instanceof ApiError || Number.isFinite(error?.statusCode)) {
      logAiEvent('error', `Failed AI ${label} request`, {
        userId: String(req.user._id),
        requestId: aiRequest ? String(aiRequest._id) : null,
        errorName: error?.name,
        status: error?.statusCode || error?.status || null,
        error: error?.message,
        stack: truncateForLog(error?.stack || '', 12000),
      });
      throw error;
    }

    const parsed = parseGeminiErrorPayload(error);
    logAiEvent('error', `Failed AI ${label} request`, {
      userId: String(req.user._id),
      requestId: aiRequest ? String(aiRequest._id) : null,
      errorName: error?.name,
      status: parsed.status,
      code: parsed.code,
      error: parsed.message || safeString(error?.message, 'Unknown error'),
      stack: truncateForLog(error?.stack || '', 12000),
    });

    throw buildGeminiErrorResponse(error, parsed.message || 'Gemini AI request failed. Please try again.');
  }
}

export const generateDailyPlan = asyncHandler(async (req, res) => {
  const baseContext = await loadAiBaseContext(req.user._id);
  const conversationId = safeString(req.body.conversationId, createConversationId());
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
    conversationId,
    conversationTitle: buildConversationTitle('daily_plan', 'Study plan'),
    maxOutputTokens: 2048,
  });

  res.json({ success: true, data: { plan: payload, tokensUsed: TOKEN_COSTS.daily_plan, conversationId, conversationTitle: buildConversationTitle('daily_plan', 'Study plan') } });
});

export const summarizeFile = asyncHandler(async (req, res) => {
  const baseContext = await loadAiBaseContext(req.user._id);
  const conversationId = safeString(req.body.conversationId, createConversationId());
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
    conversationId,
    conversationTitle: buildConversationTitle('summary', fileContext?.file?.originalName || req.body.text || 'Summary'),
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

  res.json({ success: true, data: { summary, tokensUsed: TOKEN_COSTS.summarize_file, conversationId, conversationTitle: buildConversationTitle('summary', fileContext?.file?.originalName || req.body.text || 'Summary') } });
});

export const generateExercises = asyncHandler(async (req, res) => {
  const baseContext = await loadAiBaseContext(req.user._id);
  const conversationId = safeString(req.body.conversationId, createConversationId());
  const courseContext = req.body.courseId ? await loadCourseContext(req.user._id, req.body.courseId) : null;

  const context = toAiContextSnapshot(baseContext, {
    course: courseContext?.course || null,
    topic: safeString(req.body.topic),
    difficulty: safeString(req.body.difficulty, 'medium'),
    count: req.body.count || 3,
  });

  const promptPackage = buildGenerateExercisesPrompt(context, {
    count: req.body.count,
    topic: req.body.topic,
    difficulty: req.body.difficulty,
  });
  const originalUserMessage = `Generate ${Math.max(1, Math.min(20, Number(req.body.count) || 5))} practice exercises on topic "${safeString(req.body.topic, courseContext?.course?.title || 'the topic')}" at ${safeString(req.body.difficulty, 'medium')} difficulty.`;
  const { payload } = await executeAiJob({
    req,
    type: AI_TYPES.generateExercises,
    label: 'exercise generation',
    cost: TOKEN_COSTS.exercises,
    promptPackage,
    metadata: { endpoint: '/api/ai/generate-exercises', originalUserMessage },
    context,
    fallbackFactory: () => createFallbackExercises(context, { course: courseContext?.course, topic: req.body.topic, difficulty: req.body.difficulty }),
    dataMapper: (data) => normalizeExercises(data, context, { course: courseContext?.course, topic: req.body.topic, difficulty: req.body.difficulty }),
    payloadValidator: (data) => isMeaningfulExercisesPayload(data, { count: req.body.count }),
    courseId: courseContext?.course?.id || undefined,
    conversationId,
    conversationTitle: buildConversationTitle('exercise', req.body.topic || courseContext?.course?.title || 'Exercises'),
    maxOutputTokens: 2500,
  });

  res.json({ success: true, data: { exercises: payload, tokensUsed: TOKEN_COSTS.exercises, conversationId, conversationTitle: buildConversationTitle('exercise', req.body.topic || courseContext?.course?.title || 'Exercises') } });
});

export const prioritizeTasks = asyncHandler(async (req, res) => {
  const baseContext = await loadAiBaseContext(req.user._id);
  const conversationId = safeString(req.body.conversationId, createConversationId());
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
    conversationId,
    conversationTitle: buildConversationTitle('prioritize_tasks', 'Task priorities'),
    maxOutputTokens: 2200,
  });

  res.json({ success: true, data: { prioritization: payload, tokensUsed: TOKEN_COSTS.prioritize_tasks, conversationId, conversationTitle: buildConversationTitle('prioritize_tasks', 'Task priorities') } });
});

export const revisionPlan = asyncHandler(async (req, res) => {
  const baseContext = await loadAiBaseContext(req.user._id);
  const conversationId = safeString(req.body.conversationId, createConversationId());
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
    conversationId,
    conversationTitle: buildConversationTitle('revision_plan', courseContext?.course?.title || examContext?.exam?.title || 'Revision plan'),
    maxOutputTokens: 2500,
  });

  res.json({ success: true, data: { revisionPlan: payload, tokensUsed: TOKEN_COSTS.revision_plan, conversationId, conversationTitle: buildConversationTitle('revision_plan', courseContext?.course?.title || examContext?.exam?.title || 'Revision plan') } });
});

export const chat = asyncHandler(async (req, res) => {
  const baseContext = await loadAiBaseContext(req.user._id);
  const conversationId = safeString(req.body.conversationId, createConversationId());
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
  const conversationTitle = buildConversationTitle('chat', req.body.message);
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
    payloadValidator: (data) => {
      const responseType = sanitizeResponseType(data?.responseType, 'chat');
      if (responseType === 'exam') return isMeaningfulExamPayload(data?.exam || data);
      if (responseType === 'summary') return Boolean(safeString(data?.summary?.summary || data?.summary?.title || data?.reply));
      if (responseType === 'exercises') return Boolean(safeArray(data?.exercises?.exercises || data?.exercises || data?.items || data?.questions).length);
      if (responseType === 'flashcards') return Boolean(safeArray(data?.flashcards?.cards || data?.flashcards || data?.cards).length);
      return Boolean(safeString(data?.reply || data?.text || data?.message || data?.instructions));
    },
    courseId: courseContext?.course?.id || undefined,
    fileId: fileContext?.file?.id || undefined,
    conversationId,
    conversationTitle,
    maxOutputTokens: 1200,
  });

  const responseType = sanitizeResponseType(payload.responseType, 'chat');
  const examPayload = responseType === 'exam' ? payload.exam : null;
  const assistantMessage = responseType === 'exam'
    ? pickString(
        examPayload?.instructions,
        `I created a ${safeString(examPayload?.title, 'exam')} for you.`
      )
    : payload.reply;

  res.json({
    success: true,
    data: {
      conversationId,
      conversationTitle,
      originalUserMessage: safeString(req.body.message),
      assistantMessage,
      exam: examPayload,
      metadata: {
        topic: payload.topic,
        tone: payload.tone,
        confidence: payload.confidence,
        responseType,
      },
      suggestedActions: payload.nextActions,
      followUpQuestions: payload.followUpQuestion ? [payload.followUpQuestion] : [],
      tokenCost: TOKEN_COSTS.chat,
      responseType,
      reply: assistantMessage,
      message: assistantMessage,
      chat: {
        ...payload,
        responseType,
        exam: examPayload,
        reply: assistantMessage,
      },
      tokensUsed: TOKEN_COSTS.chat,
    },
  });
});

export const dashboardRecommendations = asyncHandler(async (req, res) => {
  const baseContext = await loadAiBaseContext(req.user._id);
  const conversationId = safeString(req.body.conversationId, createConversationId());
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
    conversationId,
    conversationTitle: buildConversationTitle('chat', 'Dashboard recommendations'),
    maxOutputTokens: 1800,
  });

  res.json({ success: true, data: { recommendations: payload, tokensUsed: TOKEN_COSTS.dashboard_recommendations, conversationId, conversationTitle: buildConversationTitle('chat', 'Dashboard recommendations') } });
});

export const scheduleBuilderChat = asyncHandler(async (req, res) => {
  const baseContext = await loadAiBaseContext(req.user._id);
  const conversationId = safeString(req.body.conversationId, createConversationId());
  const bounds = resolveScheduleWeekBounds(req.body);
  const recentMessages = safeArray(req.body.recentMessages).map((item) => ({
    role: item.role,
    content: safeString(item.content),
    type: item.type || 'schedule_builder',
  }));
  const weekSchedule = await ScheduleEvent.find({
    userId: req.user._id,
    $or: [
      { start: { $gte: bounds.start, $lte: bounds.end } },
      { end: { $gte: bounds.start, $lte: bounds.end } },
      { start: { $lte: bounds.start }, end: { $gte: bounds.end } },
    ],
  })
    .sort({ start: 1 })
    .populate('courseId', 'title')
    .lean();

  const busyPeriods = weekSchedule.map(mapScheduleEventForBuilder);

  const context = buildScheduleBuilderContext(baseContext, {
    currentDate: req.body.date || new Date().toISOString(),
    weekStart: bounds.start.toISOString(),
    weekEnd: bounds.end.toISOString(),
    conversationId,
    conversationHistory: recentMessages,
    recentSchedule: busyPeriods,
    busyPeriods,
    freePeriods: buildFreePeriods(busyPeriods, bounds.start, bounds.end),
  });

  const promptPackage = buildScheduleBuilderChatPrompt(context);
  const conversationTitle = buildConversationTitle('schedule_builder_chat', req.body.message || 'Schedule builder');
  const { payload } = await executeAiJob({
    req,
    type: AI_TYPES.scheduleBuilderChat,
    label: 'schedule builder chat',
    cost: TOKEN_COSTS.schedule_builder_chat,
    promptPackage,
    metadata: { endpoint: '/api/ai/schedule-builder/chat', originalUserMessage: safeString(req.body.message) },
    context,
    fallbackFactory: () => normalizeScheduleBuilderChat({}, context),
    dataMapper: (data) => normalizeScheduleBuilderChat(data, context),
    payloadValidator: (data) => Boolean(safeString(data?.reply) || safeString(data?.followUpQuestion) || data?.readyToGenerate),
    conversationId,
    conversationTitle,
    maxOutputTokens: 1200,
  });

  res.json({
    success: true,
    data: {
      conversationId,
      conversationTitle,
      originalUserMessage: safeString(req.body.message),
      assistantMessage: payload.reply,
      reply: payload.reply,
      followUpQuestion: payload.followUpQuestion,
      readyToGenerate: payload.readyToGenerate,
      conversationStage: payload.conversationStage,
      nextActions: payload.nextActions,
      missingInformation: payload.missingInformation,
      summary: payload.summary,
      confidence: payload.confidence,
      tokensUsed: TOKEN_COSTS.schedule_builder_chat,
      chat: payload,
    },
  });
});

export const generateScheduleBuilder = asyncHandler(async (req, res) => {
  const baseContext = await loadAiBaseContext(req.user._id);
  const conversationId = safeString(req.body.conversationId, createConversationId());
  const bounds = resolveScheduleWeekBounds(req.body);
  const message = safeString(req.body.message);
  const recentMessages = safeArray(req.body.recentMessages).map((item) => ({
    role: item.role,
    content: safeString(item.content),
    type: item.type || 'schedule_builder',
  }));
  const fallbackConversation = recentMessages.length
    ? recentMessages
    : mapAiConversationHistory(await loadScheduleBuilderConversation(req, conversationId));
  const generationConversation = message
    ? [...fallbackConversation, {
        role: 'user',
        content: message,
        type: 'schedule_builder',
      }]
    : fallbackConversation;

  const weekSchedule = await ScheduleEvent.find({
    userId: req.user._id,
    $or: [
      { start: { $gte: bounds.start, $lte: bounds.end } },
      { end: { $gte: bounds.start, $lte: bounds.end } },
      { start: { $lte: bounds.start }, end: { $gte: bounds.end } },
    ],
  })
    .sort({ start: 1 })
    .populate('courseId', 'title')
    .lean();

  const busyPeriods = weekSchedule.map(mapScheduleEventForBuilder);
  const freePeriods = buildFreePeriods(busyPeriods, bounds.start, bounds.end);
  const context = buildScheduleBuilderContext(baseContext, {
    currentDate: req.body.date || new Date().toISOString(),
    weekStart: bounds.start.toISOString(),
    weekEnd: bounds.end.toISOString(),
    conversationId,
    conversationHistory: generationConversation,
    recentSchedule: busyPeriods,
    busyPeriods,
    freePeriods,
  });

  const promptPackage = buildScheduleBuilderGeneratePrompt(context);
  const conversationTitle = buildConversationTitle('schedule_builder_generate', 'Weekly schedule');
  const { payload } = await executeAiJob({
    req,
    type: AI_TYPES.scheduleBuilderGenerate,
    label: 'schedule generation',
    cost: TOKEN_COSTS.schedule_builder_generate,
    promptPackage,
    metadata: { endpoint: '/api/ai/schedule-builder/generate' },
    context,
    fallbackFactory: () => ({ type: 'schedule_generation', metadata: { title: 'Weekly schedule', weekStart: bounds.start.toISOString(), weekEnd: bounds.end.toISOString(), timezone: context.timezone || 'UTC', language: context.language || 'en' }, summary: 'Your schedule is ready.', events: [], recommendations: [], warnings: [], conflicts: [] }),
    dataMapper: (data) => normalizeScheduleGenerationPayload(data, context),
    payloadValidator: (data) => Array.isArray(data?.events) && data.events.length > 0,
    allowFallback: false,
    conversationId,
    conversationTitle,
    maxOutputTokens: 4096,
  });

  const createdEvents = [];
  for (const item of payload.events) {
    const eventPayload = buildScheduleEventCreatePayload(item, req.user._id);
    if (!eventPayload) continue;

    const created = await ScheduleEvent.create(eventPayload);
    createdEvents.push(created.toObject());
  }

  if (!createdEvents.length) {
    throw new ApiError(502, 'Generated schedule did not contain any valid events.');
  }

  res.json({
    success: true,
    data: {
      conversationId,
      conversationTitle,
      scheduleGeneration: payload,
      reply: payload.summary,
      summary: payload.summary,
      recommendations: payload.recommendations,
      warnings: payload.warnings,
      conflicts: payload.conflicts,
      generatedSchedule: payload.events,
      createdEvents,
      tokensUsed: TOKEN_COSTS.schedule_builder_generate,
    },
  });
});

export const getAIHistory = asyncHandler(async (req, res) => {
  const limit = Math.max(1, Math.min(100, Number.parseInt(req.query.limit, 10) || 20));
  const conversationId = safeString(req.query.conversationId);
  const query = { userId: req.user._id };

  if (conversationId) {
    query.conversationId = conversationId;
  }

  const history = await AIRequest.find(query)
    .sort({ createdAt: conversationId ? 1 : -1 })
    .limit(conversationId ? 100 : limit)
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

export const getScheduleBuilderHistory = asyncHandler(async (req, res) => {
  const limit = Math.max(1, Math.min(100, Number.parseInt(req.query.limit, 10) || 20));
  const conversationId = safeString(req.query.conversationId);
  const query = {
    userId: req.user._id,
    type: { $in: SCHEDULE_BUILDER_TYPES },
  };

  if (conversationId) {
    query.conversationId = conversationId;
  }

  const history = await AIRequest.find(query)
    .sort({ createdAt: conversationId ? 1 : -1 })
    .limit(conversationId ? 100 : limit)
    .lean();

  res.json({
    success: true,
    count: history.length,
    data: mapAiConversationHistory(history),
  });
});

export const getAIConversations = asyncHandler(async (req, res) => {
  const limit = Math.max(1, Math.min(50, Number.parseInt(req.query.limit, 10) || 20));

  const conversations = await AIRequest.aggregate([
    { $match: { userId: req.user._id } },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: { $ifNull: ['$conversationId', '$_id'] },
        conversationId: { $first: { $ifNull: ['$conversationId', { $toString: '$_id' }] } },
        conversationTitle: { $first: { $ifNull: ['$conversationTitle', '$prompt'] } },
        lastMessage: { $first: { $ifNull: ['$assistantMessage', '$response'] } },
        lastUserMessage: { $first: { $ifNull: ['$originalUserMessage', '$prompt'] } },
        lastType: { $first: { $ifNull: ['$metadata.responseType', '$type'] } },
        lastTokenCost: { $first: { $ifNull: ['$tokenCost', '$tokensUsed'] } },
        lastCreatedAt: { $first: '$createdAt' },
        count: { $sum: 1 },
        courseId: { $first: '$courseId' },
        fileId: { $first: '$fileId' },
      },
    },
    {
      $project: {
        _id: 0,
        conversationId: 1,
        conversationTitle: 1,
        lastMessage: 1,
        lastUserMessage: 1,
        lastType: 1,
        lastTokenCost: 1,
        lastCreatedAt: 1,
        count: 1,
        courseId: 1,
        fileId: 1,
      },
    },
    { $sort: { lastCreatedAt: -1 } },
    { $limit: limit },
  ]);

  res.json({
    success: true,
    count: conversations.length,
    data: conversations,
  });
});

export const getScheduleBuilderConversations = asyncHandler(async (req, res) => {
  const limit = Math.max(1, Math.min(50, Number.parseInt(req.query.limit, 10) || 20));

  const conversations = await AIRequest.aggregate([
    { $match: { userId: req.user._id, type: { $in: SCHEDULE_BUILDER_TYPES } } },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: { $ifNull: ['$conversationId', '$_id'] },
        conversationId: { $first: { $ifNull: ['$conversationId', { $toString: '$_id' }] } },
        conversationTitle: { $first: { $ifNull: ['$conversationTitle', '$prompt'] } },
        lastMessage: { $first: { $ifNull: ['$assistantMessage', '$response'] } },
        lastUserMessage: { $first: { $ifNull: ['$originalUserMessage', '$prompt'] } },
        lastType: { $first: { $ifNull: ['$metadata.responseType', '$type'] } },
        lastTokenCost: { $first: { $ifNull: ['$tokenCost', '$tokensUsed'] } },
        lastCreatedAt: { $first: '$createdAt' },
        count: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        conversationId: 1,
        conversationTitle: 1,
        lastMessage: 1,
        lastUserMessage: 1,
        lastType: 1,
        lastTokenCost: 1,
        lastCreatedAt: 1,
        count: 1,
      },
    },
    { $sort: { lastCreatedAt: -1 } },
    { $limit: limit },
  ]);

  res.json({
    success: true,
    count: conversations.length,
    data: conversations,
  });
});

export const getTokenCosts = () => ({ ...TOKEN_COSTS });


