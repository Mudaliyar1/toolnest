const path = require('path');
const { fileTypeFromFile } = require('file-type');

const allowedExtensions = new Map([
  ['pdf', ['.pdf']],
  ['image', ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']],
  ['video', ['.mp4', '.mov', '.webm', '.mkv', '.gif']],
  ['audio', ['.mp3', '.wav', '.aac', '.flac', '.ogg', '.m4a']]
]);

const allowedMimePrefixes = new Map([
  ['pdf', ['application/pdf']],
  ['image', ['image/']],
  ['video', ['video/', 'audio/', 'image/gif']],
  ['audio', ['audio/']]
]);

async function validateUploadedFile(filePath, originalName, category) {
  const extension = path.extname(originalName).toLowerCase();
  const safeExtensions = allowedExtensions.get(category) || [];
  const safeMimePrefixes = allowedMimePrefixes.get(category) || [];
  const detectedType = await fileTypeFromFile(filePath);

  if (!safeExtensions.includes(extension)) {
    return { ok: false, reason: 'Unsupported file extension.' };
  }

  if (!detectedType) {
    return { ok: false, reason: 'Unable to verify file signature.' };
  }

  const mimeMatches = safeMimePrefixes.some((prefix) => detectedType.mime.startsWith(prefix));
  if (!mimeMatches) {
    return { ok: false, reason: 'Unsupported file type.' };
  }

  return {
    ok: true,
    detectedType,
    extension
  };
}

module.exports = {
  allowedExtensions,
  allowedMimePrefixes,
  validateUploadedFile
};
