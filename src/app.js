const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const csrf = require('csurf');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const mongoSanitize = require('./middleware/mongoSanitize');
const hpp = require('hpp');
const ejsMate = require('ejs-mate');
const env = require('./config/env');
const publicRoutes = require('./routes/publicRoutes');
const toolRoutes = require('./routes/toolRoutes');
const workspaceRoutes = require('./routes/workspaceRoutes');
const seoRoutes = require('./routes/seoRoutes');
const adminRoutes = require('./routes/adminRoutes');
const workspaceContext = require('./middleware/workspaceContext');
const trafficAnalytics = require('./middleware/trafficAnalytics');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.engine('ejs', ejsMate);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.locals.siteName = env.siteName;
app.locals.siteUrl = env.siteUrl;
app.locals.currentPath = '/';

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
      mediaSrc: ["'self'", 'blob:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

app.use(compression());
app.use(cookieParser(env.cookieSecret));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(mongoSanitize);
app.use(hpp());

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 240,
  standardHeaders: true,
  legacyHeaders: false
}));

app.use(slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 80,
  delayMs: () => 75
}));

app.use(express.static(env.publicDir, { maxAge: env.env === 'production' ? '7d' : 0 }));

app.use(workspaceContext);

app.use((req, res, next) => {
  res.locals.siteName = env.siteName;
  res.locals.siteUrl = env.siteUrl;
  res.locals.currentPath = req.path || '/';
  res.locals.adminAccessPath = env.adminAccessPath;
  next();
});

app.use(trafficAnalytics);

app.use(csrf({ cookie: true }));

app.use((req, res, next) => {
  res.locals.csrfToken = req.csrfToken();
  next();
});

app.use(env.adminAccessPath, adminRoutes);
app.use(seoRoutes);
app.use('/tools', toolRoutes);
app.use('/workspace', workspaceRoutes);
app.use('/', publicRoutes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
