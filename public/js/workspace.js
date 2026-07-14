(function() {
  function initWorkspace() {
    const workspaceContainer = document.getElementById('workspace-container');
    const serverNowAttr = workspaceContainer ? workspaceContainer.getAttribute('data-server-now') : null;
    const serverNow = serverNowAttr ? new Date(serverNowAttr).getTime() : Date.now();
    const clockOffset = Date.now() - serverNow;

    // 1. Session expiration clock
    const timerEl = document.getElementById('countdown-timer');
    
    let sessionExpiresAt = 0;
    if (timerEl) {
      const expiresAttr = timerEl.getAttribute('data-expires');
      if (expiresAttr) {
        sessionExpiresAt = new Date(expiresAttr).getTime();
      }
    }

    function updateSessionTimer() {
      if (!timerEl || isNaN(sessionExpiresAt) || sessionExpiresAt <= 0) return;
      const adjustedNow = Date.now() - clockOffset;
      const diff = sessionExpiresAt - adjustedNow;

      if (diff <= 0) {
        timerEl.textContent = 'Expired';
        timerEl.className = 'fw-semibold text-danger';
        clearInterval(sessionInterval);
        setTimeout(() => {
          window.location.reload();
        }, 1500);
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      timerEl.textContent = formatted;
    }

    const sessionInterval = setInterval(updateSessionTimer, 1000);
    updateSessionTimer();

    // 2. Individual file expiration clocks
    const fileTimers = document.querySelectorAll('.file-countdown-timer');
    
    function updateFileTimers() {
      const adjustedNow = Date.now() - clockOffset;

      fileTimers.forEach((el) => {
        const expiresAttr = el.getAttribute('data-expires');
        if (!expiresAttr) return;
        const expiresAt = new Date(expiresAttr).getTime();
        if (isNaN(expiresAt)) return;

        const diff = expiresAt - adjustedNow;
        if (diff <= 0) {
          const card = el.closest('.file-card');
          if (card) {
            card.remove();
          }
        } else {
          const minutes = Math.floor(diff / 60000);
          const seconds = Math.floor((diff % 60000) / 1000);
          const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
          el.textContent = `Expires in: ${formatted}`;
        }
      });
    }

    const fileInterval = setInterval(updateFileTimers, 1000);
    updateFileTimers();

    // 3. Download button click handlers to start individual active download countdowns instantly
    const downloadButtons = document.querySelectorAll('.download-btn');
    if (workspaceContainer) {
      const downloadRetentionMs = parseInt(workspaceContainer.getAttribute('data-download-retention-ms'), 10) || 120000;
      
      downloadButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const fileId = btn.getAttribute('data-file-id');
          if (!fileId) return;

          const targetTimer = document.querySelector(`.file-countdown-timer[data-file-id="${fileId}"]`);
          if (targetTimer) {
            // Update UI timer goal time in server time
            const newExpiry = new Date(Date.now() - clockOffset + downloadRetentionMs);
            targetTimer.setAttribute('data-expires', newExpiry.toISOString());
            
            // Also extend the session timer to cover this download retention
            if (sessionExpiresAt < newExpiry.getTime()) {
              sessionExpiresAt = newExpiry.getTime();
              if (timerEl) {
                timerEl.setAttribute('data-expires', newExpiry.toISOString());
              }
            }
          }
        });
      });
    }

    // 3.5 Local time formatting for file cards
    function formatLocalTimes() {
      const localTimeEls = document.querySelectorAll('.file-local-time');
      localTimeEls.forEach(el => {
        const timeStr = el.getAttribute('data-time');
        if (!timeStr) return;
        const date = new Date(timeStr);
        if (isNaN(date.getTime())) return;
        
        // Format to local "12:11 AM" time
        const formatted = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
        el.textContent = formatted;
      });
    }
    formatLocalTimes();

    // 4. Poller to auto-refresh workspace when files list changes (e.g. from uploads/processing)
    let initialFilesJson = null;

    async function checkWorkspaceFiles() {
      try {
        const response = await fetch('/workspace/api/files');
        if (!response.ok) return;
        const data = await response.json();
        if (!data.success) return;

        const currentFilesJson = JSON.stringify(data.files);
        if (initialFilesJson === null) {
          initialFilesJson = currentFilesJson;
        } else if (initialFilesJson !== currentFilesJson) {
          // Files list changed! Refresh page
          window.location.reload();
        }
      } catch (err) {
        console.error('Failed to poll workspace files:', err);
      }
    }

    // Poll every 5 seconds
    setInterval(checkWorkspaceFiles, 5000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWorkspace);
  } else {
    initWorkspace();
  }
})();
