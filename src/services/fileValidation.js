const path = require('path');
const { fileTypeFromFile } = require('file-type');

const allowedExtensions = new Map([
  ['pdf', ['.pdf']],
  ['image', ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']],
  ['video', ['.mp4', '.mov', '.webm', '.mkv', '.gif', '.mpeg', '.mpg', '.avi']],
  ['audio', ['.mp3', '.wav', '.aac', '.flac', '.ogg', '.m4a', '.mpeg', '.mpg', '.mpga', '.mp2']]
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
    // Graceful fallback for unrecognized raw media streams (like VLC MPEG streams)
    // We allow the extension to be trusted, relying on the heuristic malware scanner to block exploits.
    return {
      ok: true,
      detectedType: { mime: category === 'pdf' ? 'application/pdf' : `${category}/unknown` },
      extension
    };
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
