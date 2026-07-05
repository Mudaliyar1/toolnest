module.exports = function errorHandler(err, req, res, next) {
  console.error('API Error:', err);
  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 ? 'Something went wrong.' : err.message;

  res.status(statusCode).render('errors/error', {
    title: 'Error',
    message,
    statusCode
  });
};
