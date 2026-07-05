(function() {
  document.addEventListener('DOMContentLoaded', () => {
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
          previewContainer.classList.add('d-none');
          return;
        }

        previewContainer.classList.remove('d-none');
        thumbnailWrapper.innerHTML = ''; // Clear previous

        if (files.length === 1) {
          const file = files[0];
          filenameEl.textContent = file.name;
          filesizeEl.textContent = formatBytes(file.size);

          if (file.type.startsWith('image/')) {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(file);
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.maxHeight = '350px';
            img.style.objectFit = 'contain';
            thumbnailWrapper.appendChild(img);
          } else if (file.type.startsWith('video/')) {
            const video = document.createElement('video');
            video.src = URL.createObjectURL(file);
            video.controls = true;
            video.muted = true;
            video.style.width = '100%';
            video.style.height = '100%';
            video.style.maxHeight = '350px';
            video.style.objectFit = 'contain';
            thumbnailWrapper.appendChild(video);
          } else if (file.type.startsWith('audio/')) {
            const audio = document.createElement('audio');
            audio.src = URL.createObjectURL(file);
            audio.controls = true;
            audio.className = 'w-100 px-3';
            thumbnailWrapper.appendChild(audio);
          } else if (file.type === 'application/pdf') {
            thumbnailWrapper.innerHTML = `
              <div class="text-danger d-flex flex-column align-items-center gap-2">
                <span style="font-size: 5rem; line-height: 1;">📄</span>
                <span class="badge bg-danger">PDF Document</span>
              </div>
            `;
          } else {
            thumbnailWrapper.innerHTML = `
              <div class="text-secondary d-flex flex-column align-items-center gap-2">
                <span style="font-size: 5rem; line-height: 1;">📁</span>
                <span class="badge bg-secondary">File</span>
              </div>
            `;
          }
        } else {
          // Multiple files
          filenameEl.textContent = `${files.length} files selected`;
          let totalBytes = 0;
          for (let i = 0; i < files.length; i++) {
            totalBytes += files[i].size;
          }
          filesizeEl.textContent = `Total Size: ${formatBytes(totalBytes)}`;
          thumbnailWrapper.innerHTML = `
            <div class="text-primary d-flex flex-column align-items-center gap-2">
              <span style="font-size: 5rem; line-height: 1;">📚</span>
              <span class="badge bg-primary">Multiple Files</span>
            </div>
          `;
        }
      });
    }

    // Intercept form submission for real-time progress bar
    if (form) {
      form.addEventListener('submit', (e) => {
        // Only run AJAX upload for forms that upload files
        if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
          return;
        }

        const targetSizeInput = form.querySelector('input[name="targetSize"]');
        const targetUnitSelect = form.querySelector('select[name="targetUnit"]');
        if (targetSizeInput && targetUnitSelect) {
          const targetSize = parseFloat(targetSizeInput.value) || 0;
          const targetUnit = targetUnitSelect.value || 'KB';
          let targetBytes = targetSize * 1024;
          if (targetUnit === 'MB') {
            targetBytes = targetSize * 1024 * 1024;
          }

          let totalBytes = 0;
          for (let i = 0; i < fileInput.files.length; i++) {
            totalBytes += fileInput.files[i].size;
          }

          if (targetBytes >= totalBytes) {
            e.preventDefault();
            if (validationErrorEl) {
              validationErrorEl.textContent = `Target size (${targetSize} ${targetUnit}) must be smaller than the uploaded file size (${formatBytes(totalBytes)}).`;
              validationErrorEl.classList.remove('d-none');
            }
            return;
          }
        }

        e.preventDefault();

        progressContainer.classList.remove('d-none');
        progressBar.style.width = '0%';
        progressText.textContent = '0%';
        if (statusDetails) statusDetails.textContent = '';
        if (submitBtn) submitBtn.disabled = true;

        const startTime = Date.now();
        const xhr = new XMLHttpRequest();
        xhr.open('POST', form.action, true);

        // Listen to upload progress
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            progressBar.style.width = percent + '%';
            progressText.textContent = percent + '%';

            const elapsed = (Date.now() - startTime) / 1000;
            if (statusDetails && elapsed > 0.1) {
              const bps = event.loaded / elapsed;
              // Format speed
              let speedText = '';
              if (bps > 1024 * 1024) {
                speedText = (bps / (1024 * 1024)).toFixed(2) + ' MB/s';
              } else if (bps > 1024) {
                speedText = (bps / 1024).toFixed(2) + ' KB/s';
              } else {
                speedText = Math.round(bps) + ' B/s';
              }

              // Remaining time
              const bytesRemaining = event.total - event.loaded;
              const remainingSeconds = Math.round(bytesRemaining / bps);
              let timeText = '';
              if (remainingSeconds > 60) {
                timeText = Math.floor(remainingSeconds / 60) + 'm ' + (remainingSeconds % 60) + 's left';
              } else {
                timeText = remainingSeconds + 's left';
              }

              if (percent >= 100) {
                statusDetails.textContent = `(Processing on server...)`;
              } else {
                statusDetails.textContent = `(${speedText} - ${timeText})`;
              }
            }
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 400) {
            // Replace entire document layout with new page EJS rendering output
            document.open();
            document.write(xhr.responseText);
            document.close();
          } else {
            alert('Upload or processing failed. Please check your files and try again.');
            progressBar.style.width = '0%';
            progressText.textContent = '0%';
            progressContainer.classList.add('d-none');
            if (submitBtn) submitBtn.disabled = false;
          }
        };

        xhr.onerror = () => {
          alert('Network upload failure. Please verify connection.');
          progressBar.style.width = '0%';
          progressText.textContent = '0%';
          progressContainer.classList.add('d-none');
          if (submitBtn) submitBtn.disabled = false;
        };

        xhr.send(new FormData(form));
      });
    }
  });
})();
