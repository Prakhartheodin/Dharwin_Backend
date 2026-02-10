import express from 'express';
import auth from '../../middlewares/auth.js';
import validate from '../../middlewares/validate.js';
import requirePermissions from '../../middlewares/requirePermissions.js';
import { uploadModuleCover } from '../../middlewares/upload.js';
import * as moduleValidation from '../../validations/module.validation.js';
import * as moduleController from '../../controllers/module.controller.js';

const router = express.Router();

router
  .route('/')
  .post(
    auth(),
    requirePermissions('modules.manage'),
    uploadModuleCover,
    moduleController.createModule
  )
  .get(
    auth(),
    requirePermissions('modules.read'),
    validate(moduleValidation.getModules),
    moduleController.getModules
  );

router
  .route('/:moduleId')
  .get(
    auth(),
    requirePermissions('modules.read'),
    validate(moduleValidation.getModule),
    moduleController.getModule
  )
  .patch(
    auth(),
    requirePermissions('modules.manage'),
    uploadModuleCover,
    moduleController.updateModule
  )
  .delete(
    auth(),
    requirePermissions('modules.manage'),
    validate(moduleValidation.getModule),
    moduleController.deleteModule
  );

router
  .route('/:moduleId/cover')
  .get(
    auth(),
    requirePermissions('modules.read'),
    validate(moduleValidation.getModule),
    moduleController.getModuleCover
  );

router
  .route('/:moduleId/items/:itemId/source')
  .get(
    auth(),
    requirePermissions('modules.read'),
    validate(moduleValidation.getPlaylistItemSource),
    moduleController.getPlaylistItemSource
  );

export default router;
