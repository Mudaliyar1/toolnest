module.exports = function errorHandler(err, req, res, next) {
  // Silently ignore aborted requests (client disconnected mid-upload, nodemon restart, etc.)
  if (err.message === 'Request aborted' || req.destroyed || res.writableEnded) {
    console.warn('Request aborted (client disconnected).');
    return;
  }

  if (err.code === 'EBADCSRFTOKEN') {
    console.warn(`CSRF Validation Failed for ${req.method} ${req.path} (IP: ${req.ip})`);
    if (res.headersSent) {
      return next(err);
    }
    const isAjax = req.xhr || (req.headers['accept'] && req.headers['accept'].includes('json')) || req.path.includes('/upload-browser-result');
    if (isAjax) {
      return res.status(403).json({ success: false, reason: 'Invalid or expired security token. Please refresh the page.' });
    }
    return res.status(403).render('errors/error', {
      title: 'Session Expired',
      message: 'Your security session has expired. Please refresh the page and try again.',
      statusCode: 403
    });
  }

  console.error('API Error:', err);
  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 ? 'Something went wrong.' : err.message;

  if (res.headersSent) {
    return next(err);
  }

  res.status(statusCode).render('errors/error', {
    title: 'Error',
    message,
    statusCode
  });
};
