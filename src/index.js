import mongoose from 'mongoose';
import app from './app.js';
import config from './config/config.js';
import logger from './config/logger.js';

let server;
const port = config.port || process.env.PORT || 3000;

mongoose
  .connect(config.mongoose.url, config.mongoose.options)
  .then(() => {
    logger.info('Connected to MongoDB');
    server = app.listen(port, '0.0.0.0', () => {
      logger.info(`Listening on port ${port}`);
    });
  })
  .catch((err) => {
    logger.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });

const exitHandler = () => {
  if (server) {
    server.close(() => {
      logger.info('Server closed');
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
};

const unexpectedErrorHandler = (error) => {
  logger.error(error);
  exitHandler();
};

process.on('uncaughtException', unexpectedErrorHandler);
process.on('unhandledRejection', unexpectedErrorHandler);

process.on('SIGTERM', () => {
  logger.info('SIGTERM received');
  if (server) {
    server.close();
  }
});
