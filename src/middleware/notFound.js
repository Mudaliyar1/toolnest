module.exports = function notFound(req, res) {
  res.status(404).render('errors/not-found', {
    title: 'Page not found'
  });
};
