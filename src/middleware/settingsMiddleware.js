const env = require('../config/env');
const { getSettings, getProcessingConfigForTool } = require('../services/settingsService');
const { findToolBySlug } = require('../data/toolCatalog');

module.exports = async function settingsMiddleware(req, res, next) {
  try {
    const settings = await getSettings();
    req.systemSettings = settings; // attach to request for downstream usage

    const isAdminRoute = req.path.startsWith(env.adminAccessPath);
    const isStaticAsset = req.path.startsWith('/css/') || 
                          req.path.startsWith('/js/') || 
                          req.path.startsWith('/vendor/') || 
                          req.path.startsWith('/favicon.ico');

    // 1. Maintenance Mode
    if (settings.emergencyMode.maintenanceMode && !isAdminRoute && !isStaticAsset) {
      res.status(503);
      return res.render('errors/maintenance', {
        title: 'Maintenance Mode | RaiseTool',
        siteName: env.siteName
      });
    }

    // 2. Category Blocks (Video/Audio)
    if (req.path.startsWith('/tools/')) {
      const slug = req.path.split('/')[2];
      const tool = findToolBySlug(slug);
      if (tool) {
        const processingConfig = getProcessingConfigForTool(settings, tool);
        if (tool.category === 'video' && settings.emergencyMode.videoDisabled) {
          return res.status(403).render('public/tool', {
            title: `${tool.name} | Disabled`,
            tool,
            workspace: req.workspace,
            csrfToken: req.csrfToken(),
            result: {
              kind: 'error',
              title: 'Access Denied',
              content: 'Video processing tools are temporarily disabled by the administrator.'
            },
            processingConfig
          });
        }
        if (tool.category === 'audio' && settings.emergencyMode.audioDisabled) {
          return res.status(403).render('public/tool', {
            title: `${tool.name} | Disabled`,
            tool,
            workspace: req.workspace,
            csrfToken: req.csrfToken(),
            result: {
              kind: 'error',
              title: 'Access Denied',
              content: 'Audio processing tools are temporarily disabled by the administrator.'
            },
            processingConfig
          });
        }
      }
    }

    // 3. Block Uploads if disabled
    const isUploadRequest = req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data');
    if (isUploadRequest && settings.emergencyMode.uploadsDisabled && !isAdminRoute) {
      const error = new Error('File uploads are temporarily disabled by the administrator.');
      error.statusCode = 403;
      return next(error);
    }

    next();
  } catch (error) {
    next(error);
  }
};
