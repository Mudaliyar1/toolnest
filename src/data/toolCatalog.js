const toolCatalog = [
  {
    key: 'pdf',
    title: 'PDF Tools',
    description: 'High-trust PDF workflow tools for daily document operations.',
    tools: [
      { slug: 'merge-pdf', name: 'Merge PDF' },
      { slug: 'split-pdf', name: 'Split PDF' },
      { slug: 'compress-pdf', name: 'Compress PDF' },
      { slug: 'unlock-pdf', name: 'Unlock PDF' },
      { slug: 'protect-pdf', name: 'Protect PDF' },
      { slug: 'rotate-pdf', name: 'Rotate PDF' },
      { slug: 'extract-pages', name: 'Extract Pages' },
      { slug: 'delete-pages', name: 'Delete Pages' },
      { slug: 'add-watermark', name: 'Add Watermark' },
      { slug: 'pdf-to-image', name: 'PDF to Image' },
      { slug: 'image-to-pdf', name: 'Image to PDF' },
      { slug: 'pdf-page-numbering', name: 'PDF Page Numbering' }
    ]
  },
  {
    key: 'image',
    title: 'Image Tools',
    description: 'Optimized image transformation and inspection tools.',
    tools: [
      { slug: 'compress-image', name: 'Compress Image' },
      { slug: 'resize-image', name: 'Resize Image' },
      { slug: 'crop-image', name: 'Crop Image' },
      { slug: 'convert-jpg', name: 'Convert JPG' },
      { slug: 'convert-png', name: 'Convert PNG' },
      { slug: 'convert-webp', name: 'Convert WEBP' },
      { slug: 'watermark-image', name: 'Watermark Image' },
      { slug: 'blur-image', name: 'Blur Image' },
      { slug: 'background-removal', name: 'Background Removal' },
      { slug: 'image-upscaler', name: 'Image Upscaler' },
      { slug: 'thumbnail-generator', name: 'Thumbnail Generator' },
      { slug: 'color-extractor', name: 'Color Extractor' }
    ]
  },
  {
    key: 'video',
    title: 'Video Tools',
    description: 'FFmpeg-backed processing for everyday video tasks.',
    tools: [
      { slug: 'video-compressor', name: 'Video Compressor' },
      { slug: 'video-trimmer', name: 'Video Trimmer' },
      { slug: 'video-merger', name: 'Video Merger' },
      { slug: 'video-resolution-changer', name: 'Video Resolution Changer' },
      { slug: 'video-to-gif', name: 'Video to GIF' },
      { slug: 'gif-to-video', name: 'GIF to Video' },
      { slug: 'thumbnail-extractor', name: 'Thumbnail Extractor' },
      { slug: 'video-metadata-viewer', name: 'Video Metadata Viewer' },
      { slug: 'video-mute-tool', name: 'Video Mute Tool' },
      { slug: 'video-speed-controller', name: 'Video Speed Controller' }
    ]
  },
  {
    key: 'audio',
    title: 'Audio Tools',
    description: 'Reliable audio conversion, trimming, and inspection tools.',
    tools: [
      { slug: 'audio-converter', name: 'Audio Converter' },
      { slug: 'mp3-cutter', name: 'MP3 Cutter' },
      { slug: 'audio-merger', name: 'Audio Merger' },
      { slug: 'volume-booster', name: 'Volume Booster' },
      { slug: 'audio-speed-changer', name: 'Audio Speed Changer' },
      { slug: 'audio-metadata-viewer', name: 'Audio Metadata Viewer' },
      { slug: 'audio-compressor', name: 'Audio Compressor' }
    ]
  },
  {
    key: 'developer',
    title: 'Developer Tools',
    description: 'Fast browser-friendly transforms and formatters.',
    tools: [
      { slug: 'json-formatter', name: 'JSON Formatter' },
      { slug: 'json-validator', name: 'JSON Validator' },
      { slug: 'base64-encoder', name: 'Base64 Encoder' },
      { slug: 'base64-decoder', name: 'Base64 Decoder' },
      { slug: 'url-encoder', name: 'URL Encoder' },
      { slug: 'url-decoder', name: 'URL Decoder' },
      { slug: 'jwt-decoder', name: 'JWT Decoder' },
      { slug: 'uuid-generator', name: 'UUID Generator' },
      { slug: 'regex-tester', name: 'Regex Tester' },
      { slug: 'sql-formatter', name: 'SQL Formatter' },
      { slug: 'html-formatter', name: 'HTML Formatter' },
      { slug: 'css-minifier', name: 'CSS Minifier' },
      { slug: 'javascript-minifier', name: 'JavaScript Minifier' },
      { slug: 'hash-generator', name: 'Hash Generator' }
    ]
  },
  {
    key: 'student',
    title: 'Student Tools',
    description: 'Simple academic calculators with clean output.',
    tools: [
      { slug: 'cgpa-calculator', name: 'CGPA Calculator' },
      { slug: 'sgpa-calculator', name: 'SGPA Calculator' },
      { slug: 'attendance-calculator', name: 'Attendance Calculator' },
      { slug: 'percentage-calculator', name: 'Percentage Calculator' },
      { slug: 'study-timer', name: 'Study Timer' },
      { slug: 'gpa-predictor', name: 'GPA Predictor' }
    ]
  },
  {
    key: 'business',
    title: 'Business Tools',
    description: 'Financial calculators for light business workflows.',
    tools: [
      { slug: 'gst-calculator', name: 'GST Calculator' },
      { slug: 'emi-calculator', name: 'EMI Calculator' },
      { slug: 'invoice-generator', name: 'Invoice Generator' },
      { slug: 'profit-calculator', name: 'Profit Calculator' },
      { slug: 'margin-calculator', name: 'Margin Calculator' },
      { slug: 'discount-calculator', name: 'Discount Calculator' },
      { slug: 'loan-calculator', name: 'Loan Calculator' }
    ]
  },
  {
    key: 'utility',
    title: 'Utility Tools',
    description: 'Quick everyday tools for productivity and convenience.',
    tools: [
      { slug: 'qr-generator', name: 'QR Generator' },
      { slug: 'barcode-generator', name: 'Barcode Generator' },
      { slug: 'password-generator', name: 'Password Generator' },
      { slug: 'password-strength-checker', name: 'Password Strength Checker' },
      { slug: 'age-calculator', name: 'Age Calculator' },
      { slug: 'unit-converter', name: 'Unit Converter' },
      { slug: 'currency-converter', name: 'Currency Converter' },
      { slug: 'random-generator', name: 'Random Generator' },
      { slug: 'text-case-converter', name: 'Text Case Converter' },
      { slug: 'word-counter', name: 'Word Counter' }
    ]
  }
];

function getAllTools() {
  return toolCatalog.flatMap((category) =>
    category.tools.map((tool) => ({
      ...tool,
      category: category.key,
      categoryTitle: category.title,
      categoryDescription: category.description
    }))
  );
}

function findToolBySlug(slug) {
  return getAllTools().find((tool) => tool.slug === slug);
}

module.exports = {
  toolCatalog,
  getAllTools,
  findToolBySlug
};
