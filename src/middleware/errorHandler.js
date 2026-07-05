module.exports = function errorHandler(err, req, res, next) {
  // Silently ignore aborted requests (client disconnected mid-upload, nodemon restart, etc.)
  if (err.message === 'Request aborted' || req.destroyed || res.writableEnded) {
    console.warn('Request aborted (client disconnected).');
    return;
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
