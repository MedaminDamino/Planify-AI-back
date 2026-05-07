import File from '../models/File.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import path from 'path';
import fs from 'fs';

const MIME_TO_TYPE = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xlsx',
  'image/png': 'image',
  'image/jpeg': 'image',
};

// GET /api/files
export const getFiles = asyncHandler(async (req, res) => {
  const files = await File.find({ userId: req.user._id }).sort({ uploadedAt: -1 });
  res.json({ success: true, count: files.length, data: files });
});

// POST /api/files/upload
export const uploadFile = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'No file provided');

  const { courseId, description, tags } = req.body;
  const ext = path.extname(req.file.originalname).replace('.', '').toLowerCase();

  const fileDoc = await File.create({
    userId: req.user._id,
    courseId: courseId || undefined,
    originalName: req.file.originalname,
    fileName: req.file.filename,
    mimeType: req.file.mimetype,
    extension: ext,
    size: req.file.size,
    path: req.file.path,
    url: `/uploads/${req.file.filename}`,
    storageProvider: 'local',
    type: MIME_TO_TYPE[req.file.mimetype] || 'other',
    description: description || '',
    tags: tags ? (Array.isArray(tags) ? tags : tags.split(',').map((t) => t.trim())) : [],
    status: 'uploaded',
  });

  res.status(201).json({ success: true, data: fileDoc });
});

// GET /api/files/:id
export const getFile = asyncHandler(async (req, res) => {
  const file = await File.findOne({ _id: req.params.id, userId: req.user._id });
  if (!file) throw new ApiError(404, 'File not found');
  res.json({ success: true, data: file });
});

// DELETE /api/files/:id
export const deleteFile = asyncHandler(async (req, res) => {
  const file = await File.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  if (!file) throw new ApiError(404, 'File not found');

  // Remove physical file if it exists
  if (file.path && fs.existsSync(file.path)) {
    fs.unlinkSync(file.path);
  }

  res.json({ success: true, message: 'File deleted' });
});
