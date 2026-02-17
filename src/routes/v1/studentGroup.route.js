import express from 'express';
import auth from '../../middlewares/auth.js';
import validate from '../../middlewares/validate.js';
import requirePermissions from '../../middlewares/requirePermissions.js';
import * as studentGroupValidation from '../../validations/studentGroup.validation.js';
import * as studentGroupController from '../../controllers/studentGroup.controller.js';

const router = express.Router();

router
  .route('/')
  .post(
    auth(),
    requirePermissions('students.manage'),
    validate(studentGroupValidation.createStudentGroup),
    studentGroupController.create
  )
  .get(auth(), validate(studentGroupValidation.getStudentGroups), studentGroupController.list);

router
  .route('/:groupId/students')
  .get(auth(), validate(studentGroupValidation.getGroupStudents), studentGroupController.listGroupStudents)
  .post(
    auth(),
    requirePermissions('students.manage'),
    validate(studentGroupValidation.addStudentsToGroup),
    studentGroupController.addStudents
  );

router
  .route('/:groupId/students/remove')
  .post(
    auth(),
    requirePermissions('students.manage'),
    validate(studentGroupValidation.removeStudentsFromGroup),
    studentGroupController.removeStudents
  );

router
  .route('/:groupId/holidays')
  .post(
    auth(),
    requirePermissions('students.manage'),
    validate(studentGroupValidation.assignHolidaysToGroup),
    studentGroupController.assignHolidays
  )
  .delete(
    auth(),
    requirePermissions('students.manage'),
    validate(studentGroupValidation.removeHolidaysFromGroup),
    studentGroupController.removeHolidays
  );

router
  .route('/:groupId')
  .get(auth(), validate(studentGroupValidation.getStudentGroup), studentGroupController.get)
  .patch(
    auth(),
    requirePermissions('students.manage'),
    validate(studentGroupValidation.updateStudentGroup),
    studentGroupController.update
  )
  .delete(
    auth(),
    requirePermissions('students.manage'),
    validate(studentGroupValidation.getStudentGroup),
    studentGroupController.remove
  );

export default router;
