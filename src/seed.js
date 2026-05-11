import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

// ─── Models ───────────────────────────────────────────────────────────────────
import User from './models/User.js';
import Course from './models/Course.js';
import Task from './models/Task.js';
import Exam from './models/Exam.js';
import ScheduleEvent from './models/ScheduleEvent.js';
import Subscription from './models/Subscription.js';
import StudySession from './models/StudySession.js';
import File from './models/File.js';
import TokenTransaction from './models/TokenTransaction.js';

const now = new Date();
const d = (offsetDays, h = 0, m = 0) => {
  const dt = new Date(now);
  dt.setDate(dt.getDate() + offsetDays);
  dt.setHours(h, m, 0, 0);
  return dt;
};

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  // ── Wipe existing test data ──────────────────────────────────────────────────
  await Promise.all([
    User.deleteMany({ email: /planify-test/ }),
    Course.deleteMany({}),
    Task.deleteMany({}),
    Exam.deleteMany({}),
    ScheduleEvent.deleteMany({}),
    Subscription.deleteMany({}),
    StudySession.deleteMany({}),
    File.deleteMany({}),
    TokenTransaction.deleteMany({}),
  ]);
  console.log('🗑️  Cleared old test data');

  // ── User ────────────────────────────────────────────────────────────────────
  const hashedPassword = await bcrypt.hash('Test@1234', 10);
  const [user] = await User.insertMany([{
    name: 'Amine Benkhalil',
    email: 'planify-test@student.dz',
    password: hashedPassword,
    role: 'student',
    plan: 'student',
    tokenBalance: 8450,
    isVerified: true,
    isActive: true,
    lastLoginAt: d(-1),
    trialStartedAt: d(-30),
    trialEndsAt: d(30),
  }]);
  console.log(`👤 User: ${user.email}`);

  // ── Subscription ─────────────────────────────────────────────────────────────
  await Subscription.create({
    userId: user._id,
    plan: 'student',
    status: 'active',
    startedAt: d(-30),
    endsAt: d(335),
    nextBillingDate: d(30),
    billingCycle: 'monthly',
    price: 4.99,
    currency: 'USD',
    tokenLimit: 50000,
    autoRenew: true,
    features: ['AI Assistant', 'Unlimited Tasks', 'File Upload', 'Analytics'],
  });

  // ── Courses ──────────────────────────────────────────────────────────────────
  const coursesData = [
    { title: 'Algorithms & Data Structures', teacher: 'Dr. Larbi', room: 'B201', color: '#4f46e5', progress: 72, semester: 'S4', tags: ['algorithms', 'cs'], totalTasks: 4, totalExams: 2 },
    { title: 'Database Systems',             teacher: 'Mme. Hadjadj', room: 'A105', color: '#0ea5e9', progress: 55, semester: 'S4', tags: ['sql', 'nosql'], totalTasks: 3, totalExams: 1 },
    { title: 'Web Development',              teacher: 'M. Bouzid',    room: 'Lab3', color: '#10b981', progress: 88, semester: 'S4', tags: ['vue', 'node'],  totalTasks: 5, totalExams: 1 },
    { title: 'Computer Networks',            teacher: 'Dr. Messaoud', room: 'C310', color: '#f59e0b', progress: 40, semester: 'S4', tags: ['tcp/ip', 'http'], totalTasks: 2, totalExams: 2 },
    { title: 'Software Engineering',         teacher: 'Mme. Kaci',    room: 'B305', color: '#8b5cf6', progress: 60, semester: 'S4', tags: ['agile', 'uml'], totalTasks: 3, totalExams: 1 },
  ];

  const courses = await Course.insertMany(
    coursesData.map(c => ({ ...c, userId: user._id, status: 'active', priority: 'high' }))
  );
  console.log(`📚 ${courses.length} courses inserted`);

  const [cAlgo, cDB, cWeb, cNet, cSE] = courses;

  // ── Tasks ────────────────────────────────────────────────────────────────────
  const tasksData = [
    { title: 'Implement AVL Tree balancing',          courseId: cAlgo._id, status: 'in_progress', priority: 'high',   deadline: d(3),  progress: 60, tags: ['algo', 'tree'] },
    { title: 'Write Dijkstra shortest path report',  courseId: cAlgo._id, status: 'todo',        priority: 'medium', deadline: d(7),  progress: 0,  tags: ['graph'] },
    { title: 'Design ER Diagram for library system', courseId: cDB._id,   status: 'completed',   priority: 'high',   deadline: d(-2), progress: 100, completedAt: d(-2), tags: ['sql'] },
    { title: 'Write SQL queries for CRUD ops',       courseId: cDB._id,   status: 'review',      priority: 'medium', deadline: d(1),  progress: 90, tags: ['sql', 'nosql'] },
    { title: 'Build REST API with Express',          courseId: cWeb._id,  status: 'completed',   priority: 'high',   deadline: d(-5), progress: 100, completedAt: d(-5), tags: ['node', 'api'] },
    { title: 'Build Vue.js Dashboard UI',            courseId: cWeb._id,  status: 'in_progress', priority: 'high',   deadline: d(2),  progress: 75, tags: ['vue', 'ui'] },
    { title: 'Configure CORS & JWT Auth',            courseId: cWeb._id,  status: 'completed',   priority: 'medium', deadline: d(-3), progress: 100, completedAt: d(-3) },
    { title: 'Simulate TCP 3-way handshake',         courseId: cNet._id,  status: 'todo',        priority: 'low',    deadline: d(10), progress: 0  },
    { title: 'Write UML class diagrams (PFA)',       courseId: cSE._id,   status: 'in_progress', priority: 'high',   deadline: d(4),  progress: 50, tags: ['uml', 'pfa'] },
    { title: 'Prepare sprint planning document',    courseId: cSE._id,   status: 'todo',        priority: 'medium', deadline: d(6),  progress: 0,  aiSuggested: true, source: 'ai' },
  ];

  const tasks = await Task.insertMany(
    tasksData.map(t => ({ ...t, userId: user._id, source: t.source || 'manual', estimatedDuration: 90 }))
  );
  console.log(`✅ ${tasks.length} tasks inserted`);

  // ── Exams ────────────────────────────────────────────────────────────────────
  const examsData = [
    { title: 'Algo Mid-Semester Exam',       courseId: cAlgo._id, examDate: d(8),   startTime: '09:00', endTime: '11:00', location: 'Amphi A', type: 'exam',         priority: 'high',   revisionProgress: 45, status: 'upcoming', topics: ['Sorting', 'Trees', 'Graphs'] },
    { title: 'Database Quiz #2',             courseId: cDB._id,   examDate: d(3),   startTime: '14:00', endTime: '15:00', location: 'B201',    type: 'quiz',         priority: 'medium', revisionProgress: 70, status: 'upcoming', topics: ['SQL Joins', 'Normalization'] },
    { title: 'Web Dev TP Evaluation',        courseId: cWeb._id,  examDate: d(-7),  startTime: '10:00', endTime: '12:00', location: 'Lab3',    type: 'tp',           priority: 'high',   revisionProgress: 100, status: 'completed', topics: ['Vue.js', 'REST API'] },
    { title: 'Networks Final Exam',          courseId: cNet._id,  examDate: d(21),  startTime: '08:30', endTime: '10:30', location: 'Amphi B', type: 'exam',         priority: 'high',   revisionProgress: 20, status: 'upcoming', topics: ['OSI Model', 'TCP/IP', 'Routing'] },
    { title: 'Software Engineering TD',      courseId: cSE._id,   examDate: d(14),  startTime: '13:00', endTime: '14:30', location: 'C305',    type: 'td',           priority: 'medium', revisionProgress: 30, status: 'upcoming', topics: ['Agile', 'SCRUM', 'UML'] },
    { title: 'Algo Final Exam',              courseId: cAlgo._id, examDate: d(35),  startTime: '09:00', endTime: '12:00', location: 'Amphi A', type: 'exam',         priority: 'high',   revisionProgress: 10, status: 'upcoming', topics: ['All chapters'] },
  ];

  const exams = await Exam.insertMany(
    examsData.map(e => ({ ...e, userId: user._id }))
  );
  console.log(`📝 ${exams.length} exams inserted`);

  // ── Schedule Events (full week) ───────────────────────────────────────────
  // d(offsetDays, h, m) → Date relative to today.
  // Day offsets are calculated so Mon=start of current week.
  const dayOfWeek = now.getDay(); // 0=Sun…6=Sat
  const toMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // days to subtract to reach Monday
  const w = (dayOffset, h, m = 0) => d(toMon + dayOffset, h, m);

  const scheduleData = [
    // ── Monday ───────────────────────────────────────────────────────────────
    { title: 'Algorithms Lecture',         courseId: cAlgo._id, type: 'course',        start: w(0,  8,  0), end: w(0, 10,  0), location: 'Amphi A',  color: '#4f46e5' },
    { title: 'Study Session',              courseId: cAlgo._id, type: 'study_session', start: w(0, 10, 30), end: w(0, 12,  0), location: 'Library',  color: '#10b981' },
    { title: 'Lunch Break',                                      type: 'break',         start: w(0, 12,  0), end: w(0, 13,  0),                        color: '#94a3b8' },
    { title: 'Implement AVL Tree',         courseId: cAlgo._id, type: 'task',          start: w(0, 13,  0), end: w(0, 15,  0), location: 'Home',     color: '#f97316' },
    { title: 'Study Session',              courseId: cDB._id,   type: 'study_session', start: w(0, 15,  0), end: w(0, 17,  0), location: 'Library',  color: '#10b981' },
    { title: 'Database Systems TD',        courseId: cDB._id,   type: 'td',            start: w(0, 17,  0), end: w(0, 18, 30), location: 'B201',     color: '#0ea5e9' },
    { title: 'Break',                                            type: 'break',         start: w(0, 19,  0), end: w(0, 19, 30),                        color: '#94a3b8' },
    { title: 'Review Notes',               courseId: cAlgo._id, type: 'study_session', start: w(0, 20,  0), end: w(0, 21,  0),                        color: '#10b981' },

    // ── Tuesday ──────────────────────────────────────────────────────────────
    { title: 'Database Systems TD',        courseId: cDB._id,   type: 'td',            start: w(1,  8,  0), end: w(1,  9,  0), location: 'B201',     color: '#0ea5e9' },
    { title: 'Computer Networks Lecture',  courseId: cNet._id,  type: 'course',        start: w(1,  9,  0), end: w(1, 10, 30), location: 'C310',     color: '#f59e0b' },
    { title: 'Study Session',              courseId: cNet._id,  type: 'study_session', start: w(1, 10, 30), end: w(1, 12,  0), location: 'Library',  color: '#10b981' },
    { title: 'Lunch Break',                                      type: 'break',         start: w(1, 12,  0), end: w(1, 13,  0),                        color: '#94a3b8' },
    { title: 'Study Session',              courseId: cDB._id,   type: 'study_session', start: w(1, 13,  0), end: w(1, 15,  0), location: 'Library',  color: '#10b981' },
    { title: 'Web Dev TP',                 courseId: cWeb._id,  type: 'tp',            start: w(1, 15,  0), end: w(1, 17,  0), location: 'Lab3',     color: '#10b981' },
    { title: 'Flashcards Review',          courseId: cDB._id,   type: 'study_session', start: w(1, 17,  0), end: w(1, 18,  0),                        color: '#10b981' },
    { title: 'Break',                                            type: 'break',         start: w(1, 19,  0), end: w(1, 19, 30),                        color: '#94a3b8' },
    { title: 'Read Chapter 3',             courseId: cNet._id,  type: 'task',          start: w(1, 20,  0), end: w(1, 21,  0),                        color: '#f97316' },

    // ── Wednesday ────────────────────────────────────────────────────────────
    { title: 'Database Quiz #2',           courseId: cDB._id,   type: 'exam',          start: w(2,  0,  0), end: w(2,  0,  0), location: 'B201',     color: '#f43f5e', examId: exams[1]._id },
    { title: 'Algorithms Lecture',         courseId: cAlgo._id, type: 'course',        start: w(2,  9,  0), end: w(2, 11,  0), location: 'Amphi A',  color: '#4f46e5' },
    { title: 'Study Session',              courseId: cDB._id,   type: 'study_session', start: w(2, 11,  0), end: w(2, 12,  0), location: 'Library',  color: '#10b981' },
    { title: 'Lunch Break',                                      type: 'break',         start: w(2, 12,  0), end: w(2, 13,  0),                        color: '#94a3b8' },
    { title: 'Algo Revision Session',      courseId: cAlgo._id, type: 'study_session', start: w(2, 13,  0), end: w(2, 14, 30), location: 'Library',  color: '#10b981', aiSuggested: true },
    { title: 'Study Session',              courseId: cSE._id,   type: 'study_session', start: w(2, 15,  0), end: w(2, 17,  0), location: 'Library',  color: '#10b981' },
    { title: 'Write UML Diagrams',         courseId: cSE._id,   type: 'task',          start: w(2, 17,  0), end: w(2, 18,  0),                        color: '#f97316' },
    { title: 'Break',                                            type: 'break',         start: w(2, 19,  0), end: w(2, 19, 30),                        color: '#94a3b8' },

    // ── Thursday ─────────────────────────────────────────────────────────────
    { title: 'Database Systems TD',        courseId: cDB._id,   type: 'td',            start: w(3,  8,  0), end: w(3,  9,  0), location: 'B201',     color: '#0ea5e9' },
    { title: 'Study Session',              courseId: cAlgo._id, type: 'study_session', start: w(3, 11,  0), end: w(3, 12,  0), location: 'Library',  color: '#10b981' },
    { title: 'Lunch Break',                                      type: 'break',         start: w(3, 12,  0), end: w(3, 13,  0),                        color: '#94a3b8' },
    { title: 'Build Vue.js Dashboard',     courseId: cWeb._id,  type: 'task',          start: w(3, 13,  0), end: w(3, 14,  0),                        color: '#f97316' },
    { title: 'Web Dev TP',                 courseId: cWeb._id,  type: 'tp',            start: w(3, 15,  0), end: w(3, 17,  0), location: 'Lab3',     color: '#10b981' },
    { title: 'Study Session',              courseId: cNet._id,  type: 'study_session', start: w(3, 17,  0), end: w(3, 18, 30), location: 'Library',  color: '#10b981' },
    { title: 'Break',                                            type: 'break',         start: w(3, 19,  0), end: w(3, 19, 30),                        color: '#94a3b8' },
    { title: 'Read Chapter 4',             courseId: cNet._id,  type: 'task',          start: w(3, 20,  0), end: w(3, 21,  0),                        color: '#f97316' },

    // ── Friday ───────────────────────────────────────────────────────────────
    { title: 'PFA Meeting',                courseId: cSE._id,   type: 'other',         start: w(4,  0,  0), end: w(4,  0,  0), location: 'B305',     color: '#8b5cf6' },
    { title: 'Computer Networks Lecture',  courseId: cNet._id,  type: 'course',        start: w(4,  9,  0), end: w(4, 10, 30), location: 'C310',     color: '#f59e0b' },
    { title: 'Study Session',              courseId: cSE._id,   type: 'study_session', start: w(4, 11,  0), end: w(4, 12,  0), location: 'Library',  color: '#10b981' },
    { title: 'Lunch Break',                                      type: 'break',         start: w(4, 12,  0), end: w(4, 13,  0),                        color: '#94a3b8' },
    { title: 'Past Papers Practice',       courseId: cAlgo._id, type: 'study_session', start: w(4, 13,  0), end: w(4, 15,  0),                        color: '#10b981' },
    { title: 'Weekly Review & Plan',       courseId: cSE._id,   type: 'study_session', start: w(4, 17,  0), end: w(4, 18, 30),                        color: '#10b981' },
    { title: 'Break',                                            type: 'break',         start: w(4, 19,  0), end: w(4, 19, 30),                        color: '#94a3b8' },

    // ── Saturday ─────────────────────────────────────────────────────────────
    { title: 'Deep Study Session',         courseId: cAlgo._id, type: 'study_session', start: w(5,  9,  0), end: w(5, 11,  0), location: 'Library',  color: '#10b981' },
    { title: 'Lunch Break',                                      type: 'break',         start: w(5, 12,  0), end: w(5, 13,  0),                        color: '#94a3b8' },
    { title: 'Problem Solving Practice',   courseId: cAlgo._id, type: 'study_session', start: w(5, 13,  0), end: w(5, 15,  0),                        color: '#10b981' },
    { title: 'Flashcards Review',          courseId: cDB._id,   type: 'study_session', start: w(5, 15,  0), end: w(5, 16, 30),                        color: '#10b981' },

    // ── Sunday ───────────────────────────────────────────────────────────────
    { title: 'Plan Next Week',             courseId: cSE._id,   type: 'task',          start: w(6,  9,  0), end: w(6, 10,  0),                        color: '#f97316' },
    { title: 'Organize Notes',             courseId: cAlgo._id, type: 'task',          start: w(6, 15,  0), end: w(6, 16,  0),                        color: '#f97316' },
    { title: 'Prepare Sprint Document',    courseId: cSE._id,   type: 'task',          start: w(6, 16, 30), end: w(6, 18,  0),                        color: '#f97316' },

    // ── Next-week exams (always useful for the upcoming panel) ────────────────
    { title: 'Algo Mid-Semester Exam',     courseId: cAlgo._id, type: 'exam',          start: d(8,  9,  0), end: d(8, 11,  0), location: 'Amphi A',  color: '#f43f5e', examId: exams[0]._id },
  ];

  const events = await ScheduleEvent.insertMany(
    scheduleData.map(e => ({
      ...e,
      userId:     user._id,
      status:     'scheduled',
      recurrence: { enabled: false, frequency: 'none' },
    }))
  );
  console.log(`📅 ${events.length} schedule events inserted`);


  // ── Study Sessions ────────────────────────────────────────────────────────────
  await StudySession.insertMany([
    { userId: user._id, courseId: cAlgo._id, title: 'Sorting Algorithms Review', startTime: d(-3, 18, 0), endTime: d(-3, 20, 0), duration: 120, focusScore: 82, status: 'completed', productivityRating: 4, notes: 'Covered quicksort, mergesort and heapsort.' },
    { userId: user._id, courseId: cWeb._id,  title: 'Vue.js Reactivity Deep Dive', startTime: d(-1, 20, 0), endTime: d(-1, 22, 0), duration: 90, focusScore: 91, status: 'completed', productivityRating: 5, notes: 'Composables and Pinia store.' },
    { userId: user._id, courseId: cDB._id,   title: 'SQL Joins Practice', startTime: d(2, 19, 0), endTime: d(2, 21, 0), duration: 120, status: 'planned', aiSuggested: true },
    { userId: user._id, courseId: cAlgo._id, title: 'Graph Algorithms Session', startTime: d(5, 18, 0), endTime: d(5, 20, 30), duration: 150, status: 'planned', aiSuggested: true },
  ]);
  console.log(`📖 Study sessions inserted`);

  // ── Files ─────────────────────────────────────────────────────────────────────
  await File.insertMany([
    { userId: user._id, courseId: cAlgo._id, originalName: 'Algo_Chapter3_Trees.pdf',      fileName: 'algo_ch3_trees.pdf',      mimeType: 'application/pdf', extension: 'pdf', size: 2048576, path: '/uploads/algo_ch3_trees.pdf',      type: 'pdf',   status: 'processed', tags: ['trees', 'algo'],   aiSummary: 'Covers AVL, Red-Black trees and B-trees with complexity analysis.' },
    { userId: user._id, courseId: cDB._id,   originalName: 'DB_Normalization_Slides.pptx', fileName: 'db_normalization.pptx',   mimeType: 'application/vnd.ms-powerpoint', extension: 'pptx', size: 1536000, path: '/uploads/db_normalization.pptx', type: 'pptx',  status: 'uploaded', tags: ['sql', 'normalization'] },
    { userId: user._id, courseId: cWeb._id,  originalName: 'PFA_Backend_Report.docx',      fileName: 'pfa_backend_report.docx', mimeType: 'application/msword', extension: 'docx', size: 870400, path: '/uploads/pfa_backend_report.docx', type: 'docx',  status: 'processed', tags: ['pfa', 'report'] },
    { userId: user._id, courseId: cNet._id,  originalName: 'Networks_OSI_Model.pdf',       fileName: 'networks_osi.pdf',        mimeType: 'application/pdf', extension: 'pdf', size: 983040, path: '/uploads/networks_osi.pdf',          type: 'pdf',   status: 'processed', tags: ['osi', 'networking'] },
  ]);
  console.log(`📁 Files inserted`);

  // ── Token Transactions ────────────────────────────────────────────────────────
  const txns = [
    { type: 'bonus',    amount: 10000, reason: 'Welcome bonus on signup',             balanceBefore: 0,     balanceAfter: 10000 },
    { type: 'usage',    amount: -150,  reason: 'AI summary for Algo_Chapter3.pdf',     balanceBefore: 10000, balanceAfter: 9850  },
    { type: 'usage',    amount: -250,  reason: 'AI study plan generation',             balanceBefore: 9850,  balanceAfter: 9600  },
    { type: 'usage',    amount: -300,  reason: 'AI exam preparation plan',             balanceBefore: 9600,  balanceAfter: 9300  },
    { type: 'purchase', amount: 500,   reason: 'Token top-up – 500 tokens pack',       balanceBefore: 9300,  balanceAfter: 9800  },
    { type: 'usage',    amount: -200,  reason: 'AI task suggestions (sprint planning)',balanceBefore: 9800,  balanceAfter: 9600  },
    { type: 'usage',    amount: -1150, reason: 'Multiple AI assistant queries',        balanceBefore: 9600,  balanceAfter: 8450  },
  ];
  await TokenTransaction.insertMany(txns.map(t => ({ ...t, userId: user._id })));
  console.log(`💰 Token transactions inserted`);

  console.log('\n🎉 Seed complete!');
  console.log('─────────────────────────────────────');
  console.log(`  Email   : planify-test@student.dz`);
  console.log(`  Password: Test@1234`);
  console.log('─────────────────────────────────────');
  await mongoose.disconnect();
}

seed().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
