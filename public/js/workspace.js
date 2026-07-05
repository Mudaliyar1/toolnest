(function() {
  document.addEventListener('DOMContentLoaded', () => {
    const timerEl = document.getElementById('countdown-timer');
    if (!timerEl) return;

    const expiresAttr = timerEl.getAttribute('data-expires');
    if (!expiresAttr) return;

    const expiresAt = new Date(expiresAttr).getTime();
    if (isNaN(expiresAt)) return;

    function updateTimer() {
      const now = Date.now();
      const diff = expiresAt - now;

      if (diff <= 0) {
        timerEl.textContent = 'Expired';
        timerEl.className = 'fw-semibold text-danger';
        clearInterval(interval);
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

    const interval = setInterval(updateTimer, 1000);
    updateTimer();
  });
})();
