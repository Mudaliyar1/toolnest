(function () {
  let slug = '';
  function initTool() {
    const fileInput = document.getElementById('media-file-input');
    const previewContainer = document.getElementById('media-preview-container');
    const thumbnailWrapper = document.getElementById('preview-thumbnail-wrapper');
    const filenameEl = document.getElementById('preview-filename');
    const filesizeEl = document.getElementById('preview-filesize');

    const form = document.getElementById('tool-execution-form');
    const progressContainer = document.getElementById('upload-progress-container');
    const progressBar = document.getElementById('upload-progress-bar');
    const progressText = document.getElementById('upload-percentage');
    const statusDetails = document.getElementById('upload-status-details');
    const submitBtn = document.getElementById('submit-run-tool');
    const validationErrorEl = document.getElementById('validation-error-message');

    // Load active settings from EJS serialized script tag
    const configEl = document.getElementById('processing-config');
    const config = configEl ? JSON.parse(configEl.textContent) : { method: 'server', uploadLimitMb: 15 };

    // Extract slug from the form action (reliable even after /execute redirect)
    // Form action: /tools/video-compressor/execute?... → slug = 'video-compressor'
    const formAction = form ? (form.getAttribute('action') || '') : '';
    const slugFromAction = formAction.match(/\/tools\/([^/?]+)/);
    const urlParts = window.location.pathname.split('/');
    slug = slugFromAction ? slugFromAction[1] : urlParts[urlParts.length - 1];

    // IndexedDB Management for PWA History
    let db = null;
    if (config.pwaIndexedDbUsage !== false && typeof indexedDB !== 'undefined') {
      const dbRequest = indexedDB.open('raisetool-db', 1);

      dbRequest.onupgradeneeded = (e) => {
        const activeDb = e.target.result;
        if (!activeDb.objectStoreNames.contains('history')) {
          activeDb.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
        }
      };

      dbRequest.onsuccess = (e) => {
        db = e.target.result;
      };

      dbRequest.onerror = (e) => {
        console.error('Failed to open IndexedDB:', e.target.error);
      };
    }

    window.logToolHistory = function(toolSlug, title, status, details) {
      if (!db || config.pwaIndexedDbUsage === false) return;
      try {
        const transaction = db.transaction(['history'], 'readwrite');
        const store = transaction.objectStore('history');
        const entry = {
          toolSlug: toolSlug || slug,
          title: title || 'Output',
          status: status || 'success',
          details: details || 'Processed',
          timestamp: new Date().toISOString()
        };
        store.add(entry);
      } catch (err) {
        console.error('Failed to write to IndexedDB:', err);
      }
    };

    if (config.method === 'disabled' && submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Processing Disabled';
    }

    // Helper to format file sizes
    function formatBytes(bytes) {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Handlers for client-side previews
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        if (validationErrorEl) {
          validationErrorEl.classList.add('d-none');
        }
        const files = e.target.files;
        const acceptAttr = fileInput.getAttribute('accept');
        if (acceptAttr && files && files.length > 0) {
          const rules = acceptAttr.split(',').map(r => r.trim().toLowerCase());
          let allAllowed = true;

          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            let fileAllowed = false;

            for (const rule of rules) {
              if (rule.startsWith('.')) {
                if (file.name.toLowerCase().endsWith(rule)) {
                  fileAllowed = true;
                  break;
                }
              } else if (rule.endsWith('/*')) {
                const prefix = rule.slice(0, -2);
                if (file.type.toLowerCase().startsWith(prefix)) {
                  fileAllowed = true;
                  break;
                }
              } else {
                if (file.type.toLowerCase() === rule) {
                  fileAllowed = true;
                  break;
                }
              }
            }

            if (!fileAllowed) {
              allAllowed = false;
              break;
            }
          }

          if (!allAllowed) {
            fileInput.value = '';
            if (previewContainer) previewContainer.classList.add('d-none');
            if (validationErrorEl) {
              let friendlyType = 'the correct format';
              if (acceptAttr === '.pdf') friendlyType = 'PDF';
              else if (acceptAttr.includes('image')) friendlyType = 'Image';
              else if (acceptAttr.includes('video')) friendlyType = 'Video';
              else if (acceptAttr.includes('audio')) friendlyType = 'Audio';

              validationErrorEl.textContent = `Invalid file format. Please upload ${friendlyType} files only.`;
              validationErrorEl.classList.remove('d-none');
            }
            return;
          }
        }
        if (!files || files.length === 0) {
          if (previewContainer) previewContainer.classList.add('d-none');
          return;
        }

        if (previewContainer) previewContainer.classList.remove('d-none');
        if (thumbnailWrapper) {
          thumbnailWrapper.innerHTML = '';
          thumbnailWrapper.className = 'bg-light d-flex align-items-center justify-content-center border';
          thumbnailWrapper.style.height = '';
          thumbnailWrapper.style.maxHeight = '';
          thumbnailWrapper.style.overflowY = '';
          thumbnailWrapper.style.display = '';
        }

        function getNormalizedFileType(file) {
          const type = (file.type || '').toLowerCase();
          const name = (file.name || '').toLowerCase();
          
          if (type.startsWith('image/') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png') || name.endsWith('.gif') || name.endsWith('.webp') || name.endsWith('.heic') || name.endsWith('.heif') || name.endsWith('.svg')) {
            return 'image';
          }
          if (type === 'application/pdf' || name.endsWith('.pdf')) {
            return 'pdf';
          }
          if (type.startsWith('video/') || name.endsWith('.mp4') || name.endsWith('.webm') || name.endsWith('.mov') || name.endsWith('.avi') || name.endsWith('.mkv')) {
            return 'video';
          }
          if (type.startsWith('audio/') || name.endsWith('.mp3') || name.endsWith('.wav') || name.endsWith('.ogg') || name.endsWith('.m4a') || name.endsWith('.aac')) {
            return 'audio';
          }
          return 'other';
        }

        if (files.length === 1) {
          const file = files[0];
          if (filenameEl) filenameEl.textContent = file.name;
          if (filesizeEl) filesizeEl.textContent = formatBytes(file.size);

          const fileCategory = getNormalizedFileType(file);

          if (fileCategory === 'image' && thumbnailWrapper) {
            const isHeic = file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif');
            if (isHeic) {
              thumbnailWrapper.innerHTML = `
                <div class="text-primary d-flex flex-column align-items-center justify-content-center gap-2 p-4 w-100 h-100" style="min-height: 200px; background: rgba(37, 99, 235, 0.1); border-radius: var(--radius-lg);">
                  <span style="font-size: 4rem; line-height: 1;">📸</span>
                  <span class="badge bg-primary mt-1">HEIC Image</span>
                  <span class="small text-secondary text-center mt-1">HEIC format is fully supported for processing.</span>
                </div>
              `;
            } else {
              const img = document.createElement('img');
              img.id = 'cropper-target-image';
              img.src = URL.createObjectURL(file);
              img.style.maxWidth = '100%';
              img.style.display = 'block';
              thumbnailWrapper.appendChild(img);

              if (slug === 'crop-image') {
                thumbnailWrapper.style.maxHeight = 'none';
                thumbnailWrapper.style.height = 'auto';
                if (window.cropperInstance) {
                  window.cropperInstance.destroy();
                  window.cropperInstance = null;
                }
                img.onload = () => {
                  window.cropperInstance = new Cropper(img, {
                    viewMode: 1,
                    autoCropArea: 0.9,
                    responsive: true,
                    checkOrientation: false,
                    background: true
                  });
                };
              } else {
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.maxHeight = '350px';
                img.style.objectFit = 'contain';
              }
            }
          } else if (fileCategory === 'video' && thumbnailWrapper) {
            const video = document.createElement('video');
            video.src = URL.createObjectURL(file);
            video.controls = true;
            video.muted = true;
            video.style.width = '100%';
            video.style.height = '100%';
            video.style.maxHeight = '350px';
            video.style.objectFit = 'contain';
            thumbnailWrapper.appendChild(video);
          } else if (fileCategory === 'audio' && thumbnailWrapper) {
            const audio = document.createElement('audio');
            audio.src = URL.createObjectURL(file);
            audio.controls = true;
            audio.className = 'w-100 px-3';
            thumbnailWrapper.appendChild(audio);
          } else if (fileCategory === 'pdf' && thumbnailWrapper) {
            // Render all pages of PDF as preview (up to 15 pages) in a scrollable wrapper
            thumbnailWrapper.innerHTML = `
              <div class="d-flex flex-column align-items-center justify-content-center w-100 h-100" style="min-height: 250px; background: rgba(30, 41, 59, 0.2); border-radius: var(--radius-lg);">
                <div class="spinner-border text-primary mb-2" role="status" style="width: 1.5rem; height: 1.5rem;"></div>
                <div class="text-secondary small">Generating PDF previews...</div>
              </div>
            `;
            
            (async () => {
              try {
                // Ensure pdf.js is loaded
                if (typeof pdfjsLib === 'undefined') {
                  const libPath = '/vendor/pdfjs/pdf.min.js';
                  await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = libPath;
                    script.onload = resolve;
                    script.onerror = reject;
                    document.head.appendChild(script);
                  });
                }
                const lib = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
                if (!lib.GlobalWorkerOptions.workerSrc) {
                  lib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.js';
                }
                
                const arrayBuffer = await file.arrayBuffer();
                const loadingTask = lib.getDocument({ data: new Uint8Array(arrayBuffer) });
                const pdf = await loadingTask.promise;
                const totalPages = pdf.numPages;
                
                thumbnailWrapper.innerHTML = '';
                thumbnailWrapper.className = 'bg-light border';
                thumbnailWrapper.style.display = 'block';
                thumbnailWrapper.style.overflowY = 'auto';
                thumbnailWrapper.style.height = '400px';
                thumbnailWrapper.style.maxHeight = '400px';
                
                const limitPages = Math.min(totalPages, 15);
                
                for (let pageNum = 1; pageNum <= limitPages; pageNum++) {
                  const page = await pdf.getPage(pageNum);
                  const viewport = page.getViewport({ scale: 1.0 });
                  const canvas = document.createElement('canvas');
                  const context = canvas.getContext('2d');
                  
                  const scale = Math.min(1.5, 400 / viewport.width);
                  const scaledViewport = page.getViewport({ scale });
                  canvas.width = scaledViewport.width;
                  canvas.height = scaledViewport.height;
                  
                  context.fillStyle = '#ffffff';
                  context.fillRect(0, 0, canvas.width, canvas.height);
                  
                  await page.render({ canvasContext: context, viewport: scaledViewport }).promise;
                  
                  canvas.style.maxWidth = '100%';
                  canvas.style.height = 'auto';
                  canvas.style.borderRadius = '8px';
                  canvas.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
                  canvas.style.display = 'block';
                  canvas.style.margin = '14px auto';
                  thumbnailWrapper.appendChild(canvas);
                }
                
                if (totalPages > 15) {
                  const moreEl = document.createElement('div');
                  moreEl.className = 'text-center text-muted small py-2';
                  moreEl.textContent = `+ ${totalPages - 15} more pages`;
                  thumbnailWrapper.appendChild(moreEl);
                }
              } catch (err) {
                console.error('PDF preview rendering failed:', err);
                thumbnailWrapper.innerHTML = `
                  <div class="text-danger d-flex flex-column align-items-center gap-2 p-4">
                    <span style="font-size: 4rem; line-height: 1;">📕</span>
                    <span class="badge bg-danger">PDF File</span>
                    <span class="small text-secondary">${file.name}</span>
                  </div>
                `;
              }
            })();
          } else if (thumbnailWrapper) {
            thumbnailWrapper.innerHTML = `
              <div class="text-secondary d-flex flex-column align-items-center gap-2">
                <span style="font-size: 5rem; line-height: 1;">📁</span>
                <span class="badge bg-secondary">File</span>
              </div>
            `;
          }
        } else if (thumbnailWrapper) {
          if (filenameEl) filenameEl.textContent = `${files.length} files selected`;
          let totalBytes = 0;
          for (let i = 0; i < files.length; i++) {
            totalBytes += files[i].size;
          }
          if (filesizeEl) filesizeEl.textContent = `Total Size: ${formatBytes(totalBytes)}`;
          thumbnailWrapper.innerHTML = `
            <div class="text-primary d-flex flex-column align-items-center gap-2">
              <span style="font-size: 5rem; line-height: 1;">📚</span>
              <span class="badge bg-primary">Multiple Files</span>
            </div>
          `;
        }
      });
    }

    // Client-side file heuristic scanning for SQLi and viruses/executable code
    function scanFileClientSide(file) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = function (e) {
          const text = e.target.result.toLowerCase();
          const sqlPatterns = [
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
          const generalPatterns = [
            '<script',
            'javascript:',
            'onload=',
            'onerror=',
            'powershell',
            'cmd.exe',
            'eval(',
            'base64_decode'
          ];

          const foundSql = sqlPatterns.find(p => text.includes(p));
          if (foundSql) {
            resolve({ clean: false, reason: `Suspicious SQL syntax or payload detected (${foundSql}).` });
            return;
          }
          const foundGeneral = generalPatterns.find(p => text.includes(p));
          if (foundGeneral) {
            resolve({ clean: false, reason: `Suspicious executable pattern detected (${foundGeneral}).` });
            return;
          }
          resolve({ clean: true });
        };
        // Slice first 8KB to run fast and prevent memory issues with large files
        const slice = file.slice(0, 8192);
        reader.readAsText(slice);
      });
    }

    // Helper for AJAX Server submission
    function submitFormToServer() {
      // If there are no files, standard form submit
      if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        form.submit();
        return;
      }

      showProcessingModal('server');
      if (submitBtn) submitBtn.disabled = true;

      const startTime = Date.now();
      const csrfTokenInput = document.querySelector('input[name="_csrf"]');
      const csrfToken = csrfTokenInput ? csrfTokenInput.value : '';

      const xhr = new XMLHttpRequest();
      xhr.open('POST', form.action, true);
      if (csrfToken) {
        xhr.setRequestHeader('x-csrf-token', csrfToken);
      }

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);

          const progressEl = document.getElementById('browser-modal-progress-bar');
          if (progressEl) progressEl.style.width = `${percent}%`;

          const statusEl = document.getElementById('browser-modal-status');
          if (statusEl) statusEl.textContent = `Uploading files... ${percent}%`;

          const elapsed = (Date.now() - startTime) / 1000;
          if (elapsed > 0.1) {
            const bps = event.loaded / elapsed;
            let speedText = '';
            if (bps > 1024 * 1024) {
              speedText = (bps / (1024 * 1024)).toFixed(2) + ' MB/s';
            } else if (bps > 1024) {
              speedText = (bps / 1024).toFixed(2) + ' KB/s';
            } else {
              speedText = Math.round(bps) + ' B/s';
            }

            const bytesRemaining = event.total - event.loaded;
            const remainingSeconds = Math.round(bytesRemaining / bps);
            let timeText = '';
            if (remainingSeconds > 60) {
              timeText = Math.floor(remainingSeconds / 60) + 'm ' + (remainingSeconds % 60) + 's left';
            } else {
              timeText = remainingSeconds + 's left';
            }

            const uploadSpeedEl = document.getElementById('server-upload-speed');
            const uploadTimeEl = document.getElementById('server-upload-time');
            if (uploadSpeedEl) uploadSpeedEl.innerHTML = `Speed: <span class="fw-bold text-primary">${speedText}</span>`;
            if (uploadTimeEl) uploadTimeEl.innerHTML = `Time Remaining: <span class="fw-bold text-primary">${timeText}</span>`;

            if (percent >= 100) {
              if (statusEl) statusEl.textContent = `Processing on server... please wait.`;
              if (uploadTimeEl) uploadTimeEl.innerHTML = `Status: <span class="fw-bold text-primary">Processing on server...</span>`;
              if (uploadSpeedEl) uploadSpeedEl.innerHTML = `Please wait while server processes the file.`;
            }
          }
        }
      };

      const clearProcessingTimer = () => {
        if (window.processingInterval) {
          clearInterval(window.processingInterval);
          window.processingInterval = null;
        }
      };

      xhr.onload = () => {
        clearProcessingTimer();
        if (xhr.status >= 200 && xhr.status < 400) {
          hideProcessingModal();
          document.open();
          document.write(xhr.responseText);
          document.close();
        } else {
          errorProcessingModal('Upload or processing failed. Please check your files.');
          if (submitBtn) submitBtn.disabled = false;
        }
      };

      xhr.onerror = () => {
        clearProcessingTimer();
        errorProcessingModal('Network upload failure. Please verify connection.');
        if (submitBtn) submitBtn.disabled = false;
      };

      xhr.send(new FormData(form));
    }

    // Intercept form submission
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault(); // Prevent default synchronously to bypass async event loop race
        if (config.method === 'disabled') {
          alert('Tool processing is temporarily disabled by the administrator.');
          return;
        }

        // Validate upload size limit client-side
        const limitMb = config.method === 'browser' ? 500 : config.uploadLimitMb;
        const limitBytes = limitMb * 1024 * 1024;
        let totalUploadSize = 0;
        if (fileInput && fileInput.files) {
          for (let i = 0; i < fileInput.files.length; i++) {
            totalUploadSize += fileInput.files[i].size;
          }
        }
        if (totalUploadSize > limitBytes) {
          e.preventDefault();
          if (validationErrorEl) {
            validationErrorEl.textContent = `Selected files exceed the upload size limit of ${limitMb}MB.`;
            validationErrorEl.classList.remove('d-none');
          }
          return;
        }

        // Perform client-side security heuristic scan for SQLi and viruses
        if (fileInput && fileInput.files && fileInput.files.length > 0) {
          for (let i = 0; i < fileInput.files.length; i++) {
            const scanResult = await scanFileClientSide(fileInput.files[i]);
            if (!scanResult.clean) {
              e.preventDefault();
              if (validationErrorEl) {
                validationErrorEl.textContent = `Security Check Failed: ${scanResult.reason}`;
                validationErrorEl.classList.remove('d-none');
              }
              return;
            }
          }
        }

        // Validate target size for compressors
        const targetSizeInput = form.querySelector('input[name="targetSize"]');
        const targetUnitSelect = form.querySelector('select[name="targetUnit"]');
        if (targetSizeInput && targetUnitSelect && fileInput && fileInput.files.length > 0) {
          const targetSize = parseFloat(targetSizeInput.value) || 0;
          const targetUnit = targetUnitSelect.value || 'KB';
          let targetBytes = targetSize * 1024;
          if (targetUnit === 'MB') {
            targetBytes = targetSize * 1024 * 1024;
          }

          let originalBytes = 0;
          for (let i = 0; i < fileInput.files.length; i++) {
            originalBytes += fileInput.files[i].size;
          }

          if (targetBytes >= originalBytes) {
            e.preventDefault();
            if (validationErrorEl) {
              validationErrorEl.textContent = `Target size (${targetSize} ${targetUnit}) must be smaller than the uploaded file size (${formatBytes(originalBytes)}).`;
              validationErrorEl.classList.remove('d-none');
            }
            return;
          }
        }

        // BROWSER ONLY EXECUTION DISPATCHER
        if (config.method === 'browser' || slug === 'pdf-to-image') {
          e.preventDefault();
          if (submitBtn) submitBtn.disabled = true;
          if (validationErrorEl) validationErrorEl.classList.add('d-none');

          const browserResultContainer = document.getElementById('browser-result-container');
          if (browserResultContainer) browserResultContainer.classList.add('d-none');

          try {
            const formData = new FormData(form);
            const files = fileInput ? Array.from(fileInput.files || []) : [];
            const isInstantTool = [
              'compress-image', 'resize-image', 'crop-image', 
              'convert-jpg', 'convert-png', 'convert-webp', 
              'watermark-image', 'blur-image', 'thumbnail-generator',
              'qr-generator', 'barcode-generator', 'password-generator'
            ].includes(slug);

            if (!isInstantTool) {
              showProcessingModal('browser');
            }
            await runBrowserProcessing(slug, formData, files);
            if (!isInstantTool) {
              hideProcessingModal();
            }
          } catch (error) {
            console.error('Browser execution failed:', error);
            if (error && error.message === '__FALLBACK_TO_SERVER__') return; // handled

            if (slug === 'pdf-to-image') {
              let details = 'Unknown error';
              if (error) {
                if (error instanceof Error) {
                  details = `${error.name}: ${error.message}\n${error.stack}`;
                } else if (error instanceof Event || (error.target && error.type === 'error')) {
                  details = `Resource loading failed: "${error.target ? (error.target.src || error.target.href || 'unknown') : 'unknown'}"`;
                } else {
                  details = typeof error === 'object' ? JSON.stringify(error) : String(error);
                }
              }
              errorProcessingModal(`PDF to Image Conversion failed: ${details}`);
              if (submitBtn) submitBtn.disabled = false;
              return;
            }

            // Silently fall back to server processing!
            submitFormToServer();
          } finally {
            if (submitBtn) submitBtn.disabled = false;
          }
          return;
        }

        // Server execution path
        e.preventDefault();
        submitFormToServer();
      });
    }

    // Helper functions to show browser outputs
    function showBrowserTextResult(title, text) {
      const container = document.getElementById('browser-result-container');
      const titleEl = document.getElementById('browser-result-title');
      const textWrapper = document.getElementById('browser-result-text-wrapper');
      const textEl = document.getElementById('browser-result-text');
      const fileList = document.getElementById('browser-result-file-list');

      titleEl.textContent = title;
      textEl.textContent = text;

      textWrapper.classList.remove('d-none');
      fileList.classList.add('d-none');
      container.classList.remove('d-none');

      const copyBtn = document.getElementById('btn-copy-browser-text');
      if (copyBtn) {
        copyBtn.onclick = () => {
          navigator.clipboard.writeText(text);
          copyBtn.textContent = 'Copied!';
          setTimeout(() => { copyBtn.textContent = 'Copy Text'; }, 1500);
        };
      }
      container.scrollIntoView({ behavior: 'smooth' });

      // Log to PWA History
      if (typeof window.logToolHistory === 'function') {
        window.logToolHistory(slug, title, 'success', 'Text results generated');
      }
    }

    async function showBrowserFileResult(fileName, objectUrl, fileSize = 0, append = false, blob = null) {
      const container = document.getElementById('browser-result-container');
      const textWrapper = document.getElementById('browser-result-text-wrapper');
      const fileList = document.getElementById('browser-result-file-list');

      // Log to PWA History
      if (typeof window.logToolHistory === 'function') {
        window.logToolHistory(slug, `File: ${fileName}`, 'success', `File size: ${formatBytes(fileSize)}`);
      }

      // Random unique ID to target status element for this file
      const statusId = 'status_' + Math.random().toString(36).substring(2, 9);

      const itemHtml = `
        <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2 bg-white border rounded-3 p-3 mb-2">
          <div>
            <div class="fw-medium">${fileName}</div>
            ${fileSize ? `<span class="small text-muted font-monospace">${formatBytes(fileSize)}</span>` : ''}
            <div id="${statusId}" class="browser-upload-status small text-info mt-1">Saving to workspace...</div>
          </div>
          <a href="${objectUrl}" class="btn btn-outline-primary btn-sm" download="${fileName}">Download</a>
        </div>
      `;

      if (append) {
        fileList.insertAdjacentHTML('beforeend', itemHtml);
      } else {
        fileList.innerHTML = itemHtml;
      }

      textWrapper.classList.add('d-none');
      fileList.classList.remove('d-none');
      container.classList.remove('d-none');
      container.scrollIntoView({ behavior: 'smooth' });

      // Enforce zero server uploads if strategy is browser
      const statusEl = document.getElementById(statusId);
      if (config.storageStrategy === 'browser') {
        if (statusEl) statusEl.innerHTML = `<span class="text-muted">🔒 Sandbox Mode (Zero server uploads enabled)</span>`;
        return;
      }

      // Upload in the background to show in Workspace
      try {
        let blobToUpload = blob;
        if (!blobToUpload) {
          const response = await fetch(objectUrl);
          blobToUpload = await response.blob();
        }

        const uploadFormData = new FormData();
        uploadFormData.append('files', blobToUpload, fileName);
        uploadFormData.append('toolName', slug);

        const csrfTokenInput = document.querySelector('input[name="_csrf"]');
        const csrfToken = csrfTokenInput ? csrfTokenInput.value : '';

        const uploadRes = await fetch('/workspace/upload-browser-result', {
          method: 'POST',
          headers: {
            'x-csrf-token': csrfToken
          },
          body: uploadFormData
        });

        const uploadData = await uploadRes.json();
        if (uploadData.success) {
          if (statusEl) statusEl.innerHTML = `<span class="text-success">✔ Saved to Workspace!</span>`;
        } else {
          const reason = uploadData.reason || 'Failed to save to workspace.';
          if (statusEl) statusEl.innerHTML = `<span class="text-danger">✖ Security/Upload Error: ${reason}</span>`;
        }
      } catch (err) {
        console.error('Failed to sync browser result to workspace:', err);
        if (statusEl) statusEl.innerHTML = `<span class="text-danger">✖ Failed to save to workspace.</span>`;
      }
    }

    // Main Browser-Side Operations Dispatcher
    async function runBrowserProcessing(slug, formData, files) {
      // PDF Tools
      if (slug === 'pdf-to-image') {
        if (files.length === 0) throw new Error('Please select a PDF file.');
        const file = files[0];
        
        let lib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
        if (!lib) {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = '/vendor/pdfjs/pdf.min.js';
            script.onload = () => {
              lib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
              if (lib) {
                lib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.js';
              }
              resolve();
            };
            script.onerror = reject;
            document.head.appendChild(script);
          });
        } else {
          lib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.js';
        }
        
        if (typeof JSZip === 'undefined') {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = '/vendor/jszip/jszip.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
          });
        }

        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = lib.getDocument({ data: new Uint8Array(arrayBuffer) });
        const pdf = await loadingTask.promise;
        const totalPages = pdf.numPages;

        const zip = new JSZip();
        
        const progressEl = document.getElementById('browser-modal-progress-bar');
        const statusEl = document.getElementById('browser-modal-status');

        for (let i = 1; i <= totalPages; i++) {
          updateProcessingModalProgress(Math.round((i / totalPages) * 100), `Converting page ${i} of ${totalPages}...`);

          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 2.0 });
          
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const context = canvas.getContext('2d');
          
          // Paint background white (default background for PDFs)
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          
          await page.render({ canvasContext: context, viewport }).promise;
          
          const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
          zip.file(`page-${i}.png`, blob);
        }

        updateProcessingModalProgress(100, `Packaging images into ZIP file...`);
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        
        const zipName = `${file.name.replace(/\.pdf$/i, '')}_images.zip`;
        showBrowserFileResult(zipName, URL.createObjectURL(zipBlob), zipBlob.size, false, zipBlob);
      }
      else if (slug === 'merge-pdf') {
        if (files.length < 2) throw new Error('Please select at least 2 PDF files.');
        const mergedPdf = await PDFLib.PDFDocument.create();
        for (const file of files) {
          const bytes = await file.arrayBuffer();
          const doc = await PDFLib.PDFDocument.load(bytes);
          const copiedPages = await mergedPdf.copyPages(doc, doc.getPageIndices());
          copiedPages.forEach((page) => mergedPdf.addPage(page));
        }
        const pdfBytes = await mergedPdf.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        showBrowserFileResult('merged.pdf', URL.createObjectURL(blob), blob.size, false, blob);
      }
      else if (slug === 'rotate-pdf') {
        if (files.length === 0) throw new Error('Please select a PDF file.');
        const bytes = await files[0].arrayBuffer();
        const doc = await PDFLib.PDFDocument.load(bytes);
        const degrees = parseInt(formData.get('rotation') || 90);
        const pages = doc.getPages();
        pages.forEach((p) => p.setRotation(PDFLib.degrees(degrees)));
        const pdfBytes = await doc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        showBrowserFileResult(`rotated_${files[0].name}`, URL.createObjectURL(blob), blob.size, false, blob);
      }
      else if (slug === 'split-pdf') {
        if (files.length === 0) throw new Error('Please select a PDF file.');
        const bytes = await files[0].arrayBuffer();
        const doc = await PDFLib.PDFDocument.load(bytes);
        const totalPages = doc.getPageCount();
        const fileList = document.getElementById('browser-result-file-list');
        if (fileList) fileList.innerHTML = ''; // clear
        for (let i = 0; i < totalPages; i++) {
          const splitDoc = await PDFLib.PDFDocument.create();
          const [copiedPage] = await splitDoc.copyPages(doc, [i]);
          splitDoc.addPage(copiedPage);
          const pdfBytes = await splitDoc.save();
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          const name = `${files[0].name.replace(/\.pdf$/i, '')}_page_${i + 1}.pdf`;
          await showBrowserFileResult(name, URL.createObjectURL(blob), blob.size, i > 0, blob);
        }
      }
      else if (slug === 'compress-pdf') {
        if (files.length === 0) throw new Error('Please select a PDF file.');
        const bytes = await files[0].arrayBuffer();
        const doc = await PDFLib.PDFDocument.load(bytes);
        const compressedDoc = await PDFLib.PDFDocument.create();
        const copiedPages = await compressedDoc.copyPages(doc, doc.getPageIndices());
        copiedPages.forEach(p => compressedDoc.addPage(p));
        const pdfBytes = await compressedDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        showBrowserFileResult(`compressed_${files[0].name}`, URL.createObjectURL(blob), blob.size, false, blob);
      }
      else if (slug === 'pdf-page-numbering') {
        if (files.length === 0) throw new Error('Please select a PDF file.');
        const bytes = await files[0].arrayBuffer();
        const doc = await PDFLib.PDFDocument.load(bytes);
        const pages = doc.getPages();
        const position = formData.get('position') || 'bottom-right';
        const startNumber = parseInt(formData.get('startNumber') || 1);

        for (let i = 0; i < pages.length; i++) {
          const page = pages[i];
          const { width, height } = page.getSize();
          const pageNumText = `${i + startNumber}`;

          let x = width - 50;
          let y = 30;
          if (position === 'bottom-left') {
            x = 50;
          } else if (position === 'bottom-center') {
            x = width / 2;
          } else if (position === 'top-left') {
            x = 50;
            y = height - 30;
          } else if (position === 'top-center') {
            x = width / 2;
            y = height - 30;
          } else if (position === 'top-right') {
            x = width - 50;
            y = height - 30;
          }

          page.drawText(pageNumText, {
            x: x,
            y: y,
            size: 10,
            color: PDFLib.rgb(0, 0, 0)
          });
        }

        const pdfBytes = await doc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        showBrowserFileResult(`numbered_${files[0].name}`, URL.createObjectURL(blob), blob.size, false, blob);
      }
      else if (slug === 'image-to-pdf') {
        if (files.length === 0) throw new Error('Please select an image file.');
        
        // Maintain ultra-high print resolution and quality bounds (2000px max boundary at 95% quality)
        const maxDim = 2000;
        const compressQuality = 0.95;
        const yieldMs = files.length <= 50 ? 5 : 25; // Yield thread to let browser GC and paint reflows safely

        const getEmbeddableImage = async (file) => {
          const isSmall = file.size < 1.5 * 1024 * 1024;
          
          // Embed raw for files under 1.5MB to preserve 100% original quality
          if (isSmall) {
            const bytes = await file.arrayBuffer();
            return new Promise((resolve) => {
              const img = new Image();
              img.src = URL.createObjectURL(file);
              img.onload = () => {
                URL.revokeObjectURL(img.src);
                resolve({
                  bytes: bytes,
                  width: img.width,
                  height: img.height,
                  type: file.type || (file.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg')
                });
              };
              img.onerror = () => {
                resolve({
                  bytes: bytes,
                  width: 800,
                  height: 1000,
                  type: 'image/jpeg'
                });
              };
            });
          }

          // Otherwise, compress at high fidelity (95% quality). Free canvas backing store immediately in callbacks.
          return new Promise((resolve) => {
            const img = new Image();
            img.src = URL.createObjectURL(file);
            img.onload = () => {
              URL.revokeObjectURL(img.src);
              let w = img.width;
              let h = img.height;
              if (w > maxDim || h > maxDim) {
                if (w > h) {
                  h = Math.round((h * maxDim) / w);
                  w = maxDim;
                } else {
                  w = Math.round((w * maxDim) / h);
                  h = maxDim;
                }
              }

              const canvas = document.createElement('canvas');
              canvas.width = w;
              canvas.height = h;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, w, h);
              
              canvas.toBlob((blob) => {
                // Free canvas buffer and GPU textures immediately
                canvas.width = 0;
                canvas.height = 0;
                
                const reader = new FileReader();
                reader.onloadend = () => {
                  resolve({
                    bytes: reader.result,
                    width: w,
                    height: h,
                    type: 'image/jpeg'
                  });
                };
                reader.readAsArrayBuffer(blob);
              }, 'image/jpeg', compressQuality);
            };
            img.onerror = () => {
              const reader = new FileReader();
              reader.onloadend = () => {
                resolve({
                  bytes: reader.result,
                  width: 800,
                  height: 1000,
                  type: 'image/jpeg'
                });
              };
              reader.readAsArrayBuffer(file);
            };
          });
        };

        const pdfDoc = await PDFLib.PDFDocument.create();
        
        for (let i = 0; i < files.length; i++) {
          updateProcessingModalProgress(Math.round((i / files.length) * 100), `Processing image ${i + 1} of ${files.length}...`);
          
          const file = files[i];
          const { bytes, width, height, type } = await getEmbeddableImage(file);
          
          let pdfImg;
          if (type === 'image/png') {
            pdfImg = await pdfDoc.embedPng(bytes);
          } else {
            pdfImg = await pdfDoc.embedJpg(bytes);
          }
          
          const page = pdfDoc.addPage([width, height]);
          page.drawImage(pdfImg, {
            x: 0,
            y: 0,
            width: width,
            height: height
          });
          
          // Yield to main thread to allow garbage collection and progress bar rendering
          await new Promise(resolve => setTimeout(resolve, yieldMs));
        }
        updateProcessingModalProgress(100, 'Generating PDF document...');
        await new Promise(resolve => setTimeout(resolve, 80)); // let UI status render
        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        showBrowserFileResult('image_to_pdf.pdf', URL.createObjectURL(blob), blob.size, false, blob);
      }
      else if (slug === 'extract-pages') {
        if (files.length === 0) throw new Error('Please select a PDF file.');
        const pagesStr = formData.get('pages') || '';
        const bytes = await files[0].arrayBuffer();
        const doc = await PDFLib.PDFDocument.load(bytes);
        const totalPages = doc.getPageCount();

        const pageIndices = [];
        if (pagesStr.includes('-')) {
          const parts = pagesStr.split('-');
          const start = parseInt(parts[0]) - 1;
          const end = parseInt(parts[1]) - 1;
          for (let i = start; i <= end; i++) {
            if (i >= 0 && i < totalPages) pageIndices.push(i);
          }
        } else {
          pagesStr.split(',').forEach(p => {
            const idx = parseInt(p.trim()) - 1;
            if (idx >= 0 && idx < totalPages) pageIndices.push(idx);
          });
        }

        if (pageIndices.length === 0) throw new Error('No valid page numbers specified.');

        const newDoc = await PDFLib.PDFDocument.create();
        const copiedPages = await newDoc.copyPages(doc, pageIndices);
        copiedPages.forEach(p => newDoc.addPage(p));
        const pdfBytes = await newDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        showBrowserFileResult(`extracted_${files[0].name}`, URL.createObjectURL(blob), blob.size, false, blob);
      }
      else if (slug === 'delete-pages') {
        if (files.length === 0) throw new Error('Please select a PDF file.');
        const pagesStr = formData.get('pages') || '';
        const bytes = await files[0].arrayBuffer();
        const doc = await PDFLib.PDFDocument.load(bytes);
        const totalPages = doc.getPageCount();

        const excludedIndices = new Set();
        if (pagesStr.includes('-')) {
          const parts = pagesStr.split('-');
          const start = parseInt(parts[0]) - 1;
          const end = parseInt(parts[1]) - 1;
          for (let i = start; i <= end; i++) {
            if (i >= 0 && i < totalPages) excludedIndices.add(i);
          }
        } else {
          pagesStr.split(',').forEach(p => {
            const idx = parseInt(p.trim()) - 1;
            if (idx >= 0 && idx < totalPages) excludedIndices.add(idx);
          });
        }

        const pageIndices = [];
        for (let i = 0; i < totalPages; i++) {
          if (!excludedIndices.has(i)) pageIndices.push(i);
        }

        if (pageIndices.length === 0) throw new Error('Cannot delete all pages of the document.');

        const newDoc = await PDFLib.PDFDocument.create();
        const copiedPages = await newDoc.copyPages(doc, pageIndices);
        copiedPages.forEach(p => newDoc.addPage(p));
        const pdfBytes = await newDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        showBrowserFileResult(`deleted_pages_${files[0].name}`, URL.createObjectURL(blob), blob.size, false, blob);
      }
      else if (slug === 'add-watermark') {
        if (files.length === 0) throw new Error('Please select a PDF file.');
        const text = formData.get('text') || 'Confidential';
        const bytes = await files[0].arrayBuffer();
        const doc = await PDFLib.PDFDocument.load(bytes);
        const pages = doc.getPages();

        for (const page of pages) {
          const { width, height } = page.getSize();
          page.drawText(text, {
            x: width / 4,
            y: height / 2,
            size: Math.round(width * 0.08),
            color: PDFLib.rgb(0.7, 0.7, 0.7),
            opacity: 0.4,
            rotate: PDFLib.degrees(45)
          });
        }

        const pdfBytes = await doc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        showBrowserFileResult(`watermarked_${files[0].name}`, URL.createObjectURL(blob), blob.size, false, blob);
      }

      // Image Tools
      else if (slug === 'compress-image') {
        if (files.length === 0) throw new Error('Please select an image file.');
        const file = files[0];
        const targetSize = parseFloat(formData.get('targetSize') || 80);
        const targetUnit = formData.get('targetUnit') || 'KB';
        let targetBytes = targetSize * 1024;
        if (targetUnit === 'MB') targetBytes = targetSize * 1024 * 1024;

        await new Promise((resolve, reject) => {
          const img = new Image();
          img.src = URL.createObjectURL(file);
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            let compressionRatio = 0.8;
            if (targetBytes < file.size * 0.2) {
              compressionRatio = 0.5;
              canvas.width = Math.round(img.width * 0.8);
              canvas.height = Math.round(img.height * 0.8);
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            }

            canvas.toBlob((blob) => {
              showBrowserFileResult(`compressed_${file.name}`, URL.createObjectURL(blob), blob.size);
              resolve();
            }, 'image/jpeg', compressionRatio);
          };
          img.onerror = () => reject(new Error('Failed to load image file.'));
        });
      }
      else if (slug === 'resize-image') {
        if (files.length === 0) throw new Error('Please select an image file.');
        const file = files[0];
        const w = parseInt(formData.get('width') || 800);
        const h = parseInt(formData.get('height') || 600);
        await new Promise((resolve, reject) => {
          const img = new Image();
          img.src = URL.createObjectURL(file);
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            canvas.toBlob((blob) => {
              showBrowserFileResult(`resized_${file.name}`, URL.createObjectURL(blob), blob.size);
              resolve();
            }, file.type, 1.0);
          };
          img.onerror = () => reject(new Error('Failed to load image file.'));
        });
      }
      else if (slug === 'crop-image') {
        if (files.length === 0) throw new Error('Please select an image file.');
        const file = files[0];
        if (window.cropperInstance) {
          const canvas = window.cropperInstance.getCroppedCanvas();
          if (!canvas) throw new Error('Failed to capture cropped canvas.');
          await new Promise((resolve) => {
            canvas.toBlob((blob) => {
              showBrowserFileResult(`cropped_${file.name}`, URL.createObjectURL(blob), blob.size);
              resolve();
            }, file.type, 1.0);
          });
        } else {
          const w = parseInt(formData.get('width') || 300);
          const h = parseInt(formData.get('height') || 300);
          await new Promise((resolve, reject) => {
            const img = new Image();
            img.src = URL.createObjectURL(file);
            img.onload = () => {
              const canvas = document.createElement('canvas');
              canvas.width = w;
              canvas.height = h;
              const ctx = canvas.getContext('2d');
              const sourceX = (img.width - w) / 2;
              const sourceY = (img.height - h) / 2;
              ctx.drawImage(img, sourceX, sourceY, w, h, 0, 0, w, h);
              canvas.toBlob((blob) => {
                showBrowserFileResult(`cropped_${file.name}`, URL.createObjectURL(blob), blob.size);
                resolve();
              }, file.type, 1.0);
            };
            img.onerror = () => reject(new Error('Failed to load image file.'));
          });
        }
      }
      else if (slug === 'convert-jpg' || slug === 'convert-png' || slug === 'convert-webp') {
        if (files.length === 0) throw new Error('Please select an image file.');
        const file = files[0];
        const targetType = slug === 'convert-png' ? 'image/png' : slug === 'convert-webp' ? 'image/webp' : 'image/jpeg';
        const extension = slug === 'convert-png' ? 'png' : slug === 'convert-webp' ? 'webp' : 'jpg';

        await new Promise((resolve, reject) => {
          const img = new Image();
          img.src = URL.createObjectURL(file);
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            canvas.toBlob((blob) => {
              const rawName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
              showBrowserFileResult(`${rawName}.${extension}`, URL.createObjectURL(blob), blob.size);
              resolve();
            }, targetType, 1.0);
          };
          img.onerror = () => reject(new Error('Failed to load image file.'));
        });
      }
      else if (slug === 'watermark-image') {
        if (files.length === 0) throw new Error('Please select an image file.');
        const file = files[0];
        const text = formData.get('text') || 'Confidential';

        await new Promise((resolve, reject) => {
          const img = new Image();
          img.src = URL.createObjectURL(file);
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            ctx.font = `${Math.round(img.width * 0.05)}px sans-serif`;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.textAlign = 'center';
            ctx.fillText(text, img.width / 2, img.height / 2);

            canvas.toBlob((blob) => {
              showBrowserFileResult(`watermarked_${file.name}`, URL.createObjectURL(blob), blob.size);
              resolve();
            }, file.type);
          };
          img.onerror = () => reject(new Error('Failed to load image file.'));
        });
      }
      else if (slug === 'blur-image') {
        if (files.length === 0) throw new Error('Please select an image file.');
        const file = files[0];
        const blurValue = parseInt(formData.get('value') || 10);

        await new Promise((resolve, reject) => {
          const img = new Image();
          img.src = URL.createObjectURL(file);
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.filter = `blur(${blurValue}px)`;
            ctx.drawImage(img, 0, 0);
            canvas.toBlob((blob) => {
              showBrowserFileResult(`blurred_${file.name}`, URL.createObjectURL(blob), blob.size);
              resolve();
            }, file.type);
          };
          img.onerror = () => reject(new Error('Failed to load image file.'));
        });
      }
      else if (slug === 'thumbnail-generator') {
        if (files.length === 0) throw new Error('Please select an image file.');
        const file = files[0];

        await new Promise((resolve, reject) => {
          const img = new Image();
          img.src = URL.createObjectURL(file);
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 150;
            canvas.height = 150;
            const ctx = canvas.getContext('2d');
            const size = Math.min(img.width, img.height);
            const x = (img.width - size) / 2;
            const y = (img.height - size) / 2;
            ctx.drawImage(img, x, y, size, size, 0, 0, 150, 150);
            canvas.toBlob((blob) => {
              showBrowserFileResult(`thumb_${file.name}`, URL.createObjectURL(blob), blob.size);
              resolve();
            }, file.type);
          };
          img.onerror = () => reject(new Error('Failed to load image file.'));
        });
      }

      // Utility / Developer / Text Tools
      else if (slug === 'qr-generator') {
        const val = formData.get('value');
        if (!val) throw new Error('Please enter text for the QR code.');
        if (!window.QRCode) throw new Error('QR engine is loading, please try again.');

        const tempDiv = document.createElement('div');
        new QRCode(tempDiv, {
          text: val,
          width: 256,
          height: 256
        });
        setTimeout(() => {
          const target = tempDiv.querySelector('img') || tempDiv.querySelector('canvas');
          if (target) {
            showBrowserFileResult('qrcode.png', target.src || target.toDataURL());
          } else {
            throw new Error('Failed to render QR Code.');
          }
        }, 100);
      }
      else if (slug === 'barcode-generator') {
        const val = formData.get('value');
        if (!val) throw new Error('Please enter text for the barcode.');
        if (!window.JsBarcode) throw new Error('Barcode engine is loading, please try again.');

        const format = formData.get('format') || 'code128';
        const canvas = document.createElement('canvas');
        JsBarcode(canvas, val, { format: format });
        showBrowserFileResult('barcode.png', canvas.toDataURL());
      }
      else if (slug === 'password-generator') {
        const length = parseInt(formData.get('length') || 16);
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+';
        let pass = '';
        const array = new Uint32Array(length);
        window.crypto.getRandomValues(array);
        for (let i = 0; i < length; i++) {
          pass += chars[array[i] % chars.length];
        }
        showBrowserTextResult('Generated Password', pass);
      }
      else if (slug === 'password-strength-checker') {
        const text = formData.get('text') || '';
        let score = 0;
        if (text.length >= 12) score += 2;
        if (/[a-z]/.test(text)) score += 1;
        if (/[A-Z]/.test(text)) score += 1;
        if (/[0-9]/.test(text)) score += 1;
        if (/[^A-Za-z0-9]/.test(text)) score += 1;

        const rating = score >= 5 ? 'Strong' : score >= 3 ? 'Moderate' : 'Weak';
        showBrowserTextResult('Password Strength Review', `Complexity Score: ${score}/6\nRating: ${rating}`);
      }
      else if (slug === 'json-formatter') {
        const text = formData.get('text') || '';
        const parsed = JSON.parse(text);
        showBrowserTextResult('Formatted JSON Output', JSON.stringify(parsed, null, 2));
      }
      else if (slug === 'json-validator') {
        const text = formData.get('text') || '';
        try {
          JSON.parse(text);
          showBrowserTextResult('Validation Status', 'Success: JSON structure is completely valid.');
        } catch (e) {
          showBrowserTextResult('Validation Status', `Syntax Error detected: ${e.message}`);
        }
      }
      else if (slug === 'base64-encoder') {
        const text = formData.get('text') || '';
        showBrowserTextResult('Base64 Encoded Text', btoa(text));
      }
      else if (slug === 'base64-decoder') {
        const text = formData.get('text') || '';
        showBrowserTextResult('Decoded Text Output', atob(text));
      }
      else if (slug === 'url-encoder') {
        const text = formData.get('text') || '';
        showBrowserTextResult('URL Encoded Output', encodeURIComponent(text));
      }
      else if (slug === 'url-decoder') {
        const text = formData.get('text') || '';
        showBrowserTextResult('URL Decoded Output', decodeURIComponent(text));
      }
      else if (slug === 'uuid-generator') {
        showBrowserTextResult('Generated UUID v4', window.crypto.randomUUID());
      }
      else if (slug === 'jwt-decoder') {
        const text = formData.get('text') || '';
        const parts = text.split('.');
        if (parts.length !== 3) throw new Error('Invalid JWT format.');
        const header = JSON.parse(atob(parts[0]));
        const payload = JSON.parse(atob(parts[1]));
        showBrowserTextResult('Decoded JWT Structure', `HEADER:\n${JSON.stringify(header, null, 2)}\n\nPAYLOAD:\n${JSON.stringify(payload, null, 2)}`);
      }
      else if (slug === 'regex-tester') {
        const text = formData.get('text') || '';
        const pattern = formData.get('pattern') || '';
        const flags = formData.get('flags') || '';
        const regex = new RegExp(pattern, flags);
        const match = text.match(regex);
        showBrowserTextResult('Regex Test Results', match ? `Matches Found:\n${JSON.stringify(match, null, 2)}` : 'No matches found.');
      }
      else if (slug === 'hash-generator') {
        const text = formData.get('text') || '';
        const algo = formData.get('algorithm') || 'SHA-256';
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const hashBuffer = await crypto.subtle.digest(algo, data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        showBrowserTextResult(`${algo} Hash Output`, hashHex);
      }
      else if (slug === 'word-counter') {
        const text = formData.get('text') || '';
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        const chars = text.length;
        const sentences = text.split(/[.!?]+/).filter(Boolean).length;
        showBrowserTextResult('Word Count Summary', `Words: ${words}\nCharacters: ${chars}\nSentences: ${sentences}`);
      }
      else if (slug === 'text-case-converter') {
        const text = formData.get('text') || '';
        const mode = formData.get('mode') || 'upper';
        let result = '';
        if (mode === 'upper') result = text.toUpperCase();
        else if (mode === 'lower') result = text.toLowerCase();
        else {
          result = text.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
        }
        showBrowserTextResult('Case Converted Output', result);
      }
      else if (slug === 'age-calculator') {
        const birthDateStr = formData.get('birthDate');
        if (!birthDateStr) throw new Error('Please select a date of birth.');
        const birthDate = new Date(birthDateStr);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
          age--;
        }
        showBrowserTextResult('Age Result', `Calculated Age: ${age} years old.`);
      }
      else if (slug === 'unit-converter') {
        const kind = formData.get('kind') || 'length';
        const val = parseFloat(formData.get('value') || 1);
        const from = (formData.get('from') || '').trim().toLowerCase();
        const to = (formData.get('to') || '').trim().toLowerCase();

        let result = val;
        if (kind === 'length') {
          // base: meter
          let meters = val;
          if (from === 'km') meters = val * 1000;
          else if (from === 'mile') meters = val * 1609.34;

          if (to === 'km') result = meters / 1000;
          else if (to === 'mile') result = meters / 1609.34;
          else result = meters;
        } else if (kind === 'mass') {
          // base: kg
          let kgs = val;
          if (from === 'g') kgs = val / 1000;
          else if (from === 'lb') kgs = val * 0.453592;

          if (to === 'g') result = kgs * 1000;
          else if (to === 'lb') result = kgs / 0.453592;
          else result = kgs;
        } else if (kind === 'temperature') {
          if (from === 'c' && to === 'f') result = (val * 9 / 5) + 32;
          else if (from === 'f' && to === 'c') result = (val - 32) * 5 / 9;
        }
        showBrowserTextResult('Conversion Output', `${val} ${from} = ${result.toFixed(4)} ${to}`);
      }
      else if (slug === 'reorder-pages') {
        if (files.length === 0) throw new Error('Please select a PDF file.');
        const pagesStr = formData.get('pages') || '';
        const bytes = await files[0].arrayBuffer();
        const doc = await PDFLib.PDFDocument.load(bytes);
        const totalPages = doc.getPageCount();

        const pageIndices = [];
        if (pagesStr.includes('-')) {
          const parts = pagesStr.split('-');
          const start = parseInt(parts[0]) - 1;
          const end = parseInt(parts[1]) - 1;
          for (let i = start; i <= end; i++) {
            if (i >= 0 && i < totalPages) pageIndices.push(i);
          }
        } else {
          pagesStr.split(',').forEach(p => {
            const idx = parseInt(p.trim()) - 1;
            if (idx >= 0 && idx < totalPages) pageIndices.push(idx);
          });
        }

        if (pageIndices.length === 0) throw new Error('No valid page numbers specified.');

        const newDoc = await PDFLib.PDFDocument.create();
        const copiedPages = await newDoc.copyPages(doc, pageIndices);
        copiedPages.forEach(p => newDoc.addPage(p));
        const pdfBytes = await newDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        showBrowserFileResult(`reordered_${files[0].name}`, URL.createObjectURL(blob), blob.size);
      }
      else if (slug === 'text-cleaner') {
        const text = formData.get('text') || '';
        let cleaned = text.replace(/<\/?[^>]+(>|$)/g, ""); // Strip HTML
        cleaned = cleaned.replace(/[ \t]+/g, " "); // Double spaces
        cleaned = cleaned.replace(/\r?\n\s*\r?\n/g, "\n"); // Double lines
        cleaned = cleaned.split('\n').map(line => line.trim()).join('\n');
        showBrowserTextResult('Cleaned Text', cleaned.trim());
      }
      else if (slug === 'duplicate-line-remover') {
        const text = formData.get('text') || '';
        const lines = text.split(/\r?\n/);
        const unique = Array.from(new Set(lines));
        showBrowserTextResult('Deduplicated Lines', unique.join('\n'));
      }
      else if (slug === 'gst-calculator') {
        const val = parseFloat(formData.get('value') || 0);
        const rate = parseFloat(formData.get('length') || 18);
        const gst = val * (rate / 100);
        const total = val + gst;
        showBrowserTextResult('GST Calculations', `GST Amount: ${gst.toFixed(2)}\nTotal (Including Tax): ${total.toFixed(2)}`);
      }
      else if (slug === 'emi-calculator' || slug === 'loan-calculator') {
        const principal = parseFloat(formData.get('value') || 0);
        const annualRate = parseFloat(formData.get('length') || 10);
        const months = parseFloat(formData.get('pages') || 12);
        const monthlyRate = annualRate / 12 / 100;
        const emi = monthlyRate ? (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1) : principal / months;
        const totalRepayment = emi * months;
        const totalInterest = totalRepayment - principal;
        showBrowserTextResult('Loan Installments (EMI) Summary', `Monthly EMI: ${emi.toFixed(2)}\nTotal Interest Payable: ${totalInterest.toFixed(2)}\nTotal Repayment: ${totalRepayment.toFixed(2)}`);
      }
      else if (['video', 'audio'].includes(getToolCategory(slug))) {
        await runFFmpegBrowserProcessing(slug, formData, files);
      }
      else {
        throw new Error('This tool is not supported in browser-only processing mode.');
      }
    }
  }

  // Determine tool category from slug
  function getToolCategory(slug) {
    const videoSlugs = ['video-compressor', 'video-trimmer', 'video-merger', 'video-resolution-changer', 'video-to-gif', 'gif-to-video', 'thumbnail-extractor', 'video-metadata-viewer', 'video-mute-tool', 'video-speed-controller'];
    const audioSlugs = ['audio-converter', 'mp3-cutter', 'audio-merger', 'volume-booster', 'audio-speed-changer', 'audio-metadata-viewer', 'audio-compressor'];
    if (videoSlugs.includes(slug)) return 'video';
    if (audioSlugs.includes(slug)) return 'audio';
    return 'other';
  }

  // ── FFmpeg.wasm Browser Processing ──────────────────────────────────────────
  let ffmpegInstance = null;
  let ffmpegLoaded = false;
  let processingModal = null;
  let countdownInterval = null;
  let remainingSeconds = 30;
  let processingStartTime = null;

  function initProcessingModal() {
    if (window.bootstrap && bootstrap.Modal) {
      const modalEl = document.getElementById('browserProcessingModal');
      if (modalEl) {
        processingModal = new bootstrap.Modal(modalEl, {
          backdrop: 'static',
          keyboard: false
        });
      }
    }
  }

  function hideProcessingModal() {
    if (countdownInterval) clearInterval(countdownInterval);
    if (processingModal) {
      processingModal.hide();
      setTimeout(() => {
        const backdrops = document.querySelectorAll('.modal-backdrop');
        if (backdrops.length > 0) {
          backdrops.forEach(b => b.remove());
          document.body.classList.remove('modal-open');
          document.body.style.overflow = '';
          document.body.style.paddingRight = '';
        }
      }, 500);
    }
  }

  function showProcessingModal(mode = 'browser', estimateSeconds = null) {
    initProcessingModal();
    if (processingModal) {
      if (countdownInterval) clearInterval(countdownInterval);
      processingStartTime = Date.now();

      // If estimateSeconds is not provided, calculate it dynamically based on the current page context (slug, files)
      if (estimateSeconds === null) {
        const fileInput = document.getElementById('media-file-input');
        const files = fileInput ? Array.from(fileInput.files || []) : [];
        let totalSize = 0;
        for (let i = 0; i < files.length; i++) {
          totalSize += files[i].size;
        }
        
        const isFfmpeg = slug.startsWith('video-') || slug.startsWith('audio-') || slug === 'gif-to-video' || slug === 'mp3-cutter' || slug === 'audio-merger';
        
        if (isFfmpeg) {
          const isVideo = slug.startsWith('video-') || slug === 'gif-to-video';
          const factor = isVideo ? 1.5 : 0.5;
          const sizeMb = totalSize / (1024 * 1024);
          estimateSeconds = Math.max(15, Math.ceil(sizeMb * factor));
        } else if (slug === 'pdf-to-image') {
          estimateSeconds = Math.max(5, Math.ceil((totalSize / (1024 * 1024)) * 2));
        } else if (slug === 'image-to-pdf') {
          estimateSeconds = Math.max(5, Math.ceil(files.length * 0.3));
        } else {
          estimateSeconds = 30; // Fallback default
        }
      }

      // Reset modal UI to processing state
      document.getElementById('browser-modal-spinner').classList.remove('d-none');
      document.getElementById('browser-modal-progress-container').classList.remove('d-none');
      document.getElementById('browser-modal-timer-container').classList.remove('d-none');
      document.getElementById('browser-modal-result-section').classList.add('d-none');
      document.getElementById('btn-close-browser-modal').classList.add('d-none');

      const titleEl = document.getElementById('browserProcessingModalLabel');
      const statusEl = document.getElementById('browser-modal-status');
      const progressEl = document.getElementById('browser-modal-progress-bar');
      const timerContainer = document.getElementById('browser-modal-timer-container');

      if (progressEl) progressEl.style.width = '0%';

      if (mode === 'browser') {
        if (titleEl) titleEl.textContent = '🔒 Local Sandbox Processing';
        if (statusEl) statusEl.textContent = 'Initialising processing engine...';
        if (timerContainer) {
          timerContainer.innerHTML = `Estimated time remaining: <span id="browser-modal-countdown" class="fw-bold text-primary">${estimateSeconds}</span> seconds`;
        }

        // Start countdown
        remainingSeconds = estimateSeconds;
        countdownInterval = setInterval(() => {
          remainingSeconds--;
          const countdownEl2 = document.getElementById('browser-modal-countdown');
          if (remainingSeconds <= 0) {
            if (countdownEl2) countdownEl2.textContent = '0';
            const timerContainer2 = document.getElementById('browser-modal-timer-container');
            if (timerContainer2) timerContainer2.textContent = 'Finishing up...';
            clearInterval(countdownInterval);
          } else {
            if (countdownEl2) countdownEl2.textContent = remainingSeconds;
          }
        }, 1000);
      } else {
        if (titleEl) titleEl.textContent = '⚡ Secure Server Upload & Processing';
        if (statusEl) statusEl.textContent = 'Uploading files to server... 0%';
        if (timerContainer) {
          timerContainer.innerHTML = `
            <div id="server-upload-time" class="mb-1">Time Remaining: <span class="fw-bold text-primary">Calculating...</span></div>
            <div id="server-upload-speed" class="small text-secondary">Speed: <span class="fw-bold text-primary">0 KB/s</span></div>
          `;
        }
      }

      processingModal.show();
    }
  }

  function updateProcessingModalProgress(percent, statusMsg) {
    const progressEl = document.getElementById('browser-modal-progress-bar');
    if (progressEl) progressEl.style.width = `${percent}%`;

    const statusEl = document.getElementById('browser-modal-status');
    if (statusEl) statusEl.textContent = statusMsg || `Processing: ${percent}%`;

    // Dynamically adjust estimated time remaining based on active progress!
    if (percent > 3 && processingStartTime) {
      const elapsed = (Date.now() - processingStartTime) / 1000;
      let remaining = Math.round(elapsed * (100 - percent) / percent);
      if (remaining < 1 && percent < 100) remaining = 1;
      
      remainingSeconds = remaining;
      const countdownEl2 = document.getElementById('browser-modal-countdown');
      const timerContainer = document.getElementById('browser-modal-timer-container');
      
      if (percent >= 100) {
        if (timerContainer) timerContainer.textContent = 'Finishing up...';
        if (countdownInterval) clearInterval(countdownInterval);
      } else {
        if (countdownEl2) {
          countdownEl2.textContent = remaining;
        } else if (timerContainer) {
          timerContainer.innerHTML = `Estimated time remaining: <span id="browser-modal-countdown" class="fw-bold text-primary">${remaining}</span> seconds`;
        }
      }
    }
  }

  function completeProcessingModal(fileName, objectUrl, fileSize) {
    if (countdownInterval) clearInterval(countdownInterval);

    // Hide processing spinners and bars
    document.getElementById('browser-modal-spinner').classList.add('d-none');
    document.getElementById('browser-modal-progress-container').classList.add('d-none');
    document.getElementById('browser-modal-timer-container').classList.add('d-none');

    const statusEl = document.getElementById('browser-modal-status');
    if (statusEl) statusEl.textContent = 'Processing Complete!';

    // Populate result/download sections
    document.getElementById('browser-modal-result-filename').textContent = fileName;
    document.getElementById('browser-modal-result-size').textContent = fileSize ? formatBytes(fileSize) : '';

    const downloadBtn = document.getElementById('browser-modal-download-btn');
    if (downloadBtn) {
      downloadBtn.href = objectUrl;
      downloadBtn.download = fileName;
      downloadBtn.onclick = () => {
        hideProcessingModal();
      };
    }

    document.getElementById('browser-modal-result-section').classList.remove('d-none');

    // Allow closing/dismissing the modal
    const closeBtn = document.getElementById('btn-close-browser-modal');
    if (closeBtn) closeBtn.classList.remove('d-none');
  }

  function errorProcessingModal(errorMsg) {
    if (countdownInterval) clearInterval(countdownInterval);

    document.getElementById('browser-modal-spinner').classList.add('d-none');
    document.getElementById('browser-modal-progress-container').classList.add('d-none');
    document.getElementById('browser-modal-timer-container').classList.add('d-none');

    const statusEl = document.getElementById('browser-modal-status');
    if (statusEl) statusEl.innerHTML = `<span class="text-danger">⚠️ Error: ${errorMsg}</span>`;

    // Allow closing/dismissing the modal
    const closeBtn = document.getElementById('btn-close-browser-modal');
    if (closeBtn) closeBtn.classList.remove('d-none');
  }

  async function getFFmpeg() {
    if (ffmpegLoaded) return ffmpegInstance;

    // Wait up to 15 seconds for the CDN script to finish loading
    const deadline = Date.now() + 15000;
    while (window._ffmpegLoadStatus === 'loading' && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 200));
    }

    if (window._ffmpegLoadStatus === 'failed' || typeof FFmpeg === 'undefined' || !FFmpeg.createFFmpeg) {
      // FFmpeg CDN unavailable — silently fall back to server
      if (processingModal) {
        processingModal.hide();
      }
      const form = document.getElementById('tool-execution-form');
      if (form) {
        const statusContainer = document.getElementById('ffmpeg-status-container');
        if (statusContainer) {
          statusContainer.innerHTML = `<div class="alert alert-warning border-0 shadow-sm p-3 mt-3">
            <strong>⚡ Switching to server processing</strong> — browser engine unavailable. Uploading to server...
          </div>`;
        }
        // Submit form to server instead
        setTimeout(() => form.submit(), 800);
      }
      throw new Error('__FALLBACK_TO_SERVER__'); // sentinel — caught silently
    }

    updateProcessingModalProgress(0, 'Loading FFmpeg engine...');

    ffmpegInstance = FFmpeg.createFFmpeg({
      log: false,
      corePath: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core-st@0.11.1/dist/ffmpeg-core.js',
      progress: ({ ratio }) => {
        const pct = Math.round(ratio * 100);
        updateProcessingModalProgress(pct, `Processing... ${pct}%`);
      }
    });

    await ffmpegInstance.load();
    ffmpegLoaded = true;
    updateProcessingModalProgress(0, 'FFmpeg ready!');
    return ffmpegInstance;
  }

  function showFFmpegProgressUI() {
    const container = document.getElementById('ffmpeg-status-container');
    if (container) {
      container.innerHTML = `
        <div class="alert alert-info border-0 shadow-sm p-3 mt-3">
          <div class="fw-semibold mb-2" id="ffmpeg-progress-text">Initialising browser processing engine...</div>
          <div class="progress" style="height: 8px;">
            <div id="ffmpeg-progress-bar" class="progress-bar progress-bar-striped progress-bar-animated bg-primary" style="width: 0%;"></div>
          </div>
        </div>`;
      container.classList.remove('d-none');
    }
  }

  async function runFFmpegBrowserProcessing(slug, formData, files) {
    showProcessingModal();
    try {
      // Inject progress UI above form if not present
      let statusContainer = document.getElementById('ffmpeg-status-container');
      if (!statusContainer) {
        statusContainer = document.createElement('div');
        statusContainer.id = 'ffmpeg-status-container';
        const form = document.getElementById('tool-execution-form');
        if (form) form.parentNode.insertBefore(statusContainer, form);
      }
      showFFmpegProgressUI();

      const ffmpeg = await getFFmpeg();

      const { fetchFile } = FFmpeg;

      // Helper to detect extension from mime or filename
      function extFor(file, fallback = 'mp4') {
        const parts = (file.name || '').split('.');
        return parts.length > 1 ? parts.pop().toLowerCase() : fallback;
      }

      function mimeFor(ext) {
        const map = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', avi: 'video/x-msvideo', mkv: 'video/x-matroska', gif: 'image/gif', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', mp3: 'audio/mpeg', wav: 'audio/wav', aac: 'audio/aac', m4a: 'audio/mp4', ogg: 'audio/ogg', flac: 'audio/flac', opus: 'audio/ogg', mpeg: 'video/mpeg', mpg: 'video/mpeg', mp2: 'audio/mpeg', mpga: 'audio/mpeg' };
        return map[ext] || 'application/octet-stream';
      }

      function readFFmpegFile(name) {
        return ffmpegInstance.FS('readFile', name);
      }

      function writeResult(name, data, mimeType) {
        const blob = new Blob([data.buffer], { type: mimeType });
        const objectUrl = URL.createObjectURL(blob);
        showBrowserFileResult(name, objectUrl, blob.size);
        completeProcessingModal(name, objectUrl, blob.size);
      }

      const progressTextEl = document.getElementById('ffmpeg-progress-text');
      function setStatus(msg) {
        if (progressTextEl) progressTextEl.textContent = msg;
        const modalStatusEl = document.getElementById('browser-modal-status');
        if (modalStatusEl) modalStatusEl.textContent = msg;
      }

      // ── Video Tools ──────────────────────────────────────────────────────────

      if (slug === 'video-compressor') {
        if (!files.length) throw new Error('Please select a video file.');
        const file = files[0];
        const ext = extFor(file);
        const inName = `input.${ext}`;
        const outName = `compressed.${ext}`;
        setStatus('Compressing video in browser... please wait.');
        ffmpegInstance.FS('writeFile', inName, await fetchFile(file));
        await ffmpegInstance.run('-i', inName, '-vcodec', 'libx264', '-crf', '32', '-preset', 'ultrafast', '-acodec', 'aac', outName);
        writeResult(outName, readFFmpegFile(outName), mimeFor(ext));
      }

      else if (slug === 'video-trimmer') {
        if (!files.length) throw new Error('Please select a video file.');
        const file = files[0];
        const ext = extFor(file);
        const start = formData.get('start') || '00:00:00';
        const end = formData.get('end') || '00:00:10';
        const inName = `input.${ext}`;
        const outName = `trimmed.${ext}`;
        setStatus('Trimming video in browser...');
        ffmpegInstance.FS('writeFile', inName, await fetchFile(file));
        await ffmpegInstance.run('-i', inName, '-ss', start, '-to', end, '-c', 'copy', outName);
        writeResult(outName, readFFmpegFile(outName), mimeFor(ext));
      }

      else if (slug === 'video-merger') {
        if (files.length < 2) throw new Error('Please select at least 2 video files.');
        setStatus('Merging videos in browser...');
        let concatList = '';
        for (let i = 0; i < files.length; i++) {
          const ext = extFor(files[i]);
          const name = `part${i}.${ext}`;
          ffmpegInstance.FS('writeFile', name, await fetchFile(files[i]));
          concatList += `file '${name}'\n`;
        }
        ffmpegInstance.FS('writeFile', 'concat.txt', new TextEncoder().encode(concatList));
        const ext0 = extFor(files[0]);
        await ffmpegInstance.run('-f', 'concat', '-safe', '0', '-i', 'concat.txt', '-c', 'copy', `merged.${ext0}`);
        writeResult(`merged.${ext0}`, readFFmpegFile(`merged.${ext0}`), mimeFor(ext0));
      }

      else if (slug === 'video-resolution-changer') {
        if (!files.length) throw new Error('Please select a video file.');
        const file = files[0];
        const ext = extFor(file);
        const w = formData.get('width') || '1280';
        const h = formData.get('height') || '720';
        setStatus(`Resizing video to ${w}x${h} in browser...`);
        ffmpegInstance.FS('writeFile', `input.${ext}`, await fetchFile(file));
        await ffmpegInstance.run('-i', `input.${ext}`, '-vf', `scale=${w}:${h}`, '-vcodec', 'libx264', '-preset', 'ultrafast', '-c:a', 'copy', `resized.${ext}`);
        writeResult(`resized.${ext}`, readFFmpegFile(`resized.${ext}`), mimeFor(ext));
      }

      else if (slug === 'video-to-gif') {
        if (!files.length) throw new Error('Please select a video file.');
        const file = files[0];
        const ext = extFor(file);
        const w = formData.get('width') || '480';
        const fps = formData.get('value') || '10';
        setStatus('Converting video to GIF in browser...');
        ffmpegInstance.FS('writeFile', `input.${ext}`, await fetchFile(file));
        await ffmpegInstance.run('-i', `input.${ext}`, '-vf', `fps=${fps},scale=${w}:-1:flags=fast_bilinear`, '-loop', '0', 'output.gif');
        writeResult('output.gif', readFFmpegFile('output.gif'), 'image/gif');
      }

      else if (slug === 'gif-to-video') {
        if (!files.length) throw new Error('Please select a GIF file.');
        const file = files[0];
        setStatus('Converting GIF to MP4 in browser...');
        ffmpegInstance.FS('writeFile', 'input.gif', await fetchFile(file));
        await ffmpegInstance.run('-f', 'gif', '-i', 'input.gif', '-vcodec', 'libx264', '-preset', 'ultrafast', '-movflags', 'faststart', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', 'output.mp4');
        writeResult('output.mp4', readFFmpegFile('output.mp4'), 'video/mp4');
      }

      else if (slug === 'thumbnail-extractor') {
        if (!files.length) throw new Error('Please select a video file.');
        const file = files[0];
        const ext = extFor(file);
        const ts = formData.get('value') || '1';
        setStatus(`Extracting thumbnail at ${ts}s in browser...`);
        ffmpegInstance.FS('writeFile', `input.${ext}`, await fetchFile(file));
        await ffmpegInstance.run('-ss', ts, '-i', `input.${ext}`, '-frames:v', '1', '-q:v', '2', 'thumbnail.jpg');
        writeResult('thumbnail.jpg', readFFmpegFile('thumbnail.jpg'), 'image/jpeg');
      }

      else if (slug === 'video-metadata-viewer') {
        if (!files.length) throw new Error('Please select a video file.');
        const file = files[0];
        const ext = extFor(file);
        setStatus('Reading video metadata in browser...');
        ffmpegInstance.FS('writeFile', `input.${ext}`, await fetchFile(file));
        // Use ffmpeg to output metadata info to stderr — capture it
        const logs = [];
        ffmpegInstance.setLogger(({ message }) => logs.push(message));
        try { await ffmpegInstance.run('-i', `input.${ext}`); } catch { }
        ffmpegInstance.setLogger(() => { });
        const info = logs.filter(l => l && !l.startsWith('ffmpeg version')).join('\n');
        showBrowserTextResult('Video Metadata', info || 'No metadata extracted.');
        return;
      }

      else if (slug === 'video-mute-tool') {
        if (!files.length) throw new Error('Please select a video file.');
        const file = files[0];
        const ext = extFor(file);
        setStatus('Removing audio track in browser...');
        ffmpegInstance.FS('writeFile', `input.${ext}`, await fetchFile(file));
        await ffmpegInstance.run('-i', `input.${ext}`, '-an', '-c:v', 'copy', `muted.${ext}`);
        writeResult(`muted.${ext}`, readFFmpegFile(`muted.${ext}`), mimeFor(ext));
      }

      else if (slug === 'video-speed-controller') {
        if (!files.length) throw new Error('Please select a video file.');
        const file = files[0];
        const ext = extFor(file);
        const speed = parseFloat(formData.get('value') || '1.5');
        const vpts = (1 / speed).toFixed(4);
        const atempo = Math.min(2.0, Math.max(0.5, speed)).toFixed(4);
        setStatus(`Changing video speed to ${speed}x in browser...`);
        ffmpegInstance.FS('writeFile', `input.${ext}`, await fetchFile(file));
        await ffmpegInstance.run('-i', `input.${ext}`, '-filter_complex', `[0:v]setpts=${vpts}*PTS[v];[0:a]atempo=${atempo}[a]`, '-map', '[v]', '-map', '[a]', '-vcodec', 'libx264', '-preset', 'ultrafast', `speed.${ext}`);
        writeResult(`speed.${ext}`, readFFmpegFile(`speed.${ext}`), mimeFor(ext));
      }

      // ── Audio Tools ──────────────────────────────────────────────────────────

      else if (slug === 'audio-converter') {
        if (!files.length) throw new Error('Please select an audio file.');
        const file = files[0];
        const inExt = extFor(file, 'mp3');
        setStatus('Converting audio format in browser...');
        ffmpegInstance.FS('writeFile', `input.${inExt}`, await fetchFile(file));
        await ffmpegInstance.run('-i', `input.${inExt}`, 'output.mp3');
        writeResult('output.mp3', readFFmpegFile('output.mp3'), 'audio/mpeg');
      }

      else if (slug === 'mp3-cutter') {
        if (!files.length) throw new Error('Please select an audio file.');
        const file = files[0];
        const ext = extFor(file, 'mp3');
        const start = formData.get('start') || '00:00:00';
        const end = formData.get('end') || '00:00:30';
        setStatus('Cutting audio in browser...');
        ffmpegInstance.FS('writeFile', `input.${ext}`, await fetchFile(file));
        await ffmpegInstance.run('-i', `input.${ext}`, '-ss', start, '-to', end, '-c', 'copy', `cut.${ext}`);
        writeResult(`cut.${ext}`, readFFmpegFile(`cut.${ext}`), mimeFor(ext));
      }

      else if (slug === 'audio-merger') {
        if (files.length < 2) throw new Error('Please select at least 2 audio files.');
        setStatus('Merging audio files in browser...');
        let concatList = '';
        for (let i = 0; i < files.length; i++) {
          const ext = extFor(files[i], 'mp3');
          const name = `aud${i}.${ext}`;
          ffmpegInstance.FS('writeFile', name, await fetchFile(files[i]));
          concatList += `file '${name}'\n`;
        }
        ffmpegInstance.FS('writeFile', 'alist.txt', new TextEncoder().encode(concatList));
        const ext0 = extFor(files[0], 'mp3');
        await ffmpegInstance.run('-f', 'concat', '-safe', '0', '-i', 'alist.txt', '-c', 'copy', `merged.${ext0}`);
        writeResult(`merged.${ext0}`, readFFmpegFile(`merged.${ext0}`), mimeFor(ext0));
      }

      else if (slug === 'volume-booster') {
        if (!files.length) throw new Error('Please select an audio file.');
        const file = files[0];
        const ext = extFor(file, 'mp3');
        const vol = parseFloat(formData.get('value') || '1.5');
        setStatus(`Boosting volume by ${vol}x in browser...`);
        ffmpegInstance.FS('writeFile', `input.${ext}`, await fetchFile(file));
        await ffmpegInstance.run('-i', `input.${ext}`, '-filter:a', `volume=${vol}`, `boosted.${ext}`);
        writeResult(`boosted.${ext}`, readFFmpegFile(`boosted.${ext}`), mimeFor(ext));
      }

      else if (slug === 'audio-speed-changer') {
        if (!files.length) throw new Error('Please select an audio file.');
        const file = files[0];
        const ext = extFor(file, 'mp3');
        const speed = parseFloat(formData.get('value') || '1.25');
        const atempo = Math.min(2.0, Math.max(0.5, speed)).toFixed(4);
        setStatus(`Changing audio speed to ${speed}x in browser...`);
        ffmpegInstance.FS('writeFile', `input.${ext}`, await fetchFile(file));
        await ffmpegInstance.run('-i', `input.${ext}`, '-filter:a', `atempo=${atempo}`, `speed.${ext}`);
        writeResult(`speed.${ext}`, readFFmpegFile(`speed.${ext}`), mimeFor(ext));
      }

      else if (slug === 'audio-metadata-viewer') {
        if (!files.length) throw new Error('Please select an audio file.');
        const file = files[0];
        const ext = extFor(file, 'mp3');
        setStatus('Reading audio metadata in browser...');
        ffmpegInstance.FS('writeFile', `input.${ext}`, await fetchFile(file));
        const logs = [];
        ffmpegInstance.setLogger(({ message }) => logs.push(message));
        try { await ffmpegInstance.run('-i', `input.${ext}`); } catch { }
        ffmpegInstance.setLogger(() => { });
        const info = logs.filter(l => l && !l.startsWith('ffmpeg version')).join('\n');
        showBrowserTextResult('Audio Metadata', info || 'No metadata found.');
        return;
      }

      else if (slug === 'audio-compressor') {
        if (!files.length) throw new Error('Please select an audio file.');
        const file = files[0];
        const ext = extFor(file, 'mp3');
        setStatus('Compressing audio in browser...');
        ffmpegInstance.FS('writeFile', `input.${ext}`, await fetchFile(file));
        await ffmpegInstance.run('-i', `input.${ext}`, '-b:a', '96k', `compressed.${ext}`);
        writeResult(`compressed.${ext}`, readFFmpegFile(`compressed.${ext}`), mimeFor(ext));
      }

      else {
        throw new Error('This video/audio tool is not yet supported in browser mode.');
      }

      setStatus('✅ Done! File is ready to download below.');
    } catch (err) {
      if (err.message !== '__FALLBACK_TO_SERVER__') {
        errorProcessingModal(err.message);
      } else {
        hideProcessingModal();
      }
      throw err;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTool);
  } else {
    initTool();
  }
})();
