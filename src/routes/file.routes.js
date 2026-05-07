import express from 'express';
import { getFiles, uploadFile, getFile, deleteFile } from '../controllers/file.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { upload } from '../middlewares/upload.middleware.js';

const router = express.Router();

router.use(protect);

router.get('/', getFiles);
router.post('/upload', upload.single('file'), uploadFile);
router.get('/:id', getFile);
router.delete('/:id', deleteFile);

export default router;
