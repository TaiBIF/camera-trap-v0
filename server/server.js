const loopback = require('loopback');
const boot = require('loopback-boot');
const leftPad = require('left-pad');

const app = loopback();

const session = require('express-session');
const MongoStore = require('connect-mongo')(session);

let { ctMongoDb40 } = require('./datasources.json');

if (app.get('env') === 'development') {
  // eslint-disable-next-line prefer-destructuring
  ctMongoDb40 = require('./datasources.development.js').ctMongoDb40;
  app.use((req, res, next) => {
    const startTime = new Date();
    const originEndFunc = res.end;
    res.end = function(...args) {
      originEndFunc.apply(this, args);
      const now = new Date();
      const processTime = `${now - startTime}`.replace(
        /\B(?=(\d{3})+(?!\d))/g,
        ',',
      );
      console.log(
        `[${res.statusCode}] ${leftPad(processTime, 7)}ms ${`${
          req.method
        }      `.substr(0, 6)} ${req.originalUrl}`,
      );
    };
    next();
  });
}

console.log(ctMongoDb40.url);
/**
 * @todo Investigate the implication of providing the store property.
 */
app.use(
  session({
    secret: 'camera trap reveals secrets',
    name: 'ctp_session_id',
    store: new MongoStore({ url: ctMongoDb40.url }),
    saveUninitialized: false,
    resave: false,
    proxy: true,
  }),
);

if (app.get('env') === 'development') {
  app.use((req, res, next) => {
    const startTime = new Date();
    const originEndFunc = res.end;
    res.end = function(...args) {
      originEndFunc.apply(this, args);
      const now = new Date();
      const processTime = `${now - startTime}`.replace(
        /\B(?=(\d{3})+(?!\d))/g,
        ',',
      );
      console.log(
        `[${res.statusCode}] ${leftPad(processTime, 7)}ms ${`${
          req.method
        }      `.substr(0, 6)} ${req.originalUrl}`,
      );
    };
    next();
  });
}

app.start = function() {
  // start the web server
  return app.listen(() => {
    app.emit('started');
    const baseUrl = app.get('url').replace(/\/$/, '');
    console.log('Web server listening at: %s', baseUrl);
    if (app.get('loopback-component-explorer')) {
      const explorerPath = app.get('loopback-component-explorer').mountPath;
      console.log('Browse your REST API at %s%s', baseUrl, explorerPath);
    }
  });
};

// Bootstrap the application, configure models, datasources and middleware.
// Sub-apps like REST API are mounted via boot scripts.
boot(app, __dirname, err => {
  if (err) throw err;

  // start the server if `$ node server.js`
  if (require.main === module) app.start();
});
