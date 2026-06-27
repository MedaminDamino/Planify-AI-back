import express from 'express';
import { protect } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import {
  chat,
  dashboardRecommendations,
  generateDailyPlan,
  generateScheduleBuilder,
  generateExercises,
  getAIConversations,
  getAIHistory,
  getScheduleBuilderConversations,
  getScheduleBuilderHistory,
  getTokenCosts,
  prioritizeTasks,
  revisionPlan,
  summarizeFile,
  scheduleBuilderChat,
  summarize,
} from '../controllers/ai.controller.js';
import {
  aiChatSchema,
  aiDailyPlanSchema,
  aiDashboardRecommendationsSchema,
  aiGenerateExercisesSchema,
  aiPrioritizeTasksSchema,
  aiScheduleBuilderChatSchema,
  aiScheduleBuilderGenerateSchema,
  aiRevisionPlanSchema,
  aiSummarizeFileSchema,
} from '../validations/ai.validation.js';

const router = express.Router();

router.use(protect);

router.get('/history', getAIHistory);
router.get('/conversations', getAIConversations);
router.get('/schedule-builder/history', getScheduleBuilderHistory);
router.get('/schedule-builder/conversations', getScheduleBuilderConversations);
router.get('/costs', (req, res) => res.json({ success: true, data: getTokenCosts() }));

router.post('/daily-plan', validate(aiDailyPlanSchema), generateDailyPlan);
router.post('/summarize-file', validate(aiSummarizeFileSchema), summarizeFile);
router.post('/summarize', validate(aiSummarizeFileSchema), summarize);
router.post('/generate-exercises', validate(aiGenerateExercisesSchema), generateExercises);
router.post('/prioritize-tasks', validate(aiPrioritizeTasksSchema), prioritizeTasks);
router.post('/revision-plan', validate(aiRevisionPlanSchema), revisionPlan);
router.post('/chat', validate(aiChatSchema), chat);
router.post('/dashboard-recommendations', validate(aiDashboardRecommendationsSchema), dashboardRecommendations);
router.post('/schedule-builder/chat', validate(aiScheduleBuilderChatSchema), scheduleBuilderChat);
router.post('/schedule-builder/generate', validate(aiScheduleBuilderGenerateSchema), generateScheduleBuilder);

export default router;
