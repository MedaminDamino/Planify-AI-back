const JSON_ONLY_INSTRUCTION = 'Return valid JSON only. Do not wrap the response in markdown or code fences.';
const NO_PLACEHOLDER_INSTRUCTION = 'Never use placeholder text such as "Question", "Exercise", "Explain the main idea", or generic filler. Every field must be specific, complete, and context-aware.';

function stringify(value) {
  return JSON.stringify(value, null, 2);
}

function describeShapeForPrompt(value) {
  if (Array.isArray(value)) {
    if (!value.length) return [];
    return [describeShapeForPrompt(value[0])];
  }

  if (value === null) return 'null';

  switch (typeof value) {
    case 'string':
      return 'string';
    case 'number':
      return Number.isInteger(value) ? 'integer' : 'number';
    case 'boolean':
      return 'boolean';
    case 'object':
      return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, describeShapeForPrompt(nested)]));
    default:
      return 'value';
  }
}

function inferResponseSchema(value) {
  if (Array.isArray(value)) {
    const itemSchema = value.length ? inferResponseSchema(value[0]) : { type: 'string' };
    return {
      type: 'array',
      minItems: Math.max(1, value.length || 1),
      items: itemSchema,
    };
  }

  if (value === null) {
    return { type: ['string', 'null'] };
  }

  switch (typeof value) {
    case 'string':
      return { type: 'string', minLength: 1 };
    case 'number':
      return { type: Number.isInteger(value) ? 'integer' : 'number' };
    case 'boolean':
      return { type: 'boolean' };
    case 'object': {
      const properties = {};
      const required = [];

      for (const [key, nested] of Object.entries(value)) {
        properties[key] = inferResponseSchema(nested);
        required.push(key);
      }

      return {
        type: 'object',
        properties,
        required,
      };
    }
    default:
      return { type: 'string' };
  }
}

function applyCountHints(schema, shape) {
  if (!schema || typeof schema !== 'object' || !shape || typeof shape !== 'object') return schema;

  const count = Number(shape.count);
  const hasCount = Number.isFinite(count) && count > 0;
  if (!schema.properties || typeof schema.properties !== 'object') return schema;

  for (const key of ['questions', 'exercises', 'answerKey']) {
    const prop = schema.properties[key];
    if (hasCount && prop && typeof prop === 'object' && prop.type === 'array') {
      prop.minItems = count;
      prop.maxItems = count;
    }
  }

  return schema;
}

function formatStudyItem(label, value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? `${label}: ${text}` : '';
}

function formatNamedList(title, items, mapper) {
  const lines = Array.isArray(items) ? items.map(mapper).filter(Boolean) : [];
  if (!lines.length) return '';
  return `${title}:\n- ${lines.join('\n- ')}`;
}

function formatRecentConversation(recentConversation = []) {
  const lines = Array.isArray(recentConversation)
    ? recentConversation
      .map((item) => {
        const role = item?.role === 'assistant' ? 'Assistant' : 'Student';
        const content = typeof item?.content === 'string' ? item.content.trim() : '';
        return content ? `${role}: ${content}` : '';
      })
      .filter(Boolean)
    : [];

  if (!lines.length) return '';

  return `Recent conversation:\n${lines.map((line) => `- ${line}`).join('\n')}`;
}

function buildChatContextSection(context) {
  const sections = [];
  const user = context?.user || {};
  const profile = user?.profile || {};
  const preferences = user?.studyPreferences || {};
  const course = context?.course || null;
  const file = context?.file || null;
  const message = typeof context?.message === 'string' ? context.message.trim() : '';

  if (message) {
    sections.push(`Current user message:\n- ${message}`);
  }

  const profileLines = [
    formatStudyItem('Name', profile.fullName),
    formatStudyItem('University', profile.university),
    formatStudyItem('Program', profile.program),
    formatStudyItem('Field of study', profile.fieldOfStudy),
    formatStudyItem('Academic year', profile.academicYear),
  ].filter(Boolean);

  if (profileLines.length) {
    sections.push(`Student profile:\n- ${profileLines.join('\n- ')}`);
  }

  const preferenceLines = [
    formatStudyItem('Preferred study hours', preferences.preferredStudyHours),
    formatStudyItem('Focus session length', preferences.focusSessionLength ? `${preferences.focusSessionLength} minutes` : ''),
    formatStudyItem('Break length', preferences.breakLength ? `${preferences.breakLength} minutes` : ''),
    formatStudyItem('Revision style', preferences.revisionStyle),
    formatStudyItem('Difficulty preference', preferences.difficultyPreference),
    formatStudyItem('Assistant tone', preferences.aiAssistantTone),
    formatStudyItem('Language', preferences.language),
  ].filter(Boolean);

  if (preferenceLines.length) {
    sections.push(`Study preferences:\n- ${preferenceLines.join('\n- ')}`);
  }

  if (course) {
    const courseLines = [
      formatStudyItem('Title', course.title),
      formatStudyItem('Semester', course.semester),
      formatStudyItem('Teacher', course.teacher),
      formatStudyItem('Status', course.status),
      formatStudyItem('Priority', course.priority),
      formatStudyItem('Progress', `${Math.round(Number(course.progress) || 0)}%`),
    ].filter(Boolean);

    sections.push(`Selected course:\n- ${courseLines.join('\n- ')}`);
  }

  if (file) {
    const fileLines = [
      formatStudyItem('Title', file.originalName),
      formatStudyItem('Type', file.type),
      formatStudyItem('Course', file.course?.title),
      formatStudyItem('Summary', file.aiSummary),
      formatStudyItem('Tags', Array.isArray(file.tags) && file.tags.length ? file.tags.join(', ') : ''),
    ].filter(Boolean);

    const excerpt = typeof file.extractedText === 'string' ? file.extractedText.trim() : '';
    const excerptLine = excerpt ? `Excerpt: ${excerpt.slice(0, 600)}` : '';
    sections.push(`Selected file:\n- ${[...fileLines, excerptLine].filter(Boolean).join('\n- ')}`);
  }

  const recentTasks = Array.isArray(context?.recentTasks) ? context.recentTasks : [];
  if (recentTasks.length) {
    sections.push(formatNamedList('Recent tasks', recentTasks.slice(0, 5), (task) => {
      const parts = [
        task?.title,
        task?.priority ? `priority ${task.priority}` : '',
        task?.status ? `status ${task.status}` : '',
        task?.deadline ? `deadline ${task.deadline}` : '',
      ].filter(Boolean);
      return parts.join(' • ');
    }));
  }

  const recentExams = Array.isArray(context?.recentExams) ? context.recentExams : [];
  if (recentExams.length) {
    sections.push(formatNamedList('Upcoming exams', recentExams.slice(0, 5), (exam) => {
      const parts = [
        exam?.title,
        exam?.examDate ? `date ${exam.examDate}` : '',
        exam?.priority ? `priority ${exam.priority}` : '',
      ].filter(Boolean);
      return parts.join(' • ');
    }));
  }

  const recentConversation = formatRecentConversation(context?.recentConversation);
  if (recentConversation) {
    sections.push(recentConversation);
  }

  return sections.filter(Boolean).join('\n\n');
}

function baseSystemInstruction() {
  return [
    'You are Planify AI, a study and productivity assistant for students.',
    'Understand the student request first, then choose the best educational format and depth for the answer.',
    'Infer the user language, topic, difficulty, and response structure from the request and available context.',
    'Prefer complete, professional, directly usable study content over short advice or generic explanations.',
    NO_PLACEHOLDER_INSTRUCTION,
    JSON_ONLY_INSTRUCTION,
  ].join(' ');
}

function buildContextSection(label, value) {
  if (typeof value === 'string') {
    return value.trim() ? `${label}:\n${value.trim()}` : '';
  }

  return `${label}:\n${stringify(value ?? null)}`;
}

function buildPromptPackage({ task, context, shape, historyPrompt, responseSchema: customResponseSchema }) {
  const promptShape = describeShapeForPrompt(shape);
  const responseSchema = customResponseSchema || applyCountHints(inferResponseSchema(shape), shape);
  return {
    systemInstruction: baseSystemInstruction(),
    userPrompt: [
      task,
      buildContextSection('Context', context),
      'Return JSON matching this shape exactly:',
      stringify(promptShape),
    ].join('\n\n'),
    historyPrompt,
    responseSchema,
  };
}

export function buildDailyPlanPrompt(context) {
  return buildPromptPackage({
    task: [
      'Create a structured daily study plan based on the student context.',
      "Make the plan realistic, time-aware, and aligned with the learner's current obligations and priorities.",
      'Use practical study blocks, breaks, and topic sequencing that make sense for the student.',
      NO_PLACEHOLDER_INSTRUCTION,
    ].join(' '),
    context,
    historyPrompt: 'Create a daily study plan.',
    shape: {
      date: 'YYYY-MM-DD',
      focusHours: 6,
      overview: 'Short summary of the day',
      topPriorities: [{ title: 'Priority title', reason: 'Why it matters' }],
      plan: [
        {
          time: '08:00 - 09:30',
          title: 'Study block title',
          activity: 'What to do',
          priority: 'high',
          relatedTo: { type: 'course', id: 'optional id', title: 'optional title' },
        },
      ],
      breaks: [{ time: '10:30 - 10:45', durationMinutes: 15, note: 'Short reset note' }],
      tips: ['Actionable tip'],
    },
  });
}

export function buildSummarizeFilePrompt(context) {
  return buildPromptPackage({
    task: [
      'Summarize the supplied study material for a student.',
      'Produce a structured summary that reads like a polished study note, not a generic paragraph.',
      'Capture the main ideas, key points, important terms, and practical revision guidance.',
      NO_PLACEHOLDER_INSTRUCTION,
    ].join(' '),
    context,
    historyPrompt: 'Summarize a file or course note.',
    shape: {
      title: 'Document title',
      summary: 'Short summary',
      keyPoints: ['Point 1'],
      topics: ['Topic 1'],
      studyTips: ['Tip 1'],
      nextSteps: ['Step 1'],
    },
  });
}

export function buildGenerateExercisesPrompt(context, options = {}) {
  const desiredCount = Math.max(1, Math.min(20, Number(options.count) || 5));
  const topic = typeof options.topic === 'string' && options.topic.trim() ? options.topic.trim() : 'the selected topic';
  const difficulty = typeof options.difficulty === 'string' && options.difficulty.trim() ? options.difficulty.trim() : 'medium';

  return buildPromptPackage({
    task: [
      `Generate exactly ${desiredCount} study exercises for the student on ${topic}.`,
      `Match ${difficulty} difficulty and cover the topic deeply, practically, and progressively.`,
      'Use varied exercise types, realistic prompts, and avoid repeated phrasing or template language.',
      'Each exercise must be specific, useful, and grounded in the requested topic.',
      'Provide direct answers, brief hints, and explanations that match the question exactly.',
      'If MCQ is used, provide at least four realistic options and one correct answer.',
      NO_PLACEHOLDER_INSTRUCTION,
    ].join(' '),
    context,
    historyPrompt: `Generate ${desiredCount} practice exercises on topic "${topic}" at ${difficulty} difficulty.`,
    shape: {
      courseTitle: 'Course name',
      topic: 'Topic name',
      difficulty: 'medium',
      count: desiredCount,
      exercises: [
        {
          id: 1,
          question: '',
          type: 'mcq',
          options: [],
          answer: '',
          explanation: '',
          hint: '',
        },
      ],
    },
  });
}

export function buildPrioritizeTasksPrompt(context) {
  return buildPromptPackage({
    task: [
      'Rank the student tasks from most urgent to least urgent.',
      'Use the available context to justify the ranking with clear, actionable reasoning.',
      'Include a short plan for what to do next for each task.',
      NO_PLACEHOLDER_INSTRUCTION,
    ].join(' '),
    context,
    historyPrompt: 'Prioritize tasks.',
    shape: {
      summary: 'Short prioritization summary',
      ranking: [
        {
          taskId: 'task id',
          title: 'Task title',
          score: 98,
          reason: 'Why it is urgent',
          suggestedAction: 'What to do next',
        },
      ],
      focusTips: ['Tip 1'],
    },
  });
}

export function buildRevisionPlanPrompt(context) {
  return buildPromptPackage({
    task: [
      'Create a revision plan for the student.',
      'Return a practical roadmap with topic sequencing, time estimates, practice ideas, and exam-focused guidance.',
      'Make the plan feel like something a serious student could follow immediately.',
      NO_PLACEHOLDER_INSTRUCTION,
    ].join(' '),
    context,
    historyPrompt: 'Create a revision plan.',
    shape: {
      title: 'Revision plan title',
      summary: 'Short overview',
      topicBreakdown: [
        { topic: 'Topic name', priority: 'high', focus: 'What to review', timeEstimate: '45 minutes' },
      ],
      plan: [
        { day: 'Day 1', focus: 'What to do', tasks: ['Task 1'] },
      ],
      practiceIdeas: ['Practice idea 1'],
      examTips: ['Tip 1'],
    },
  });
}

export function buildChatPrompt(context) {
  const shape = {
    responseType: 'string',
    title: '',
    topic: '',
    subject: '',
    count: 0,
    language: 'French',
    difficulty: 'medium',
    estimatedDurationMinutes: 20,
    instructions: '',
    reply: '',
    nextActions: [''],
    followUpQuestion: '',
    confidence: 'high',
    exam: {
      title: '',
      topic: '',
      subject: '',
      language: 'French',
      level: 'medium',
      durationMinutes: 20,
      instructions: '',
      questions: [
        {
          id: 1,
          type: 'mcq',
          question: '',
          options: [''],
          answer: '',
          explanation: '',
        },
      ],
      answerKey: [
        {
          id: 1,
          answer: '',
          explanation: '',
        },
      ],
      nextActions: [''],
      followUpQuestion: '',
      confidence: 'high',
    },
    summary: {
      title: '',
      summary: '',
      keyPoints: [''],
      importantTerms: [''],
      studyTips: [''],
      nextSteps: [''],
    },
    exercises: {
      topic: '',
      difficulty: 'medium',
      exercises: [
        {
          id: 1,
          question: '',
          type: 'open',
          options: [''],
          answer: '',
          explanation: '',
          hint: '',
        },
      ],
    },
    flashcards: {
      topic: '',
      cards: [
        {
          id: 1,
          front: '',
          back: '',
          hint: '',
        },
      ],
      reviewTips: [''],
    },
    revisionPlan: {
      title: '',
      summary: '',
      topicBreakdown: [
        {
          topic: '',
          priority: 'high',
          focus: '',
          timeEstimate: '45 minutes',
        },
      ],
      plan: [
        {
          day: 'Day 1',
          focus: '',
          tasks: [''],
        },
      ],
      practiceIdeas: [''],
      examTips: [''],
    },
    prioritizedTasks: {
      summary: '',
      ranking: [
        {
          taskId: '',
          title: '',
          score: 0,
          reason: '',
          suggestedAction: '',
        },
      ],
      focusTips: [''],
    },
  };

  const responseSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      responseType: {
        type: 'string',
        enum: ['chat', 'exam', 'summary', 'exercises', 'flashcards', 'daily_plan', 'revision_plan', 'prioritize_tasks'],
      },
      title: { type: 'string' },
      topic: { type: 'string' },
      subject: { type: 'string' },
      count: { type: 'integer' },
      language: { type: 'string' },
      difficulty: { type: 'string' },
      estimatedDurationMinutes: { type: 'integer' },
      instructions: { type: 'string' },
      reply: { type: 'string' },
      nextActions: {
        type: 'array',
        minItems: 1,
        items: { type: 'string' },
      },
      followUpQuestion: { type: 'string' },
      confidence: { type: 'string' },
      exam: {
        type: ['object', 'null'],
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          topic: { type: 'string' },
          subject: { type: 'string' },
          language: { type: 'string' },
          level: { type: 'string' },
          durationMinutes: { type: 'integer' },
          instructions: { type: 'string' },
          questions: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'integer' },
                type: { type: 'string' },
                question: { type: 'string' },
                options: {
                  type: 'array',
                  minItems: 4,
                  items: { type: 'string' },
                },
                answer: { type: 'string' },
                explanation: { type: 'string' },
              },
              required: ['id', 'type', 'question', 'options', 'answer', 'explanation'],
            },
          },
          answerKey: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'integer' },
                answer: { type: 'string' },
                explanation: { type: 'string' },
              },
              required: ['id', 'answer', 'explanation'],
            },
          },
          nextActions: {
            type: 'array',
            minItems: 1,
            items: { type: 'string' },
          },
          followUpQuestion: { type: 'string' },
          confidence: { type: 'string' },
        },
        required: ['title', 'topic', 'subject', 'language', 'level', 'durationMinutes', 'instructions', 'questions', 'answerKey', 'nextActions', 'followUpQuestion', 'confidence'],
      },
      summary: {
        type: ['object', 'null'],
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
          keyPoints: { type: 'array', minItems: 1, items: { type: 'string' } },
          importantTerms: { type: 'array', minItems: 1, items: { type: 'string' } },
          studyTips: { type: 'array', minItems: 1, items: { type: 'string' } },
          nextSteps: { type: 'array', minItems: 1, items: { type: 'string' } },
        },
        required: ['title', 'summary', 'keyPoints', 'importantTerms', 'studyTips', 'nextSteps'],
      },
      exercises: {
        type: ['object', 'null'],
        additionalProperties: false,
        properties: {
          topic: { type: 'string' },
          difficulty: { type: 'string' },
          exercises: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'integer' },
                question: { type: 'string' },
                type: { type: 'string' },
                options: { type: 'array', minItems: 1, items: { type: 'string' } },
                answer: { type: 'string' },
                explanation: { type: 'string' },
                hint: { type: 'string' },
              },
              required: ['id', 'question', 'type', 'options', 'answer', 'explanation', 'hint'],
            },
          },
        },
        required: ['topic', 'difficulty', 'exercises'],
      },
      flashcards: {
        type: ['object', 'null'],
        additionalProperties: false,
        properties: {
          topic: { type: 'string' },
          cards: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'integer' },
                front: { type: 'string' },
                back: { type: 'string' },
                hint: { type: 'string' },
              },
              required: ['id', 'front', 'back', 'hint'],
            },
          },
          reviewTips: { type: 'array', minItems: 1, items: { type: 'string' } },
        },
        required: ['topic', 'cards', 'reviewTips'],
      },
      revisionPlan: {
        type: ['object', 'null'],
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
          topicBreakdown: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                topic: { type: 'string' },
                priority: { type: 'string' },
                focus: { type: 'string' },
                timeEstimate: { type: 'string' },
              },
              required: ['topic', 'priority', 'focus', 'timeEstimate'],
            },
          },
          plan: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                day: { type: 'string' },
                focus: { type: 'string' },
                tasks: { type: 'array', minItems: 1, items: { type: 'string' } },
              },
              required: ['day', 'focus', 'tasks'],
            },
          },
          practiceIdeas: { type: 'array', minItems: 1, items: { type: 'string' } },
          examTips: { type: 'array', minItems: 1, items: { type: 'string' } },
        },
        required: ['title', 'summary', 'topicBreakdown', 'plan', 'practiceIdeas', 'examTips'],
      },
      prioritizedTasks: {
        type: ['object', 'null'],
        additionalProperties: false,
        properties: {
          summary: { type: 'string' },
          ranking: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                taskId: { type: 'string' },
                title: { type: 'string' },
                score: { type: 'integer' },
                reason: { type: 'string' },
                suggestedAction: { type: 'string' },
              },
              required: ['taskId', 'title', 'score', 'reason', 'suggestedAction'],
            },
          },
          focusTips: { type: 'array', minItems: 1, items: { type: 'string' } },
        },
        required: ['summary', 'ranking', 'focusTips'],
      },
    },
    required: ['responseType', 'title', 'topic', 'subject', 'count', 'language', 'difficulty', 'estimatedDurationMinutes', 'instructions', 'reply', 'nextActions', 'followUpQuestion', 'confidence', 'exam', 'summary', 'exercises', 'flashcards', 'revisionPlan', 'prioritizedTasks'],
  };

  return buildPromptPackage({
    task: [
      'Answer the student as a professional study assistant.',
      'Infer the best response type, topic, language, difficulty, duration, and structure directly from the user message and available context.',
      'Do not depend on keyword matching in the application. Interpret the request naturally and respond with the most useful study format.',
      'Choose responseType from this closed set only: chat, exam, summary, exercises, flashcards, daily_plan, revision_plan, prioritize_tasks.',
      'Choose exactly one primary responseType that matches the real intent of the message.',
      'If the request is for an assessment, test, quiz, exam, or QCM, output responseType "exam" and fill the exam section with a complete assessment.',
      'If the request is for a multiple-choice exam or QCM, generate a professional multiple-choice exam with at least four realistic options per question, one correct answer per question unless the user explicitly asks otherwise, and a clear explanation for every answer.',
      'If the user requested a specific question count, honor it exactly when reasonable.',
      'Progress questions from easier to harder and avoid repeated or generic items.',
      'If the user asks for summary, flashcards, exercises, revision plan, daily plan, or prioritization, choose that responseType and fill only the relevant section deeply.',
      'If some details are missing, choose sensible defaults automatically.',
      'Keep the output complete, directly usable, and in the user language.',
      'Populate only the section that matches the chosen responseType. Leave unrelated sections empty or minimal so the payload stays clean.',
    ].join(' '),
    context: buildChatContextSection(context),
    historyPrompt: 'Answer a study question with context.',
    shape,
    responseSchema,
  });
}

export function buildDashboardRecommendationsPrompt(context) {
  return buildPromptPackage({
    task: [
      'Generate actionable dashboard recommendations for today.',
      'Prioritize the most useful next actions for the student based on current context.',
      NO_PLACEHOLDER_INSTRUCTION,
    ].join(' '),
    context,
    historyPrompt: 'Generate dashboard recommendations.',
    shape: {
      summary: 'Short summary',
      recommendations: [
        { title: 'Recommendation title', description: 'Why it matters', actionLabel: 'Open tasks', href: '/dashboard/tasks', tone: 'primary' },
      ],
      focusBlock: { title: 'Main focus', description: 'What to do first' },
      studyTip: 'Quick actionable tip',
    },
  });
}

export function getBaseSystemInstruction() {
  return baseSystemInstruction();
}
