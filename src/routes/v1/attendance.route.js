import express from 'express';
import auth from '../../middlewares/auth.js';
import validate from '../../middlewares/validate.js';
import requirePermissions from '../../middlewares/requirePermissions.js';
import requireAttendanceAccess from '../../middlewares/requireAttendanceAccess.js';
import { attendancePunchLimiter } from '../../middlewares/rateLimiter.js';
import * as attendanceValidation from '../../validations/attendance.validation.js';
import attendanceController from '../../controllers/attendance.controller.js';

const router = express.Router();

router.get('/track', auth(), requirePermissions('students.read'), attendanceController.getTrackList);
router.get(
  '/track/history',
  auth(),
  requirePermissions('students.read'),
  validate(attendanceValidation.trackHistory),
  attendanceController.getTrackHistory
);

// Assign/remove holidays to students (admin/manage only)
router
  .route('/holidays')
  .post(
    auth(),
    requirePermissions('students.manage'),
    validate(attendanceValidation.addHolidaysToStudents),
    attendanceController.addHolidays
  )
  .delete(
    auth(),
    requirePermissions('students.manage'),
    validate(attendanceValidation.removeHolidaysFromStudents),
    attendanceController.removeHolidays
  );

router.post(
  '/leave',
  auth(),
  requirePermissions('students.manage'),
  validate(attendanceValidation.assignLeavesToStudents),
  attendanceController.assignLeave
);

router.post(
  '/student/:studentId/regularize',
  auth(),
  requirePermissions('students.manage'),
  validate(attendanceValidation.regularizeAttendance),
  attendanceController.regularize
);

router.use(auth(), requireAttendanceAccess);

router.post(
  '/punch-in/:studentId',
  attendancePunchLimiter,
  validate(attendanceValidation.punchIn),
  attendanceController.punchIn
);

router.post(
  '/punch-out/:studentId',
  attendancePunchLimiter,
  validate(attendanceValidation.punchOut),
  attendanceController.punchOut
);

router.get(
  '/status/:studentId',
  validate(attendanceValidation.studentIdParam),
  attendanceController.getStatus
);

router.get(
  '/student/:studentId',
  validate(attendanceValidation.listAttendance),
  attendanceController.getStudentAttendance
);

router.get(
  '/statistics/:studentId',
  validate(attendanceValidation.getStatistics),
  attendanceController.getStatistics
);

export default router;
