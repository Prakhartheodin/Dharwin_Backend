import express from 'express';
import auth from '../../middlewares/auth.js';
import validate from '../../middlewares/validate.js';
import * as roleValidation from '../../validations/role.validation.js';
import * as roleController from '../../controllers/role.controller.js';

const router = express.Router();

router
  .route('/')
  .post(auth('manageUsers'), validate(roleValidation.createRole), roleController.createRole)
  .get(auth('getUsers'), validate(roleValidation.getRoles), roleController.getRoles);

router
  .route('/:roleId')
  .get(auth('getUsers'), validate(roleValidation.getRole), roleController.getRole)
  .patch(auth('manageUsers'), validate(roleValidation.updateRole), roleController.updateRole)
  .delete(auth('manageUsers'), validate(roleValidation.deleteRole), roleController.deleteRole);

export default router;
