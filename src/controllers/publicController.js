const { toolCatalog, getAllTools } = require('../data/toolCatalog');

function renderHome(req, res) {
  res.render('public/home', {
    title: 'RaiseTool | Professional Utility Platform',
    toolCatalog,
    tools: getAllTools(),
    workspace: req.workspace,
    csrfToken: req.csrfToken()
  });
}

function renderCategories(req, res) {
  res.render('public/categories', {
    title: 'Categories | RaiseTool',
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
    title: `${category.title} | RaiseTool`,
    category,
    workspace: req.workspace,
    csrfToken: req.csrfToken()
  });
}

function renderPrivacy(req, res) {
  res.render('public/privacy', {
    title: 'Privacy Policy | RaiseTool',
    workspace: req.workspace,
    csrfToken: req.csrfToken()
  });
}

function renderTerms(req, res) {
  res.render('public/terms', {
    title: 'Terms of Service | RaiseTool',
    workspace: req.workspace,
    csrfToken: req.csrfToken()
  });
}

function renderContact(req, res) {
  res.render('public/contact', {
    title: 'Contact Us | RaiseTool',
    workspace: req.workspace,
    csrfToken: req.csrfToken(),
    success: null
  });
}

function renderAbout(req, res) {
  res.render('public/about', {
    title: 'About | RaiseTool',
    workspace: req.workspace,
    csrfToken: req.csrfToken()
  });
}

function handleContactSubmit(req, res) {
  // In production, we'd log this or send an email, then render with success message
  res.render('public/contact', {
    title: 'Contact Us | RaiseTool',
    workspace: req.workspace,
    csrfToken: req.csrfToken(),
    success: 'Thank you for your message! Our team will get back to you shortly.'
  });
}

function renderCookies(req, res) {
  res.render('public/cookies', {
    title: 'Cookie Policy | RaiseTool',
    workspace: req.workspace,
    csrfToken: req.csrfToken()
  });
}

function renderDisclaimer(req, res) {
  res.render('public/disclaimer', {
    title: 'Disclaimer & DMCA | RaiseTool',
    workspace: req.workspace,
    csrfToken: req.csrfToken()
  });
}

function renderDataSafety(req, res) {
  res.render('public/data-safety', {
    title: 'Data Safety & Lifecycle | RaiseTool',
    workspace: req.workspace,
    csrfToken: req.csrfToken()
  });
}

module.exports = {
  renderHome,
  renderCategories,
  renderCategory,
  renderPrivacy,
  renderTerms,
  renderCookies,
  renderDisclaimer,
  renderDataSafety,
  renderContact,
  handleContactSubmit,
  renderAbout
};

