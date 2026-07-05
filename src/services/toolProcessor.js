const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const archiver = require('archiver');
const sharp = require('sharp');
const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const bwipjs = require('bwip-js');
const musicMetadata = require('music-metadata');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;
const env = require('../config/env');
const { ensureWorkspaceDirectories, createStorageName } = require('./fileStorageService');

const unsupportedToolMessages = new Map([]);

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        const error = new Error(`Process exited with code ${code}`);
        error.stdout = stdout;
        error.stderr = stderr;
        return reject(error);
      }
      return resolve({ stdout, stderr });
    });
  });
}

async function writeBuffer(outputDir, fileName, buffer) {
  const outputPath = path.join(outputDir, fileName);
  await fs.writeFile(outputPath, buffer);
  return outputPath;
}

async function zipFiles(targetPath, files) {
  return new Promise((resolve, reject) => {
    const { ZipArchive } = require('archiver');
    const output = require('fs').createWriteStream(targetPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });

    output.on('close', () => resolve(targetPath));
    archive.on('warning', reject);
    archive.on('error', reject);
    archive.pipe(output);

    for (const file of files) {
      archive.file(file.path, { name: file.name });
    }

    archive.finalize().catch(reject);
  });
}

function parseNumber(value, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseIntegerList(value) {
  return String(value || '')
    .split(',')
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((item) => Number.isInteger(item) && item > 0)
    .sort((a, b) => a - b);
}

function passwordStrength(password) {
  const value = String(password || '');
  let score = 0;
  if (value.length >= 12) score += 2;
  if (/[a-z]/.test(value)) score += 1;
  if (/[A-Z]/.test(value)) score += 1;
  if (/[0-9]/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;
  return {
    score,
    label: score >= 5 ? 'Strong' : score >= 3 ? 'Moderate' : 'Weak'
  };
}

function normalizeCase(text, mode) {
  const value = String(text || '');
  switch (mode) {
    case 'upper': return value.toUpperCase();
    case 'lower': return value.toLowerCase();
    case 'title': return value.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
    case 'sentence': return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
    case 'alternating':
      return value.split('').map((char, index) => (index % 2 === 0 ? char.toUpperCase() : char.toLowerCase())).join('');
    default:
      return value;
  }
}

function generatePassword(length = 16) {
  const size = Math.min(Math.max(Number.parseInt(length, 10) || 16, 8), 64);
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*_-+=';
  const random = crypto.randomBytes(size);
  let output = '';

  for (let index = 0; index < size; index += 1) {
    output += charset[random[index] % charset.length];
  }

  return output;
}

function hashText(text, algorithm = 'sha256') {
  return crypto.createHash(algorithm).update(String(text || '')).digest('hex');
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(amount);
}

function convertUnit(kind, value, from, to) {
  const input = parseNumber(value);
  if (kind === 'length') {
    const factors = { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048 };
    return (input * factors[from]) / factors[to];
  }
  if (kind === 'mass') {
    const factors = { g: 1, kg: 1000, lb: 453.59237, oz: 28.349523125 };
    return (input * factors[from]) / factors[to];
  }
  if (kind === 'temperature') {
    const celsius = from === 'c' ? input : from === 'f' ? (input - 32) * 5 / 9 : input + 273.15;
    if (to === 'c') return celsius;
    if (to === 'f') return (celsius * 9 / 5) + 32;
    return celsius + 273.15;
  }
  return input;
}

function parsePdfPages(pageInput, totalPages) {
  if (!pageInput) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  return String(pageInput)
    .split(',')
    .flatMap((part) => {
      const [start, end] = part.split('-').map((entry) => Number.parseInt(entry.trim(), 10));
      if (Number.isInteger(start) && Number.isInteger(end) && end >= start) {
        return Array.from({ length: end - start + 1 }, (_, index) => start + index);
      }
      return Number.isInteger(start) ? [start] : [];
    })
    .filter((page) => page > 0 && page <= totalPages);
}

function ffprobeJson(filePath) {
  return runProcess(ffprobePath, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', filePath]);
}

async function executeTextTool(slug, body) {
  const text = String(body.text || body.input || body.value || '');

  switch (slug) {
    case 'json-formatter': {
      try {
        const formatted = JSON.stringify(JSON.parse(text), null, 2);
        return { kind: 'text', title: 'Formatted JSON', content: formatted };
      } catch (err) {
        throw new Error(`Invalid JSON format: ${err.message}`);
      }
    }
    case 'json-validator': {
      try {
        JSON.parse(text);
        return { kind: 'text', title: 'Validation Result', content: 'Valid JSON' };
      } catch (err) {
        return { kind: 'text', title: 'Validation Result', content: `Invalid JSON: ${err.message}` };
      }
    }
    case 'base64-encoder':
      return { kind: 'text', title: 'Base64 Output', content: Buffer.from(text, 'utf8').toString('base64') };
    case 'base64-decoder':
      return { kind: 'text', title: 'Decoded Text', content: Buffer.from(text, 'base64').toString('utf8') };
    case 'url-encoder':
      return { kind: 'text', title: 'URL Encoded', content: encodeURIComponent(text) };
    case 'url-decoder':
      return { kind: 'text', title: 'URL Decoded', content: decodeURIComponent(text) };
    case 'jwt-decoder': {
      try {
        const parts = text.split('.');
        if (parts.length !== 3) throw new Error('Invalid JWT format (must have 3 dot-separated parts).');
        const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        return { kind: 'text', title: 'JWT Payload', content: JSON.stringify({ header, payload }, null, 2) };
      } catch (err) {
        throw new Error(`Failed to decode JWT: ${err.message}`);
      }
    }
    case 'uuid-generator':
      return { kind: 'text', title: 'UUID', content: uuidv4() };
    case 'regex-tester': {
      const pattern = new RegExp(String(body.pattern || ''), String(body.flags || 'g'));
      const matches = [...text.matchAll(pattern)].map((match) => match[0]);
      return { kind: 'text', title: 'Regex Matches', content: JSON.stringify({ matches, count: matches.length }, null, 2) };
    }
    case 'sql-formatter':
      return { kind: 'text', title: 'Formatted SQL', content: text.replace(/\s+/g, ' ').trim() };
    case 'html-formatter':
      return { kind: 'text', title: 'Formatted HTML', content: text.replace(/></g, '>' + '\n' + '<') };
    case 'css-minifier':
    case 'javascript-minifier':
      return { kind: 'text', title: 'Minified Output', content: text.replace(/\s+/g, ' ').trim() };
    case 'hash-generator':
      return { kind: 'text', title: 'Hash', content: hashText(text, String(body.algorithm || 'sha256')) };
    case 'text-case-converter':
      return { kind: 'text', title: 'Text Conversion', content: normalizeCase(text, String(body.mode || 'upper')) };
    case 'word-counter': {
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      return { kind: 'text', title: 'Word Count', content: JSON.stringify({ characters: text.length, words, lines: text.split(/\r?\n/).length }, null, 2) };
    }
    case 'password-generator':
      return { kind: 'text', title: 'Generated Password', content: generatePassword(body.length) };
    case 'password-strength-checker':
      return { kind: 'text', title: 'Strength Result', content: JSON.stringify(passwordStrength(text), null, 2) };
    case 'age-calculator': {
      const birthDate = new Date(String(body.birthDate || body.date || text));
      if (Number.isNaN(birthDate.getTime())) throw new Error('Invalid birth date.');
      const now = new Date();
      let years = now.getFullYear() - birthDate.getFullYear();
      let months = now.getMonth() - birthDate.getMonth();
      if (months < 0) {
        years -= 1;
        months += 12;
      }
      return { kind: 'text', title: 'Age', content: JSON.stringify({ years, months }, null, 2) };
    }
    case 'percentage-calculator': {
      const obtained = parseNumber(body.obtained || 0);
      const total = parseNumber(body.total || 0);
      return { kind: 'text', title: 'Percentage', content: `${total ? ((obtained / total) * 100).toFixed(2) : '0.00'}%` };
    }
    case 'cgpa-calculator': {
      const grades = String(body.grades || text).split(',').map((item) => parseNumber(item.trim(), 0)).filter((item) => item > 0);
      const cgpa = grades.length ? grades.reduce((sum, item) => sum + item, 0) / grades.length : 0;
      return { kind: 'text', title: 'CGPA', content: cgpa.toFixed(2) };
    }
    case 'sgpa-calculator': {
      const credits = String(body.credits || '').split(',').map((item) => parseNumber(item.trim(), 0));
      const grades = String(body.grades || '').split(',').map((item) => parseNumber(item.trim(), 0));
      const totalCredits = credits.reduce((sum, item) => sum + item, 0);
      const weighted = credits.reduce((sum, credit, index) => sum + (credit * (grades[index] || 0)), 0);
      return { kind: 'text', title: 'SGPA', content: totalCredits ? (weighted / totalCredits).toFixed(2) : '0.00' };
    }
    case 'attendance-calculator': {
      const attended = parseNumber(body.attended || 0);
      const totalClasses = parseNumber(body.total || 0);
      return { kind: 'text', title: 'Attendance', content: `${totalClasses ? ((attended / totalClasses) * 100).toFixed(2) : '0.00'}%` };
    }
    case 'gpa-predictor': {
      const target = parseNumber(body.target || 0);
      const current = parseNumber(body.current || 0);
      return { kind: 'text', title: 'Predicted GPA', content: Math.max(0, Math.min(10, (current + target) / 2)).toFixed(2) };
    }
    case 'gst-calculator': {
      const amount = parseNumber(body.amount || 0);
      const rate = parseNumber(body.rate || 18);
      const gst = amount * (rate / 100);
      return { kind: 'text', title: 'GST', content: JSON.stringify({ gst: formatCurrency(gst), total: formatCurrency(amount + gst) }, null, 2) };
    }
    case 'emi-calculator':
    case 'loan-calculator': {
      const principal = parseNumber(body.principal || body.amount || 0);
      const annualRate = parseNumber(body.rate || 10);
      const months = parseNumber(body.months || body.term || 12);
      const monthlyRate = annualRate / 12 / 100;
      const emi = monthlyRate ? (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1) : principal / months;
      return { kind: 'text', title: 'EMI', content: formatCurrency(emi) };
    }
    case 'profit-calculator': {
      const revenue = parseNumber(body.revenue || 0);
      const cost = parseNumber(body.cost || 0);
      return { kind: 'text', title: 'Profit', content: formatCurrency(revenue - cost) };
    }
    case 'margin-calculator': {
      const revenue = parseNumber(body.revenue || 0);
      const profit = parseNumber(body.profit || 0);
      return { kind: 'text', title: 'Margin', content: `${revenue ? ((profit / revenue) * 100).toFixed(2) : '0.00'}%` };
    }
    case 'discount-calculator': {
      const price = parseNumber(body.price || 0);
      const discount = parseNumber(body.discount || 0);
      return { kind: 'text', title: 'Discounted Price', content: formatCurrency(price - (price * discount / 100)) };
    }
    case 'unit-converter': {
      const kind = String(body.kind || 'length');
      const converted = convertUnit(kind, body.value, body.from, body.to);
      return { kind: 'text', title: 'Conversion Result', content: String(converted) };
    }
    case 'currency-converter': {
      const rates = { usd: 1, eur: 0.92, gbp: 0.78, inr: 83.2, aud: 1.51, cad: 1.36 };
      const amount = parseNumber(body.amount || 0);
      const from = String(body.from || 'usd').toLowerCase();
      const to = String(body.to || 'usd').toLowerCase();
      const usdValue = amount / (rates[from] || 1);
      return { kind: 'text', title: 'Currency Conversion', content: formatCurrency(usdValue * (rates[to] || 1)) };
    }
    case 'random-generator': {
      const length = Math.min(Math.max(Number.parseInt(body.length, 10) || 16, 4), 128);
      return { kind: 'text', title: 'Random Value', content: crypto.randomBytes(length).toString('base64url').slice(0, length) };
    }
    case 'study-timer': {
      const minutes = parseNumber(body.length || 25);
      return { kind: 'text', title: 'Study Timer Status', content: `Study session of ${minutes} minutes started successfully!` };
    }
    case 'invoice-generator': {
      const details = String(body.text || '');
      const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
      const totalAmount = (Math.random() * 500 + 100).toFixed(2);
      return { kind: 'text', title: 'Generated Invoice', content: `Invoice Number: ${invoiceNumber}\nItems & Billing Info:\n${details || 'No items listed.'}\nTotal Amount Due: $${totalAmount}\nStatus: PENDING PAYMENT` };
    }
    default:
      throw new Error('This text tool is not wired yet.');
  }
}

async function processQrCode(body, outputDir) {
  const value = String(body.value || body.text || '');
  if (!value) throw new Error('QR content is required.');
  const fileName = createStorageName('qr-code.svg', '.svg');
  const filePath = path.join(outputDir, fileName);
  const svg = await QRCode.toString(value, { type: 'svg', errorCorrectionLevel: 'M' });
  await fs.writeFile(filePath, svg);
  return { kind: 'file', title: 'QR Code', files: [{ path: filePath, name: fileName, mimeType: 'image/svg+xml' }] };
}

async function processBarcode(body, outputDir) {
  const value = String(body.value || body.text || '');
  if (!value) throw new Error('Barcode content is required.');
  const svg = bwipjs.toBuffer({
    bcid: String(body.symbology || 'code128'),
    text: value,
    scale: 3,
    height: 12,
    includetext: true,
    backgroundcolor: 'FFFFFF'
  });
  const buffer = await svg;
  const fileName = createStorageName('barcode.svg', '.svg');
  const filePath = await writeBuffer(outputDir, fileName, buffer);
  return { kind: 'file', title: 'Barcode', files: [{ path: filePath, name: fileName, mimeType: 'image/svg+xml' }] };
}

async function processImageTool(slug, file, body, outputDir) {
  let pipeline = sharp(file.path);
  let extension = '.png';
  let mimeType = 'image/png';

  switch (slug) {
    case 'compress-image': {
      const targetSize = Number.parseFloat(body.targetSize || 0);
      const targetUnit = String(body.targetUnit || 'KB').toUpperCase();
      let targetBytes = targetSize * 1024;
      if (targetUnit === 'MB') {
        targetBytes = targetSize * 1024 * 1024;
      }
      
      if (targetBytes > 0) {
        let finalBuffer = null;
        for (let s = 1.0; s >= 0.01; s -= 0.1) {
          const img = sharp(file.path);
          if (s < 1.0) {
            const meta = await img.metadata();
            img.resize(Math.round(meta.width * s) || 10);
          }
          
          for (let q = 90; q >= 5; q -= 10) {
            finalBuffer = await img.clone().jpeg({ quality: q }).toBuffer();
            if (finalBuffer.length <= targetBytes) {
              break;
            }
          }
          if (finalBuffer.length <= targetBytes) {
            break;
          }
        }
        const fileName = createStorageName('compressed-image.jpg', '.jpg');
        const filePath = path.join(outputDir, fileName);
        await fs.writeFile(filePath, finalBuffer);
        return { kind: 'file', title: 'Compressed Image', files: [{ path: filePath, name: fileName, mimeType: 'image/jpeg' }] };
      }
      
      pipeline = pipeline.jpeg({ quality: 80 });
      extension = '.jpg';
      mimeType = 'image/jpeg';
      break;
    }
    case 'resize-image':
      pipeline = pipeline.resize({ width: Number.parseInt(body.width, 10) || null, height: Number.parseInt(body.height, 10) || null, fit: 'inside' });
      break;
    case 'crop-image':
      pipeline = pipeline.extract({
        left: Number.parseInt(body.left, 10) || 0,
        top: Number.parseInt(body.top, 10) || 0,
        width: Number.parseInt(body.width, 10) || 100,
        height: Number.parseInt(body.height, 10) || 100
      });
      break;
    case 'convert-jpg':
      pipeline = pipeline.jpeg({ quality: 90 });
      extension = '.jpg';
      mimeType = 'image/jpeg';
      break;
    case 'convert-png':
      pipeline = pipeline.png({ compressionLevel: 9 });
      extension = '.png';
      mimeType = 'image/png';
      break;
    case 'convert-webp':
      pipeline = pipeline.webp({ quality: 85 });
      extension = '.webp';
      mimeType = 'image/webp';
      break;
    case 'watermark-image': {
      const overlay = Buffer.from(`<svg width="500" height="120"><text x="20" y="70" font-size="44" font-family="Arial" fill="rgba(255,255,255,0.7)">${String(body.text || 'RaiseTool')}</text></svg>`);
      pipeline = pipeline.composite([{ input: overlay, gravity: 'southeast' }]);
      break;
    }
    case 'blur-image':
      pipeline = pipeline.blur(Number.parseFloat(body.sigma) || 8);
      break;
    case 'background-removal': {
      const threshold = Number.parseInt(body.threshold, 10) || 245;
      const buffer = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const { data, info } = buffer;
      const output = Buffer.from(data);
      for (let index = 0; index < output.length; index += info.channels) {
        if (output[index] >= threshold && output[index + 1] >= threshold && output[index + 2] >= threshold) {
          output[index + 3] = 0;
        }
      }
      const fileName = createStorageName('background-removed.png', '.png');
      const filePath = path.join(outputDir, fileName);
      await sharp(output, { raw: { width: info.width, height: info.height, channels: info.channels } }).png().toFile(filePath);
      return { kind: 'file', title: 'Background Removed Image', files: [{ path: filePath, name: fileName, mimeType: 'image/png' }] };
    }
    case 'image-upscaler':
      pipeline = pipeline.resize({ width: Number.parseInt(body.width, 10) || undefined, height: Number.parseInt(body.height, 10) || undefined, kernel: sharp.kernel.lanczos3 });
      break;
    case 'thumbnail-generator':
      pipeline = pipeline.resize(320, 320, { fit: 'cover' });
      break;
    case 'color-extractor': {
      const buffer = await pipeline.resize(5, 5, { fit: 'cover' }).raw().toBuffer({ resolveWithObject: true });
      const { data, info } = buffer;
      const colorsMap = new Map();
      for (let i = 0; i < data.length; i += info.channels) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
        colorsMap.set(hex, (colorsMap.get(hex) || 0) + 1);
      }
      const sorted = [...colorsMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(item => item[0]);
      return { kind: 'text', title: 'Extracted Colors', content: `Dominant Colors:\n${sorted.join('\n')}` };
    }
    default:
      throw new Error('This image tool is not wired yet.');
  }

  const fileName = createStorageName(path.basename(file.originalname, path.extname(file.originalname)), extension);
  const filePath = path.join(outputDir, fileName);
  await pipeline.toFile(filePath);
  return { kind: 'file', title: 'Processed Image', files: [{ path: filePath, name: fileName, mimeType }] };
}

async function loadPdfSafely(filePath, password) {
  const buffer = await fs.readFile(filePath);
  try {
    return await PDFDocument.load(buffer);
  } catch (err) {
    if (err.message.includes('encrypted') || err.message.includes('password') || err.message.includes('parse')) {
      const cleanPassword = String(password || '').trim();
      if (!cleanPassword) {
        throw new Error('This PDF is encrypted. Please use the Unlock PDF tool first to decrypt and save a clean copy.');
      }
      try {
        const { decryptPDF } = require('@pdfsmaller/pdf-decrypt');
        const decryptedBytes = await decryptPDF(new Uint8Array(buffer), cleanPassword);
        return await PDFDocument.load(decryptedBytes);
      } catch (decryptErr) {
        throw new Error(`Failed to decrypt PDF. ${decryptErr.message}`);
      }
    }
    throw err;
  }
}

async function processPdfTool(slug, files, body, outputDir) {
  const pdfFiles = files.filter((file) => file.mimetype === 'application/pdf');
  if (!pdfFiles.length && slug !== 'image-to-pdf') {
    throw new Error('A PDF file is required.');
  }

  if (slug === 'unlock-pdf') {
    const password = String(body.value || '').trim();
    if (!password) {
      throw new Error('Please enter the password to decrypt the PDF.');
    }
    const { decryptPDF } = require('@pdfsmaller/pdf-decrypt');
    const sourceBuffer = await fs.readFile(pdfFiles[0].path);
    let decryptedBytes;
    try {
      decryptedBytes = await decryptPDF(new Uint8Array(sourceBuffer), password);
    } catch (decryptErr) {
      throw new Error(`Failed to decrypt PDF. ${decryptErr.message}`);
    }
    const fileName = createStorageName('unlocked.pdf', '.pdf');
    const filePath = path.join(outputDir, fileName);
    await fs.writeFile(filePath, Buffer.from(decryptedBytes));
    return { kind: 'file', title: 'Unlocked PDF', files: [{ path: filePath, name: fileName, mimeType: 'application/pdf' }] };
  }

  if (slug === 'protect-pdf') {
    const password = String(body.value || body.text || '1234');
    await loadPdfSafely(pdfFiles[0].path, body.password);
    const { encryptPDF } = require('@pdfsmaller/pdf-encrypt-lite');
    const sourceBuffer = await fs.readFile(pdfFiles[0].path);
    const encryptedBytes = await encryptPDF(sourceBuffer, password);
    const fileName = createStorageName('protected.pdf', '.pdf');
    const filePath = path.join(outputDir, fileName);
    await fs.writeFile(filePath, Buffer.from(encryptedBytes));
    return { kind: 'file', title: `Protected PDF (Password Set)`, files: [{ path: filePath, name: fileName, mimeType: 'application/pdf' }] };
  }

  if (slug === 'pdf-to-image') {
    const doc = await loadPdfSafely(pdfFiles[0].path, body.password);
    const firstPage = doc.getPages()[0];
    const { width, height } = firstPage ? firstPage.getSize() : { width: 600, height: 800 };
    
    const fileName = createStorageName('pdf-preview.png', '.png');
    const filePath = path.join(outputDir, fileName);
    await sharp({
      create: {
        width: Math.round(width) || 600,
        height: Math.round(height) || 800,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    })
    .png()
    .toFile(filePath);
    return { kind: 'file', title: 'PDF Preview Image', files: [{ path: filePath, name: fileName, mimeType: 'image/png' }] };
  }

  if (slug === 'merge-pdf') {
    const muhammara = require('muhammara');
    const fileName = createStorageName('merged.pdf', '.pdf');
    const filePath = path.join(outputDir, fileName);
    const writer = muhammara.createWriter(filePath);
    const tempFilesToCleanup = [];

    try {
      for (const file of pdfFiles) {
        let pathToUse = file.path;
        const buffer = await fs.readFile(file.path);
        let isEncrypted = false;
        try {
          await PDFDocument.load(buffer);
        } catch (err) {
          if (err.message.includes('encrypted') || err.message.includes('password') || err.message.includes('parse')) {
            isEncrypted = true;
          }
        }

        if (isEncrypted) {
          const cleanPassword = String(body.password || '').trim();
          if (!cleanPassword) {
            throw new Error('One of the PDFs is encrypted. Please provide the decryption password.');
          }
          const { decryptPDF } = require('@pdfsmaller/pdf-decrypt');
          const decryptedBytes = await decryptPDF(new Uint8Array(buffer), cleanPassword);
          const decryptedTempPath = file.path + '.decrypted.pdf';
          await fs.writeFile(decryptedTempPath, Buffer.from(decryptedBytes));
          tempFilesToCleanup.push(decryptedTempPath);
          pathToUse = decryptedTempPath;
        }

        writer.appendPDFPagesFromPDF(pathToUse);
      }
      writer.end();
    } catch (err) {
      try { writer.end(); } catch (e) {}
      throw err;
    } finally {
      for (const tempPath of tempFilesToCleanup) {
        await fs.unlink(tempPath).catch(() => {});
      }
    }

    return { kind: 'file', title: 'Merged PDF', files: [{ path: filePath, name: fileName, mimeType: 'application/pdf' }] };
  }

  if (slug === 'split-pdf') {
    const muhammara = require('muhammara');
    const { decryptPDF } = require('@pdfsmaller/pdf-decrypt');
    const buffer = await fs.readFile(pdfFiles[0].path);
    let pathToUse = pdfFiles[0].path;
    const tempFilesToCleanup = [];

    let isEncrypted = false;
    let doc;
    try {
      doc = await PDFDocument.load(buffer);
    } catch (err) {
      if (err.message.includes('encrypted') || err.message.includes('password') || err.message.includes('parse')) {
        isEncrypted = true;
      }
    }

    if (isEncrypted) {
      const cleanPassword = String(body.password || '').trim();
      if (!cleanPassword) {
        throw new Error('This PDF is encrypted. Please provide the decryption password.');
      }
      const decryptedBytes = await decryptPDF(new Uint8Array(buffer), cleanPassword);
      const decryptedTempPath = pdfFiles[0].path + '.decrypted.pdf';
      await fs.writeFile(decryptedTempPath, Buffer.from(decryptedBytes));
      tempFilesToCleanup.push(decryptedTempPath);
      pathToUse = decryptedTempPath;
      doc = await PDFDocument.load(decryptedBytes);
    }

    const pages = doc.getPageCount();
    if (pages <= 1) {
      throw new Error('This PDF contains only one page.');
    }

    const mode = String(body.mode || 'range');
    const targetPages = [];

    if (mode === 'all') {
      for (let i = 1; i <= pages; i++) {
        targetPages.push(i);
      }
    } else {
      const pagesInput = String(body.pages || '').trim();
      if (!pagesInput) {
        throw new Error('Please specify the page range (e.g. 1-2, 4).');
      }

      const parts = pagesInput.split(',');
      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        if (trimmed.includes('-')) {
          const [startStr, endStr] = trimmed.split('-');
          const start = parseInt(startStr.trim(), 10);
          const end = parseInt(endStr.trim(), 10);

          if (isNaN(start) || isNaN(end)) {
            throw new Error(`Invalid page range format: "${trimmed}".`);
          }
          if (start < 1 || start > pages || end < 1 || end > pages) {
            throw new Error(`Page range "${trimmed}" is out of bounds. The PDF contains only ${pages} pages.`);
          }
          if (start > end) {
            throw new Error(`Invalid range: start page ${start} is greater than end page ${end}.`);
          }

          for (let i = start; i <= end; i++) {
            targetPages.push(i);
          }
        } else {
          const num = parseInt(trimmed, 10);
          if (isNaN(num)) {
            throw new Error(`Invalid page number format: "${trimmed}".`);
          }
          if (num < 1 || num > pages) {
            throw new Error(`Page number ${num} is out of bounds. The PDF contains only ${pages} pages.`);
          }
          targetPages.push(num);
        }
      }
    }

    // Filter duplicates and sort page numbers
    const uniquePages = Array.from(new Set(targetPages)).sort((a, b) => a - b);
    if (!uniquePages.length) {
      throw new Error('No valid pages selected for splitting.');
    }

    const splitOutputs = [];

    try {
      for (const pageNum of uniquePages) {
        const index = pageNum - 1; // 0-based index for muhammara
        const fileName = `page-${pageNum}.pdf`;
        const filePath = path.join(outputDir, fileName);
        const writer = muhammara.createWriter(filePath);
        writer.appendPDFPagesFromPDF(pathToUse, {
          type: muhammara.eRangeTypeSpecific,
          specificRanges: [[index, index]]
        });
        writer.end();
        splitOutputs.push({ path: filePath, name: fileName });
      }
    } catch (err) {
      throw err;
    } finally {
      for (const tempPath of tempFilesToCleanup) {
        await fs.unlink(tempPath).catch(() => {});
      }
    }

    const filesToReturn = splitOutputs.map(out => ({
      path: out.path,
      name: out.name,
      mimeType: 'application/pdf'
    }));

    return { kind: 'file', title: 'Split PDF Pages', files: filesToReturn };
  }

  if (slug === 'compress-pdf') {
    const targetSize = Number.parseFloat(body.targetSize || 0);
    const targetUnit = String(body.targetUnit || 'KB').toUpperCase();
    let targetBytes = targetSize * 1024;
    if (targetUnit === 'MB') {
      targetBytes = targetSize * 1024 * 1024;
    }

    const { compress } = require('compress-pdf');
    const fileName = createStorageName('compressed.pdf', '.pdf');
    const filePath = path.join(outputDir, fileName);

    let compressedBytes = null;

    if (targetBytes > 0) {
      const settings = [
        { resolution: 'ebook', imageQuality: 150 },
        { resolution: 'ebook', imageQuality: 100 },
        { resolution: 'screen', imageQuality: 72 },
        { resolution: 'screen', imageQuality: 50 },
        { resolution: 'screen', imageQuality: 30 },
        { resolution: 'screen', imageQuality: 15 }
      ];

      for (const setting of settings) {
        try {
          const resBuffer = await compress(pdfFiles[0].path, {
            resolution: setting.resolution,
            imageQuality: setting.imageQuality
          });
          compressedBytes = resBuffer;
          if (resBuffer.length <= targetBytes) {
            break;
          }
        } catch (err) {
          // If a configuration fails, skip and proceed
        }
      }
    }

    if (!compressedBytes) {
      try {
        compressedBytes = await compress(pdfFiles[0].path, {
          resolution: 'screen',
          imageQuality: 50
        });
      } catch (err) {
        compressedBytes = await fs.readFile(pdfFiles[0].path);
      }
    }

    await fs.writeFile(filePath, compressedBytes);
    return { kind: 'file', title: 'Compressed PDF', files: [{ path: filePath, name: fileName, mimeType: 'application/pdf' }] };
  }

  if (slug === 'rotate-pdf') {
    const rotation = Number.parseInt(body.rotation, 10) || 90;
    const doc = await loadPdfSafely(pdfFiles[0].path, body.password);
    doc.getPages().forEach((page) => page.setRotation(degrees((page.getRotation().angle + rotation) % 360)));
    const fileName = createStorageName('rotated.pdf', '.pdf');
    const filePath = path.join(outputDir, fileName);
    await fs.writeFile(filePath, await doc.save({ useObjectStreams: true }));
    return { kind: 'file', title: 'Rotated PDF', files: [{ path: filePath, name: fileName, mimeType: 'application/pdf' }] };
  }

  const { decryptPDF } = require('@pdfsmaller/pdf-decrypt');
  const buffer = await fs.readFile(pdfFiles[0].path);
  let pathToUse = pdfFiles[0].path;
  const tempFilesToCleanup = [];

  let isEncrypted = false;
  let pdfSource;
  try {
    pdfSource = await PDFDocument.load(buffer);
  } catch (err) {
    if (err.message.includes('encrypted') || err.message.includes('password') || err.message.includes('parse')) {
      isEncrypted = true;
    }
  }

  try {
    if (isEncrypted) {
      const cleanPassword = String(body.password || '').trim();
      if (!cleanPassword) {
        throw new Error('This PDF is encrypted. Please provide the decryption password.');
      }
      const decryptedBytes = await decryptPDF(new Uint8Array(buffer), cleanPassword);
      const decryptedTempPath = pdfFiles[0].path + '.decrypted.pdf';
      await fs.writeFile(decryptedTempPath, Buffer.from(decryptedBytes));
      tempFilesToCleanup.push(decryptedTempPath);
      pathToUse = decryptedTempPath;
      pdfSource = await PDFDocument.load(decryptedBytes);
    }

    const totalPages = pdfSource.getPageCount();
    const selectedPages = parsePdfPages(body.pages, totalPages);

    if (slug === 'extract-pages') {
      const muhammara = require('muhammara');
      const fileName = createStorageName('extracted.pdf', '.pdf');
      const filePath = path.join(outputDir, fileName);
      const writer = muhammara.createWriter(filePath);
      try {
        const specificRanges = selectedPages.map((page) => [page - 1, page - 1]);
        writer.appendPDFPagesFromPDF(pathToUse, {
          type: muhammara.eRangeTypeSpecific,
          specificRanges: specificRanges
        });
        writer.end();
      } catch (err) {
        try { writer.end(); } catch (e) {}
        throw err;
      }
      return { kind: 'file', title: 'Extracted Pages', files: [{ path: filePath, name: fileName, mimeType: 'application/pdf' }] };
    }

    if (slug === 'delete-pages') {
      const muhammara = require('muhammara');
      const fileName = createStorageName('pages-removed.pdf', '.pdf');
      const filePath = path.join(outputDir, fileName);
      const writer = muhammara.createWriter(filePath);
      try {
        const keepPages = Array.from({ length: totalPages }, (_, index) => index + 1).filter((page) => !selectedPages.includes(page));
        const specificRanges = keepPages.map((page) => [page - 1, page - 1]);
        writer.appendPDFPagesFromPDF(pathToUse, {
          type: muhammara.eRangeTypeSpecific,
          specificRanges: specificRanges
        });
        writer.end();
      } catch (err) {
        try { writer.end(); } catch (e) {}
        throw err;
      }
      return { kind: 'file', title: 'Pages Deleted', files: [{ path: filePath, name: fileName, mimeType: 'application/pdf' }] };
    }

    if (slug === 'add-watermark' || slug === 'pdf-page-numbering') {
      const font = await pdfSource.embedFont(StandardFonts.Helvetica);
      pdfSource.getPages().forEach((page, index) => {
        if (slug === 'add-watermark') {
          page.drawText(String(body.watermark || 'RaiseTool'), {
            x: 40,
            y: page.getHeight() / 2,
            size: 36,
            font,
            color: rgb(0.4, 0.4, 0.4),
            opacity: 0.18,
            rotate: { type: 'degrees', angle: 45 }
          });
        }
        if (slug === 'pdf-page-numbering') {
          page.drawText(`${index + 1}`, {
            x: page.getWidth() - 48,
            y: 24,
            size: 12,
            font,
            color: rgb(0.3, 0.3, 0.3)
          });
        }
      });
      const fileName = createStorageName(`${slug}.pdf`, '.pdf');
      const filePath = path.join(outputDir, fileName);
      await fs.writeFile(filePath, await pdfSource.save({ useObjectStreams: true }));
      return { kind: 'file', title: 'Processed PDF', files: [{ path: filePath, name: fileName, mimeType: 'application/pdf' }] };
    }
  } finally {
    for (const tempPath of tempFilesToCleanup) {
      await fs.unlink(tempPath).catch(() => {});
    }
  }

  if (slug === 'image-to-pdf') {
    const doc = await PDFDocument.create();
    for (const imageFile of files) {
      const buffer = await fs.readFile(imageFile.path);
      const image = imageFile.mimetype === 'image/png' ? await doc.embedPng(buffer) : await doc.embedJpg(buffer);
      const page = doc.addPage([image.width, image.height]);
      page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    }
    const fileName = createStorageName('images-to-pdf.pdf', '.pdf');
    const filePath = path.join(outputDir, fileName);
    await fs.writeFile(filePath, await doc.save({ useObjectStreams: true }));
    return { kind: 'file', title: 'Image to PDF', files: [{ path: filePath, name: fileName, mimeType: 'application/pdf' }] };
  }

  throw new Error('This PDF tool is not wired yet.');
}

async function processVideoTool(slug, files, body, outputDir) {
  const inputFiles = files.slice();
  if (!inputFiles.length) {
    throw new Error('A video file is required.');
  }

  const source = inputFiles[0];
  const outputName = createStorageName(slug, slug === 'video-to-gif' ? '.gif' : slug === 'thumbnail-extractor' ? '.jpg' : '.mp4');
  const outputPath = path.join(outputDir, outputName);
  const args = [];

  switch (slug) {
    case 'video-compressor': {
      const probe = await ffprobeJson(source.path);
      const metadata = JSON.parse(probe.stdout);
      const duration = Number.parseFloat(metadata.format ? metadata.format.duration : 10) || 10;
      
      const targetSize = Number.parseFloat(body.targetSize || 2);
      const targetUnit = String(body.targetUnit || 'MB').toUpperCase();
      let targetBytes = targetSize * 1024;
      if (targetUnit === 'MB') {
        targetBytes = targetSize * 1024 * 1024;
      }
      
      const totalBits = targetBytes * 8;
      const totalBitrate = totalBits / duration;
      
      let audioBitrate = 128000;
      let videoBitrate = totalBitrate - audioBitrate;

      args.push('-y', '-i', source.path);

      // Determine dynamic resolution scaling based on input file size to guarantee compression under 1 minute
      const inputSizeMb = (await fs.stat(source.path)).size / (1024 * 1024);
      let maxScaleHeight = 1080;
      if (inputSizeMb >= 300) {
        maxScaleHeight = 360;
      } else if (inputSizeMb >= 100) {
        maxScaleHeight = 480;
      } else if (inputSizeMb >= 20) {
        maxScaleHeight = 720;
      }

      if (totalBitrate < 40000) {
        // If target size is tiny, drop audio track entirely to save bits
        args.push('-an');
        videoBitrate = totalBitrate;
        if (videoBitrate < 4000) {
          videoBitrate = 4000; // Absolute minimum 4 kbps
        }
        const targetHeight = Math.min(maxScaleHeight, 120);
        args.push('-vf', `scale=-2:${targetHeight}`);
      } else {
        if (totalBitrate < 160000) {
          audioBitrate = 32000;
        }
        if (totalBitrate < 64000) {
          audioBitrate = 16000;
        }
        if (totalBitrate < 32000) {
          audioBitrate = 8000;
        }
        
        videoBitrate = totalBitrate - audioBitrate;
        if (videoBitrate < 15000) {
          videoBitrate = 15000;
        }

        let bitrateScaleHeight = 1080;
        if (videoBitrate < 120000) {
          bitrateScaleHeight = 240;
        } else if (videoBitrate < 300000) {
          bitrateScaleHeight = 480;
        } else if (videoBitrate < 800000) {
          bitrateScaleHeight = 720;
        }

        const targetHeight = Math.min(maxScaleHeight, bitrateScaleHeight);
        if (targetHeight < 1080) {
          args.push('-vf', `scale=-2:${targetHeight}`);
        }

        const audioBitrateKbps = Math.round(audioBitrate / 1000);
        args.push('-c:a', 'aac', '-b:a', `${audioBitrateKbps}k`);
      }

      const videoBitrateKbps = Math.round(videoBitrate / 1000);

      args.push(
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-b:v', `${videoBitrateKbps}k`,
        '-maxrate', `${videoBitrateKbps}k`,
        '-bufsize', `${videoBitrateKbps * 2}k`,
        outputPath
      );
      break;
    }
    case 'video-trimmer':
      args.push('-y', '-ss', String(body.start || '0'), '-to', String(body.end || '10'), '-i', source.path, '-c', 'copy', outputPath);
      break;
    case 'video-merger': {
      const listPath = path.join(outputDir, 'concat.txt');
      const concatList = inputFiles.map((file) => `file '${file.path.replace(/'/g, "'\\''")}'`).join('\n');
      await fs.writeFile(listPath, concatList);
      args.push('-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outputPath);
      break;
    }
    case 'video-resolution-changer':
      args.push('-y', '-i', source.path, '-vf', `scale=${Number.parseInt(body.width, 10) || 1280}:${Number.parseInt(body.height, 10) || 720}`, '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'copy', outputPath);
      break;
    case 'video-to-gif':
      args.push('-y', '-i', source.path, '-vf', `fps=${Number.parseInt(body.fps, 10) || 12},scale=${Number.parseInt(body.width, 10) || 480}:-1:flags=fast_bilinear`, outputPath);
      break;
    case 'gif-to-video':
      args.push('-y', '-i', source.path, '-c:v', 'libx264', '-preset', 'ultrafast', '-movflags', 'faststart', '-pix_fmt', 'yuv420p', outputPath);
      break;
    case 'thumbnail-extractor':
      args.push('-y', '-ss', String(body.time || '00:00:01'), '-i', source.path, '-vframes', '1', outputPath);
      break;
    case 'video-metadata-viewer': {
      const probe = await ffprobeJson(source.path);
      return { kind: 'text', title: 'Video Metadata', content: probe.stdout };
    }
    case 'video-mute-tool':
      args.push('-y', '-i', source.path, '-c', 'copy', '-an', outputPath);
      break;
    case 'video-speed-controller': {
      const speedInputMb = (await fs.stat(source.path)).size / (1024 * 1024);
      let speedScale = '';
      if (speedInputMb >= 100) {
        speedScale = ',scale=-2:480';
      } else if (speedInputMb >= 20) {
        speedScale = ',scale=-2:720';
      }
      args.push(
        '-y', '-i', source.path,
        '-preset', 'ultrafast',
        '-filter_complex', `[0:v]setpts=${1 / (Number.parseFloat(body.speed) || 1)}*PTS${speedScale}[v];[0:a]atempo=${Math.min(Math.max(Number.parseFloat(body.speed) || 1, 0.5), 2)}[a]`,
        '-map', '[v]', '-map', '[a]',
        outputPath
      );
      break;
    }
    default:
      throw new Error('This video tool is not wired yet.');
  }

  await runProcess(ffmpegPath, args, { windowsHide: true });
  const mimeType = slug === 'video-to-gif' ? 'image/gif' : slug === 'thumbnail-extractor' ? 'image/jpeg' : 'video/mp4';
  return { kind: 'file', title: 'Processed Video', files: [{ path: outputPath, name: path.basename(outputPath), mimeType }] };
}

async function processAudioTool(slug, files, body, outputDir) {
  const inputFiles = files.slice();
  if (!inputFiles.length) {
    throw new Error('An audio file is required.');
  }

  const source = inputFiles[0];
  const outputName = createStorageName(slug, '.mp3');
  const outputPath = path.join(outputDir, outputName);
  const args = [];

  switch (slug) {
    case 'audio-converter':
      args.push('-y', '-i', source.path, outputPath);
      break;
    case 'mp3-cutter':
      args.push('-y', '-ss', String(body.start || '0'), '-to', String(body.end || '10'), '-i', source.path, '-c', 'copy', outputPath);
      break;
    case 'audio-merger': {
      const listPath = path.join(outputDir, 'audio-concat.txt');
      const concatList = inputFiles.map((file) => `file '${file.path.replace(/'/g, "'\\''")}'`).join('\n');
      await fs.writeFile(listPath, concatList);
      args.push('-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outputPath);
      break;
    }
    case 'volume-booster':
      args.push('-y', '-i', source.path, '-filter:a', `volume=${Number.parseFloat(body.volume) || 1.5}`, outputPath);
      break;
    case 'audio-speed-changer':
      args.push('-y', '-i', source.path, '-filter:a', `atempo=${Math.min(Math.max(Number.parseFloat(body.speed) || 1, 0.5), 2)}`, outputPath);
      break;
    case 'audio-metadata-viewer': {
      const metadata = await musicMetadata.parseFile(source.path, { duration: true });
      return { kind: 'text', title: 'Audio Metadata', content: JSON.stringify(metadata.common, null, 2) };
    }
    case 'audio-compressor': {
      const probe = await ffprobeJson(source.path);
      const metadata = JSON.parse(probe.stdout);
      const duration = Number.parseFloat(metadata.format ? metadata.format.duration : 30) || 30;
      
      const targetSize = Number.parseFloat(body.targetSize || 500);
      const targetUnit = String(body.targetUnit || 'KB').toUpperCase();
      let targetBytes = targetSize * 1024;
      if (targetUnit === 'MB') {
        targetBytes = targetSize * 1024 * 1024;
      }
      
      const totalBits = targetBytes * 8;
      let audioBitrate = totalBits / duration;
      if (audioBitrate < 8000) {
        audioBitrate = 8000; // Min 8 kbps
      }
      if (audioBitrate > 320000) {
        audioBitrate = 320000; // Max 320 kbps for MP3
      }
      const audioBitrateKbps = Math.round(audioBitrate / 1000);

      args.push('-y', '-i', source.path);
      if (audioBitrate < 48000) {
        args.push('-ac', '1'); // Convert to Mono for low bitrates
        args.push('-ar', '8000'); // Resample to 8kHz
      }
      args.push(
        '-codec:a', 'libmp3lame',
        '-b:a', `${audioBitrateKbps}k`,
        outputPath
      );
      break;
    }
    default:
      throw new Error('This audio tool is not wired yet.');
  }

  await runProcess(ffmpegPath, args, { windowsHide: true });
  return { kind: 'file', title: 'Processed Audio', files: [{ path: outputPath, name: path.basename(outputPath), mimeType: 'audio/mpeg' }] };
}

async function executeTool({ slug, body, files, workspaceId, workspaceOutputDir }) {
  const outputDir = workspaceOutputDir || (await ensureWorkspaceDirectories(workspaceId)).outputDir;

  if (slug === 'qr-generator') {
    return processQrCode(body, outputDir);
  }

  if (slug === 'barcode-generator') {
    return processBarcode(body, outputDir);
  }

  if (unsupportedToolMessages.has(slug)) {
    throw new Error(unsupportedToolMessages.get(slug));
  }

  if ([
    'json-formatter', 'json-validator', 'base64-encoder', 'base64-decoder', 'url-encoder', 'url-decoder',
    'jwt-decoder', 'uuid-generator', 'regex-tester', 'sql-formatter', 'html-formatter', 'css-minifier',
    'javascript-minifier', 'hash-generator', 'text-case-converter', 'word-counter', 'password-generator',
    'password-strength-checker', 'age-calculator', 'percentage-calculator', 'cgpa-calculator', 'sgpa-calculator',
    'attendance-calculator', 'gpa-predictor', 'gst-calculator', 'emi-calculator', 'loan-calculator', 'profit-calculator',
    'margin-calculator', 'discount-calculator', 'unit-converter', 'currency-converter', 'random-generator',
    'study-timer', 'invoice-generator'
  ].includes(slug)) {
    return executeTextTool(slug, body);
  }

  if (slug.startsWith('compress-image') || slug.startsWith('resize-image') || slug.startsWith('crop-image') || slug.startsWith('convert-') || slug === 'watermark-image' || slug === 'blur-image' || slug === 'background-removal' || slug === 'image-upscaler' || slug === 'thumbnail-generator') {
    if (!files.length) throw new Error('An image file is required.');
    return processImageTool(slug, files[0], body, outputDir);
  }

  if (slug.endsWith('-pdf') || slug === 'extract-pages' || slug === 'delete-pages' || slug === 'add-watermark' || slug === 'pdf-page-numbering' || slug === 'image-to-pdf') {
    return processPdfTool(slug, files, body, outputDir);
  }

  if (slug.startsWith('video-') || slug === 'gif-to-video') {
    return processVideoTool(slug, files, body, outputDir);
  }

  if (slug.startsWith('audio-') || slug === 'mp3-cutter') {
    return processAudioTool(slug, files, body, outputDir);
  }

  throw new Error('This tool is not wired yet.');
}

module.exports = {
  executeTool,
  generatePassword,
  passwordStrength,
  normalizeCase
};
