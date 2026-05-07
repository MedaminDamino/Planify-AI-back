import File from '../models/File.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { paginate } from '../utils/paginate.js';
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

// GET /api/files  (?search= &courseId= &type= &status= &page= &limit= &sort=)
export const getFiles = asyncHandler(async (req, res) => {
  const { search, courseId, type, status, page, limit, sort } = req.query;

  const filter = { userId: req.user._id };

  if (search) {
    filter.$or = [
      { originalName: { $regex: search, $options: 'i' } },
      { tags:         { $regex: search, $options: 'i' } },
    ];
  }
  if (courseId) filter.courseId = courseId;
  if (type)     filter.type     = type;
  if (status)   filter.status   = status;

  const sortMap = {
    newest:  { uploadedAt: -1 },
    oldest:  { uploadedAt:  1 },
    name:    { originalName: 1 },
    largest: { size: -1 },
  };
  const sortBy = sortMap[sort] || { uploadedAt: -1 };

  const result = await paginate(File, filter, { page, limit, sort: sortBy });

  res.json({ success: true, ...result });
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
