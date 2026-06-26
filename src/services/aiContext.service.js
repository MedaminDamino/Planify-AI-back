import Course from '../models/Course.js';
import Exam from '../models/Exam.js';
import File from '../models/File.js';
import Profile from '../models/Profile.js';
import ScheduleEvent from '../models/ScheduleEvent.js';
import StudyPreference from '../models/StudyPreference.js';
import Subscription from '../models/Subscription.js';
import Task from '../models/Task.js';

function toIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function limitArray(items, count) {
  return Array.isArray(items) ? items.slice(0, count) : [];
}

function mapCourses(courses) {
  return limitArray(courses, 8).map((course) => ({
    id: String(course._id),
    title: course.title,
    description: course.description || '',
    semester: course.semester || '',
    teacher: course.teacher || '',
    color: course.color || null,
    status: course.status || 'active',
    priority: course.priority || 'medium',
    progress: Number(course.progress) || 0,
    totalTasks: Number(course.totalTasks) || 0,
    totalExams: Number(course.totalExams) || 0,
  }));
}

function mapTasks(tasks) {
  return limitArray(tasks, 10).map((task) => ({
    id: String(task._id),
    title: task.title,
    description: task.description || '',
    status: task.status || 'todo',
    priority: task.priority || 'medium',
    deadline: toIsoDate(task.deadline),
    estimatedDuration: Number(task.estimatedDuration) || null,
    progress: Number(task.progress) || 0,
    tags: Array.isArray(task.tags) ? task.tags : [],
    course: task.courseId
      ? {
          id: String(task.courseId._id),
          title: task.courseId.title,
        }
      : null,
  }));
}

function mapExams(exams) {
  return limitArray(exams, 8).map((exam) => ({
    id: String(exam._id),
    title: exam.title,
    description: exam.description || '',
    examDate: toIsoDate(exam.examDate),
    type: exam.type || 'exam',
    priority: exam.priority || 'medium',
    status: exam.status || 'upcoming',
    topics: Array.isArray(exam.topics) ? exam.topics : [],
    location: exam.location || '',
    course: exam.courseId
      ? {
          id: String(exam.courseId._id),
          title: exam.courseId.title,
        }
      : null,
  }));
}

function mapFiles(files) {
  return limitArray(files, 8).map((file) => ({
    id: String(file._id),
    originalName: file.originalName,
    type: file.type || 'other',
    description: file.description || '',
    tags: Array.isArray(file.tags) ? file.tags : [],
    extractedText: file.extractedText ? String(file.extractedText).slice(0, 4000) : '',
    course: file.courseId
      ? {
          id: String(file.courseId._id),
          title: file.courseId.title,
        }
      : null,
  }));
}

function mapSchedule(events) {
  return limitArray(events, 10).map((event) => ({
    id: String(event._id),
    title: event.title,
    description: event.description || '',
    type: event.type,
    start: toIsoDate(event.start),
    end: toIsoDate(event.end),
    location: event.location || '',
    status: event.status || 'scheduled',
    aiSuggested: Boolean(event.aiSuggested),
    course: event.courseId
      ? {
          id: String(event.courseId._id),
          title: event.courseId.title,
        }
      : null,
  }));
}

export async function loadAiBaseContext(userId) {
  const [
    profile,
    studyPreferences,
    subscription,
    courses,
    tasks,
    exams,
    files,
    schedule,
  ] = await Promise.all([
    Profile.findOne({ userId }).lean(),
    StudyPreference.findOne({ userId }).lean(),
    Subscription.findOne({ userId }).sort({ createdAt: -1 }).lean(),
    Course.find({ userId }).sort({ updatedAt: -1 }).limit(20).lean(),
    Task.find({ userId }).sort({ updatedAt: -1 }).limit(30).populate('courseId', 'title').lean(),
    Exam.find({ userId }).sort({ examDate: 1 }).limit(20).populate('courseId', 'title').lean(),
    File.find({ userId }).sort({ uploadedAt: -1 }).limit(20).populate('courseId', 'title').lean(),
    ScheduleEvent.find({ userId }).sort({ start: 1 }).limit(20).populate('courseId', 'title').lean(),
  ]);

  return {
    profile: profile || null,
    studyPreferences: studyPreferences || null,
    subscription: subscription || null,
    courses: mapCourses(courses),
    tasks: mapTasks(tasks),
    exams: mapExams(exams),
    files: mapFiles(files),
    schedule: mapSchedule(schedule),
  };
}

export async function loadCourseContext(userId, courseId) {
  const course = await Course.findOne({ _id: courseId, userId }).lean();
  if (!course) return null;

  const [tasks, exams, files, schedule] = await Promise.all([
    Task.find({ userId, courseId }).sort({ deadline: 1 }).limit(20).populate('courseId', 'title').lean(),
    Exam.find({ userId, courseId }).sort({ examDate: 1 }).limit(10).populate('courseId', 'title').lean(),
    File.find({ userId, courseId }).sort({ uploadedAt: -1 }).limit(10).populate('courseId', 'title').lean(),
    ScheduleEvent.find({ userId, courseId }).sort({ start: 1 }).limit(20).populate('courseId', 'title').lean(),
  ]);

  return {
    course: {
      id: String(course._id),
      title: course.title,
      description: course.description || '',
      semester: course.semester || '',
      teacher: course.teacher || '',
      color: course.color || null,
      status: course.status || 'active',
      priority: course.priority || 'medium',
      progress: Number(course.progress) || 0,
    },
    tasks: mapTasks(tasks),
    exams: mapExams(exams),
    files: mapFiles(files),
    schedule: mapSchedule(schedule),
  };
}

export async function loadFileContext(userId, fileId) {
  const file = await File.findOne({ _id: fileId, userId }).populate('courseId', 'title').lean();
  if (!file) return null;

  return {
    file: {
      id: String(file._id),
      originalName: file.originalName,
      fileName: file.fileName,
      type: file.type || 'other',
      description: file.description || '',
      tags: Array.isArray(file.tags) ? file.tags : [],
      extractedText: file.extractedText ? String(file.extractedText).slice(0, 8000) : '',
      aiSummary: file.aiSummary || '',
      keyPoints: Array.isArray(file.keyPoints) ? file.keyPoints : [],
      course: file.courseId
        ? {
            id: String(file.courseId._id),
            title: file.courseId.title,
          }
        : null,
    },
  };
}

export async function loadExamContext(userId, examId) {
  const exam = await Exam.findOne({ _id: examId, userId }).populate('courseId', 'title teacher semester color').lean();
  if (!exam) return null;

  const courseId = exam.courseId?._id;
  const [tasks, files, schedule] = await Promise.all([
    courseId
      ? Task.find({ userId, courseId }).sort({ deadline: 1 }).limit(20).populate('courseId', 'title').lean()
      : Promise.resolve([]),
    courseId
      ? File.find({ userId, courseId }).sort({ uploadedAt: -1 }).limit(10).populate('courseId', 'title').lean()
      : Promise.resolve([]),
    ScheduleEvent.find({ userId, examId }).sort({ start: 1 }).populate('courseId', 'title').lean(),
  ]);

  return {
    exam: {
      id: String(exam._id),
      title: exam.title,
      description: exam.description || '',
      examDate: toIsoDate(exam.examDate),
      type: exam.type || 'exam',
      priority: exam.priority || 'medium',
      status: exam.status || 'upcoming',
      topics: Array.isArray(exam.topics) ? exam.topics : [],
      location: exam.location || '',
      notes: exam.notes || '',
      aiPreparationPlan: exam.aiPreparationPlan || '',
      course: exam.courseId
        ? {
            id: String(exam.courseId._id),
            title: exam.courseId.title,
            teacher: exam.courseId.teacher || '',
            semester: exam.courseId.semester || '',
          }
        : null,
    },
    tasks: mapTasks(tasks),
    files: mapFiles(files),
    schedule: mapSchedule(schedule),
  };
}

export async function loadTaskContext(userId, filters = {}) {
  const query = { userId };

  if (Array.isArray(filters.taskIds) && filters.taskIds.length) {
    query._id = { $in: filters.taskIds };
  }

  if (filters.courseId) {
    query.courseId = filters.courseId;
  }

  if (filters.status) {
    query.status = filters.status;
  }

  if (filters.priority) {
    query.priority = filters.priority;
  }

  const tasks = await Task.find(query)
    .sort({ deadline: 1, updatedAt: -1 })
    .limit(Math.max(1, Math.min(50, Number(filters.limit) || 20)))
    .populate('courseId', 'title teacher semester color')
    .lean();

  return {
    tasks: mapTasks(tasks),
  };
}

export function toAiContextSnapshot(baseContext, extra = {}) {
  return {
    user: {
      profile: baseContext.profile
        ? {
            fullName: baseContext.profile.fullName || '',
            bio: baseContext.profile.bio || '',
            university: baseContext.profile.university || '',
            program: baseContext.profile.program || '',
            fieldOfStudy: baseContext.profile.fieldOfStudy || '',
            academicYear: baseContext.profile.academicYear || '',
            studentId: baseContext.profile.studentId || '',
          }
        : null,
      studyPreferences: baseContext.studyPreferences
        ? {
            preferredStudyHours: baseContext.studyPreferences.preferredStudyHours || '',
            preferredDays: Array.isArray(baseContext.studyPreferences.preferredDays) ? baseContext.studyPreferences.preferredDays : [],
            focusSessionLength: baseContext.studyPreferences.focusSessionLength || 90,
            breakLength: baseContext.studyPreferences.breakLength || 15,
            revisionStyle: baseContext.studyPreferences.revisionStyle || '',
            difficultyPreference: baseContext.studyPreferences.difficultyPreference || '',
            examPreparationMode: baseContext.studyPreferences.examPreparationMode || '',
            language: baseContext.studyPreferences.language || '',
            aiAssistantTone: baseContext.studyPreferences.aiAssistantTone || '',
            autoScheduleSessions: Boolean(baseContext.studyPreferences.autoScheduleSessions),
            includeBufferTime: Boolean(baseContext.studyPreferences.includeBufferTime),
            smartRescheduling: Boolean(baseContext.studyPreferences.smartRescheduling),
            weekendStudy: Boolean(baseContext.studyPreferences.weekendStudy),
          }
        : null,
      subscription: baseContext.subscription
        ? {
            plan: baseContext.subscription.plan || 'free',
            status: baseContext.subscription.status || 'trial',
            tokenLimit: Number(baseContext.subscription.tokenLimit) || 0,
          }
        : null,
    },
    courses: baseContext.courses || [],
    tasks: baseContext.tasks || [],
    exams: baseContext.exams || [],
    files: baseContext.files || [],
    schedule: baseContext.schedule || [],
    ...extra,
  };
}
