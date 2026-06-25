import express from 'express';
import { getMe, updateMe, uploadAvatar } from '../controllers/user.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { upload } from '../middlewares/upload.middleware.js';

const router = express.Router();

router.use(protect);

router.get('/me', getMe);
router.put('/me', updateMe);

// Avatar upload: multer parses the multipart/form-data file field 'avatar',
// then uploadAvatar stores the URL on the User document.
router.post('/me/avatar', upload.single('avatar'), uploadAvatar);

export default router;
