const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure tmp upload directory exists
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max bounds
  fileFilter: (req, file, cb) => {
    // 1. Check MIME type (Safe)
    const allowedMimePrefixes = ['image/', 'video/'];
    const isAllowedMime = allowedMimePrefixes.some(prefix => file.mimetype.startsWith(prefix));

    // 2. Check Extension (Defense-in-depth)
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm', '.ogg'];
    const ext = path.extname(file.originalname).toLowerCase();
    const isAllowedExt = allowedExtensions.includes(ext);

    if (isAllowedMime && isAllowedExt) {
      return cb(null, true);
    } else {
      cb(new Error(`Security block: File type '${file.mimetype}' with extension '${ext}' is not allowed.`));
    }
  }
});

module.exports = upload;
