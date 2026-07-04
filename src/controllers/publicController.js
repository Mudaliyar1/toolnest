const { toolCatalog, getAllTools } = require('../data/toolCatalog');

function renderHome(req, res) {
  res.render('public/home', {
    title: 'ToolNest | Professional Utility Platform',
    toolCatalog,
    tools: getAllTools(),
    workspace: req.workspace,
    csrfToken: req.csrfToken()
  });
}

function renderCategories(req, res) {
  res.render('public/categories', {
    title: 'Categories | ToolNest',
    toolCatalog,
    workspace: req.workspace,
    csrfToken: req.csrfToken()
  });
}

function renderCategory(req, res, next) {
  const categoryKey = req.params.key;
  const category = toolCatalog.find((c) => c.key === categoryKey);

  if (!category) {
    return next(Object.assign(new Error('Category not found.'), { statusCode: 404 }));
  }

  res.render('public/category', {
    title: `${category.title} | ToolNest`,
    category,
    workspace: req.workspace,
    csrfToken: req.csrfToken()
  });
}

function renderPrivacy(req, res) {
  res.render('public/privacy', {
    title: 'Privacy Policy | ToolNest',
    workspace: req.workspace,
    csrfToken: req.csrfToken()
  });
}

function renderTerms(req, res) {
  res.render('public/terms', {
    title: 'Terms of Service | ToolNest',
    workspace: req.workspace,
    csrfToken: req.csrfToken()
  });
}

function renderContact(req, res) {
  res.render('public/contact', {
    title: 'Contact Us | ToolNest',
    workspace: req.workspace,
    csrfToken: req.csrfToken(),
    success: null
  });
}

function renderAbout(req, res) {
  res.render('public/about', {
    title: 'About | ToolNest',
    workspace: req.workspace,
    csrfToken: req.csrfToken()
  });
}

function handleContactSubmit(req, res) {
  // In production, we'd log this or send an email, then render with success message
  res.render('public/contact', {
    title: 'Contact Us | ToolNest',
    workspace: req.workspace,
    csrfToken: req.csrfToken(),
    success: 'Thank you for your message! Our team will get back to you shortly.'
  });
}

module.exports = {
  renderHome,
  renderCategories,
  renderCategory,
  renderPrivacy,
  renderTerms,
  renderContact,
  handleContactSubmit,
  renderAbout
};

