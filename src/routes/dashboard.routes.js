import express from 'express'
import { protect } from '../middlewares/auth.middleware.js'
import { getDashboardSummary } from '../controllers/dashboard.controller.js'

const router = express.Router()

router.use(protect)

router.get('/summary', getDashboardSummary)

export default router
