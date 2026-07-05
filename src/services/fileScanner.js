const fs = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const env = require('../config/env');

const execFileAsync = promisify(execFile);

async function quickHeuristicScan(filePath) {
  const buffer = await fs.readFile(filePath);
  // Scan up to 8KB to run fast and prevent memory issues with large files
  const text = buffer.subarray(0, 8192).toString('utf8').toLowerCase();
  const suspiciousPatterns = [
    '<script',
    'javascript:',
    'onload=',
    'onerror=',
    'powershell',
    'cmd.exe',
    'eval(',
    'base64_decode',
    'union select',
    'union all select',
    'select * from',
    'drop table',
    'insert into',
    'or 1=1',
    "or '1'='1'",
    'or "1"="1"',
    "admin' --",
    "admin'--"
  ];

  return !suspiciousPatterns.some((pattern) => text.includes(pattern));
}

async function clamAvScan(filePath) {
  if (!process.env.CLAMSCAN_PATH) {
    return { available: false, clean: true };
  }

  try {
    const result = await execFileAsync(process.env.CLAMSCAN_PATH, ['--no-summary', filePath], { timeout: 15000 });
    const output = `${result.stdout}\n${result.stderr}`;
    return {
      available: true,
      clean: !output.toLowerCase().includes('found'),
      output
    };
  } catch (error) {
    return {
      available: true,
      clean: false,
      output: error.stdout || error.stderr || error.message
    };
  }
}

async function scanUploadedFile(filePath) {
  const heuristicClean = await quickHeuristicScan(filePath);
  if (!heuristicClean) {
    return { clean: false, reason: 'Suspicious content detected.' };
  }

  const clamResult = await clamAvScan(filePath);
  if (!clamResult.clean) {
    return { clean: false, reason: 'Malware scan failed.' };
  }

  return {
    clean: true,
    scannerAvailable: clamResult.available
  };
}

module.exports = {
  clamAvScan,
  quickHeuristicScan,
  scanUploadedFile
};
