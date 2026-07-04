const { toolCatalog } = require('../data/toolCatalog');
const env = require('../config/env');

function generateRobotsTxt() {
  return [
    'User-agent: *',
    'Allow: /',
    `Sitemap: ${env.siteUrl}/sitemap.xml`
  ].join('\n');
}

function generateSitemapEntries() {
  const staticEntries = [
    { loc: env.siteUrl, priority: '1.0' },
    { loc: `${env.siteUrl}/workspace`, priority: '0.7' }
  ];

  const toolEntries = toolCatalog.flatMap((category) =>
    category.tools.map((tool) => ({
      loc: `${env.siteUrl}/tools/${tool.slug}`,
      priority: '0.6'
    }))
  );

  return [...staticEntries, ...toolEntries];
}

function generateSitemapXml() {
  const entries = generateSitemapEntries();
  const urls = entries
    .map((entry) => `  <url><loc>${entry.loc}</loc><changefreq>weekly</changefreq><priority>${entry.priority}</priority></url>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
}

module.exports = {
  generateRobotsTxt,
  generateSitemapEntries,
  generateSitemapXml
};
