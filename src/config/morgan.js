import morgan from 'morgan';
import config from './config.js';
import logger from './logger.js';

morgan.token('message', (req, res) => res.locals.errorMessage || '');

const getIpFormat = () => (config.env === 'production' ? ':remote-addr - ' : '');
const successResponseFormat = `${getIpFormat()}:method :url :status - :response-time ms`;
const errorResponseFormat = `${getIpFormat()}:method :url :status - :response-time ms - message: :message`;

const successHandler = morgan(successResponseFormat, {
  skip: (req, res) => res.statusCode >= 400,
  stream: { write: (message) => logger.info(message.trim()) },
});

const EXPECTED_404_PATHS = ['/v1/training/attendance/me'];

const errorHandler = morgan(errorResponseFormat, {
  skip: (req, res) => {
    if (res.statusCode < 400) return true;
    if (res.statusCode === 404 && EXPECTED_404_PATHS.some((p) => req.originalUrl?.startsWith(p))) return true;
    return false;
  },
  stream: { write: (message) => logger.error(message.trim()) },
});

export { successHandler, errorHandler };
