import express from 'express';
import { getFiles, uploadFile, getFile, deleteFile } from '../controllers/file.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { upload } from '../middlewares/upload.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { uploadMetaSchema } from '../validations/file.validation.js';

const router = express.Router();

router.use(protect);

router.get('/', getFiles);

// multer runs first (validates file type/size), then Zod validates optional body fields
router.post('/upload', upload.single('file'), validate(uploadMetaSchema), uploadFile);

router.get('/:id', getFile);
router.delete('/:id', deleteFile);

export default router;
