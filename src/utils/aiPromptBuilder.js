const JSON_ONLY_INSTRUCTION = 'Return valid JSON only. Do not wrap the response in markdown or code fences.';

function stringify(value) {
  return JSON.stringify(value, null, 2);
}

function baseSystemInstruction() {
  return [
    'You are Planify AI, a study and productivity assistant for students.',
    'Keep responses practical, concise, and supportive.',
    JSON_ONLY_INSTRUCTION,
  ].join(' ');
}

function buildContextSection(label, value) {
  return `${label}:\n${stringify(value ?? null)}`;
}

function buildPromptPackage({ task, context, shape, historyPrompt }) {
  return {
    systemInstruction: baseSystemInstruction(),
    userPrompt: [
      task,
      buildContextSection('Context', context),
      'Return JSON matching this shape exactly:',
      stringify(shape),
    ].join('\n\n'),
    historyPrompt,
  };
}

export function buildDailyPlanPrompt(context) {
  return buildPromptPackage({
    task: 'Create a structured daily study plan based on the student context.',
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
    task: 'Summarize the supplied study material for a student.',
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

export function buildGenerateExercisesPrompt(context) {
  return buildPromptPackage({
    task: 'Generate study exercises for the student.',
    context,
    historyPrompt: 'Generate study exercises.',
    shape: {
      courseTitle: 'Course name',
      topic: 'Topic name',
      difficulty: 'medium',
      exercises: [
        {
          id: 1,
          question: 'Question text',
          type: 'mcq',
          options: ['Option A', 'Option B'],
          answer: 'Correct answer',
          explanation: 'Why this is correct',
          hint: 'Helpful hint',
        },
      ],
    },
  });
}

export function buildPrioritizeTasksPrompt(context) {
  return buildPromptPackage({
    task: 'Rank the student tasks from most urgent to least urgent.',
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
    task: 'Create a revision plan for the student.',
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
  return buildPromptPackage({
    task: 'Answer the student as a professional study assistant. Be helpful, direct, academically focused, and maintain continuity with the ongoing conversation. If the user references a previous answer, the current course, or the selected file, use that context explicitly. If the context is incomplete, ask one concise clarifying question and still provide the best possible guidance.',
    context,
    historyPrompt: 'Answer a study question with context.',
    shape: {
      reply: 'Helpful answer',
      nextActions: ['Action 1'],
      followUpQuestion: 'A short follow-up question',
      topic: 'Optional topic label',
      confidence: 'high',
    },
  });
}

export function buildDashboardRecommendationsPrompt(context) {
  return buildPromptPackage({
    task: 'Generate actionable dashboard recommendations for today.',
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
