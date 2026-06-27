import express from 'express';
import { protect } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import {
  chat,
  dashboardRecommendations,
  generateDailyPlan,
  generateExercises,
  getAIConversations,
  getAIHistory,
  getTokenCosts,
  prioritizeTasks,
  revisionPlan,
  summarizeFile,
  summarize,
} from '../controllers/ai.controller.js';
import {
  aiChatSchema,
  aiDailyPlanSchema,
  aiDashboardRecommendationsSchema,
  aiGenerateExercisesSchema,
  aiPrioritizeTasksSchema,
  aiRevisionPlanSchema,
  aiSummarizeFileSchema,
} from '../validations/ai.validation.js';

const router = express.Router();

router.use(protect);

router.get('/history', getAIHistory);
router.get('/conversations', getAIConversations);
router.get('/costs', (req, res) => res.json({ success: true, data: getTokenCosts() }));

router.post('/daily-plan', validate(aiDailyPlanSchema), generateDailyPlan);
router.post('/summarize-file', validate(aiSummarizeFileSchema), summarizeFile);
router.post('/summarize', validate(aiSummarizeFileSchema), summarize);
router.post('/generate-exercises', validate(aiGenerateExercisesSchema), generateExercises);
router.post('/prioritize-tasks', validate(aiPrioritizeTasksSchema), prioritizeTasks);
router.post('/revision-plan', validate(aiRevisionPlanSchema), revisionPlan);
router.post('/chat', validate(aiChatSchema), chat);
router.post('/dashboard-recommendations', validate(aiDashboardRecommendationsSchema), dashboardRecommendations);

export default router;
