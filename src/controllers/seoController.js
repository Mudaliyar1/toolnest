const { generateRobotsTxt, generateSitemapXml } = require('../services/seoService');

function robots(req, res) {
  res.type('text/plain').send(generateRobotsTxt());
}

function sitemap(req, res) {
  res.type('application/xml').send(generateSitemapXml());
}

module.exports = {
  robots,
  sitemap
};
