import Course from '../models/Course.js'
import Exam from '../models/Exam.js'
import File from '../models/File.js'
import Notification from '../models/Notification.js'
import Profile from '../models/Profile.js'
import ScheduleEvent from '../models/ScheduleEvent.js'
import Subscription from '../models/Subscription.js'
import Task from '../models/Task.js'
import { asyncHandler } from '../utils/asyncHandler.js'

function startOfDay(date = new Date()) {
  const value = new Date(date)
  value.setHours(0, 0, 0, 0)
  return value
}

function endOfDay(date = new Date()) {
  const value = new Date(date)
  value.setHours(23, 59, 59, 999)
  return value
}

function startOfWeek(date = new Date()) {
  const value = startOfDay(date)
  const day = value.getDay()
  const diff = day === 0 ? -6 : 1 - day
  value.setDate(value.getDate() + diff)
  return value
}

function endOfWeek(date = new Date()) {
  const value = startOfWeek(date)
  value.setDate(value.getDate() + 6)
  value.setHours(23, 59, 59, 999)
  return value
}

function formatBytes(bytes = 0) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function formatDateShort(date) {
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function getFirstName(name = 'User') {
  return String(name).trim().split(/\s+/)[0] || 'User'
}

function getGreeting(hour = new Date().getHours()) {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function calculateProductivity({ completedTasks, totalTasks, courses, completedEvents, totalEvents }) {
  const taskScore = totalTasks > 0 ? (completedTasks / totalTasks) * 45 : 0
  const courseScore = courses.length
    ? courses.reduce((sum, course) => sum + Math.max(0, Math.min(100, Number(course.progress) || 0)), 0) / courses.length * 0.35
    : 0
  const scheduleScore = totalEvents > 0 ? (completedEvents / totalEvents) * 20 : 0
  return Math.max(0, Math.min(100, Math.round(taskScore + courseScore + scheduleScore)))
}

function buildWeeklyActivity(weekStart, tasks, schedules) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart)
    day.setDate(day.getDate() + index)
    return {
      date: day,
      label: day.toLocaleDateString('en-US', { weekday: 'short' }),
      key: day.toISOString().slice(0, 10),
      value: 0
    }
  })

  const incrementByDay = (items, dateField) => {
    items.forEach((item) => {
      const date = item[dateField]
      if (!date) return
      const key = new Date(date).toISOString().slice(0, 10)
      const target = days.find((day) => day.key === key)
      if (target) target.value += 1
    })
  }

  incrementByDay(
    tasks.filter((task) => String(task.status || '').toLowerCase() === 'completed'),
    'completedAt'
  )

  incrementByDay(
    schedules.filter((schedule) => String(schedule.status || '').toLowerCase() === 'completed'),
    'start'
  )

  const maxValue = Math.max(1, ...days.map((day) => day.value))

  const weekRelevantTasks = tasks.filter((task) => {
    const sourceDate = task.completedAt || task.updatedAt || task.createdAt
    if (!sourceDate) return false
    const date = new Date(sourceDate)
    return date >= weekStart && date <= endOfWeek(weekStart)
  })

  return {
    percent: Math.max(
      0,
      Math.min(
        100,
        Math.round(
          (days.reduce((sum, day) => sum + day.value, 0) /
            Math.max(1, weekRelevantTasks.length + schedules.length)) * 100
        )
      )
    ),
    summary: `${tasks.filter((task) => String(task.status || '').toLowerCase() === 'completed').length} tasks and ${schedules.filter((schedule) => String(schedule.status || '').toLowerCase() === 'completed').length} sessions completed this week`,
    days: days.map((day) => ({
      label: day.label,
      value: day.value,
      height: Math.max(18, Math.round((day.value / maxValue) * 72)),
      highlight: day.value === maxValue && day.value > 0
    }))
  }
}

function buildRecommendations({
  pendingTasks,
  highPriorityTasks,
  nextExam,
  recentFiles,
  todaySchedule,
  courses
}) {
  const recommendations = []

  if (highPriorityTasks.length) {
    recommendations.push({
      id: 'priority-tasks',
      title: 'Start with your highest-priority task',
      description: `${highPriorityTasks[0].title} is still open and should be tackled first.`,
      icon: 'i-lucide-flag',
      tone: 'success',
      actionLabel: 'Open task',
      href: '/dashboard/tasks'
    })
  } else if (pendingTasks.length) {
    recommendations.push({
      id: 'pending-tasks',
      title: 'Clear one pending task now',
      description: `${pendingTasks.length} task${pendingTasks.length === 1 ? '' : 's'} remain in your queue.`,
      icon: 'i-lucide-check-circle-2',
      tone: 'primary',
      actionLabel: 'View tasks',
      href: '/dashboard/tasks'
    })
  }

  if (nextExam) {
    const examDate = new Date(nextExam.examDate)
    const daysLeft = Math.ceil((examDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    recommendations.push({
      id: 'exam-prep',
      title: `Prepare for ${nextExam.title}`,
      description: daysLeft <= 1
        ? 'The exam is imminent. Switch to revision mode and focus on core topics.'
        : `You have ${daysLeft} day${daysLeft === 1 ? '' : 's'} left before this exam.`,
      icon: 'i-lucide-book-check',
      tone: 'warning',
      actionLabel: 'Review exam',
      href: '/dashboard/exams'
    })
  }

  if (recentFiles.length) {
    const latestFile = recentFiles[0]
    recommendations.push({
      id: 'latest-file',
      title: `Summarize ${latestFile.originalName}`,
      description: 'Use AI to extract key points from your newest study file.',
      icon: 'i-lucide-file-text',
      tone: 'info',
      actionLabel: 'Open file',
      href: '/dashboard/files'
    })
  }

  if (!todaySchedule.length) {
    recommendations.push({
      id: 'focus-block',
      title: 'Reserve a focus block today',
      description: courses.length
        ? `You have ${courses.length} active course${courses.length === 1 ? '' : 's'} to choose from.`
        : 'Create a study block for the most important topic in your workflow.',
      icon: 'i-lucide-sparkles',
      tone: 'ai',
      actionLabel: 'Open schedule',
      href: '/dashboard/schedule'
    })
  }

  return recommendations.slice(0, 4)
}

function getNotificationTone(type = 'info') {
  if (['error'].includes(type)) return 'danger'
  if (['warning', 'task', 'exam'].includes(type)) return 'warning'
  if (['success'].includes(type)) return 'success'
  if (['ai', 'billing'].includes(type)) return 'ai'
  return 'info'
}

export const getDashboardSummary = asyncHandler(async (req, res) => {
  const now = new Date()
  const todayStart = startOfDay(now)
  const todayEnd = endOfDay(now)
  const weekStart = startOfWeek(now)
  const weekEnd = endOfWeek(now)

  const [
    profile,
    subscription,
    todaySchedule,
    weekSchedule,
    tasks,
    exams,
    recentFiles,
    allCourses,
    recentCourses,
    notifications,
    upcomingSchedules,
    upcomingExams
  ] = await Promise.all([
    Profile.findOne({ userId: req.user._id }).select('fullName university program fieldOfStudy academicYear bio tags profileCompletion').lean(),
    Subscription.findOne({ userId: req.user._id }).sort({ createdAt: -1 }).lean(),
    ScheduleEvent.find({
      userId: req.user._id,
      start: { $gte: todayStart, $lte: todayEnd }
    })
      .sort({ start: 1 })
      .populate('courseId', 'title teacher semester color')
      .populate('taskId', 'title priority status')
      .populate('examId', 'title examDate priority')
      .lean(),
    ScheduleEvent.find({
      userId: req.user._id,
      start: { $gte: weekStart, $lte: weekEnd }
    })
      .sort({ start: 1 })
      .populate('courseId', 'title teacher semester color')
      .lean(),
    Task.find({ userId: req.user._id })
      .sort({ updatedAt: -1 })
      .populate('courseId', 'title teacher semester color')
      .lean(),
    Exam.find({ userId: req.user._id })
      .sort({ examDate: 1 })
      .populate('courseId', 'title teacher semester color')
      .lean(),
    File.find({ userId: req.user._id })
      .sort({ uploadedAt: -1 })
      .limit(3)
      .populate('courseId', 'title')
      .lean(),
    Course.find({ userId: req.user._id })
      .sort({ updatedAt: -1 })
      .select('title teacher semester color status progress updatedAt')
      .lean(),
    Course.find({ userId: req.user._id })
      .sort({ updatedAt: -1 })
      .limit(3)
      .lean(),
    Notification.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
    ScheduleEvent.find({
      userId: req.user._id,
      start: { $gte: now }
    })
      .sort({ start: 1 })
      .limit(5)
      .populate('courseId', 'title teacher semester color')
      .populate('taskId', 'title priority status')
      .populate('examId', 'title examDate priority')
      .lean(),
    Exam.find({
      userId: req.user._id,
      status: 'upcoming',
      examDate: { $gte: now }
    })
      .sort({ examDate: 1 })
      .limit(5)
      .populate('courseId', 'title teacher semester color')
      .lean()
  ])

  const pendingTasks = tasks.filter((task) => ['todo', 'in_progress', 'review'].includes(String(task.status || '').toLowerCase()))
  const completedTasks = tasks.filter((task) => String(task.status || '').toLowerCase() === 'completed')
  const highPriorityTasks = pendingTasks.filter((task) => String(task.priority || '').toLowerCase() === 'high')
  const completedThisWeek = tasks.filter((task) => {
    if (String(task.status || '').toLowerCase() !== 'completed' || !task.completedAt) return false
    const completedAt = new Date(task.completedAt)
    return completedAt >= weekStart && completedAt <= weekEnd
  })

  const completedScheduleThisWeek = weekSchedule.filter((event) => String(event.status || '').toLowerCase() === 'completed')
  const courseProgressAverage = allCourses.length
    ? Math.round(allCourses.reduce((sum, course) => sum + (Number(course.progress) || 0), 0) / allCourses.length)
    : 0

  const stats = [
    {
      id: 'classes-today',
      label: 'Classes Today',
      value: String(todaySchedule.length),
      caption: todaySchedule.length
        ? `Next: ${formatTime(todaySchedule[0].start)}`
        : 'No events scheduled',
      tone: 'primary',
      icon: 'i-lucide-book-open'
    },
    {
      id: 'tasks-pending',
      label: 'Tasks Pending',
      value: String(pendingTasks.length),
      caption: highPriorityTasks.length
        ? `${highPriorityTasks.length} high priority`
        : 'All priorities balanced',
      tone: 'warning',
      icon: 'i-lucide-file-check-2'
    },
    {
      id: 'upcoming-exams',
      label: 'Upcoming Exams',
      value: String(exams.filter((exam) => String(exam.status || '').toLowerCase() === 'upcoming').length),
      caption: exams.length && exams[0]?.examDate
        ? `Next: ${formatDateShort(exams[0].examDate)}`
        : 'No upcoming exams',
      tone: 'info',
      icon: 'i-lucide-calendar-days'
    },
    {
      id: 'productivity',
      label: 'Productivity Score',
      value: `${calculateProductivity({
        completedTasks: completedTasks.length,
        totalTasks: tasks.length,
        courses: allCourses,
        completedEvents: completedScheduleThisWeek.length,
        totalEvents: weekSchedule.length
      })}%`,
      caption: courseProgressAverage ? `Avg course progress ${courseProgressAverage}%` : 'Keep building momentum',
      tone: 'success',
      icon: 'i-lucide-trending-up'
    }
  ]

  const upcomingEvents = [
    ...upcomingSchedules.map((event) => ({
      id: String(event._id),
      type: event.type,
      title: event.title,
      subtitle: event.courseId?.title || event.location || 'Scheduled session',
      date: event.start,
      time: formatTime(event.start),
      label: 'Schedule',
      tone: event.type === 'study_session' ? 'ai' : event.type === 'exam' ? 'warning' : 'primary',
      href: '/dashboard/schedule'
    })),
    ...upcomingExams.map((exam) => ({
      id: String(exam._id),
      type: 'exam',
      title: exam.title,
      subtitle: exam.courseId?.title || exam.location || 'Exam',
      date: exam.examDate,
      time: exam.startTime || 'All day',
      label: 'Exam',
      tone: 'warning',
      href: '/dashboard/exams'
    }))
  ]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 5)

  const weeklyProgress = buildWeeklyActivity(weekStart, tasks, weekSchedule)

  const summary = {
    greeting: getGreeting(),
    user: {
      id: String(req.user._id),
      name: req.user.name,
      firstName: getFirstName(req.user.name),
      email: req.user.email,
      avatar: req.user.avatar || null,
      role: req.user.role,
      location: req.user.location || profile?.location || null,
      university: profile?.university || null,
      program: profile?.program || profile?.fieldOfStudy || null,
      plan: req.user.plan || subscription?.plan || 'free',
      planLabel: subscription?.plan
        ? `${subscription.plan.charAt(0).toUpperCase()}${subscription.plan.slice(1)} Plan`
        : 'Free Plan',
      planStatus: subscription?.status || 'trial',
      tokenBalance: Number(req.user.tokenBalance) || 0,
      isVerified: Boolean(req.user.isVerified)
    },
    subscription: subscription
      ? {
          id: String(subscription._id),
          plan: subscription.plan,
          status: subscription.status,
          billingCycle: subscription.billingCycle,
          price: subscription.price,
          currency: subscription.currency,
          priceLabel: subscription.price ? `$${Number(subscription.price).toFixed(2)} / month` : undefined,
          tokenLimit: subscription.tokenLimit,
          autoRenew: subscription.autoRenew,
          nextBillingDate: subscription.nextBillingDate || subscription.endsAt || null,
          endsAt: subscription.endsAt || null
        }
      : null,
    stats,
    todaySchedule: todaySchedule.map((event) => ({
      id: String(event._id),
      title: event.title,
      description: event.description || '',
      type: event.type,
      start: event.start,
      end: event.end,
      time: formatTime(event.start),
      location: event.location || event.courseId?.title || '',
      color: event.color || null,
      aiSuggested: Boolean(event.aiSuggested),
      status: event.status,
      course: event.courseId
        ? {
            id: String(event.courseId._id),
            title: event.courseId.title,
            teacher: event.courseId.teacher || null,
            semester: event.courseId.semester || null,
            color: event.courseId.color || null
          }
        : null
    })),
    weeklyProgress,
    recommendations: buildRecommendations({
      pendingTasks,
      highPriorityTasks,
      nextExam: exams.find((exam) => String(exam.status || '').toLowerCase() === 'upcoming' && new Date(exam.examDate) >= now),
      recentFiles,
      todaySchedule,
      courses: recentCourses
    }),
    upcomingEvents,
    recentFiles: recentFiles.map((file) => ({
      id: String(file._id),
      name: file.originalName,
      type: file.type,
      size: file.size,
      sizeLabel: formatBytes(file.size),
      uploadedAt: file.uploadedAt || file.createdAt,
      course: file.courseId
        ? {
            id: String(file.courseId._id),
            title: file.courseId.title
          }
        : null
    })),
    recentCourses: recentCourses.map((course) => ({
      id: String(course._id),
      title: course.title,
      teacher: course.teacher || '',
      semester: course.semester || '',
      progress: Number(course.progress) || 0,
      color: course.color || null,
      status: course.status || 'active',
      updatedAt: course.updatedAt
    })),
    notifications: notifications.map((notification) => ({
      id: String(notification._id),
      title: notification.title,
      message: notification.message,
      type: notification.type,
      read: Boolean(notification.read),
      tone: getNotificationTone(notification.type),
      createdAt: notification.createdAt,
      actionUrl: notification.actionUrl || null
    })),
    counts: {
      tasksPending: pendingTasks.length,
      tasksCompleted: completedTasks.length,
      examsUpcoming: exams.filter((exam) => String(exam.status || '').toLowerCase() === 'upcoming').length,
      notificationsUnread: notifications.filter((notification) => !notification.read).length,
      todaySchedule: todaySchedule.length,
      courses: allCourses.length
    }
  }

  res.json({ success: true, data: summary })
})
