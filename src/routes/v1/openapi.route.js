import express from 'express';
import httpStatus from 'http-status';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerDefinition from '../../docs/swaggerDef.js';
import config from '../../config/config.js';

const specs = swaggerJsdoc({
  swaggerDefinition,
  apis: ['src/docs/*.yml', 'src/routes/v1/*.js'],
});

const router = express.Router();

/** Machine-readable OpenAPI 3 spec. Disabled in production unless EXPOSE_OPENAPI=true (cookies not used here). */
router.get('/', (req, res) => {
  if (!config.exposeOpenApi) {
    return res.status(httpStatus.NOT_FOUND).end();
  }
  res.setHeader('Content-Type', 'application/json');
  res.send(specs);
});

export default router;
