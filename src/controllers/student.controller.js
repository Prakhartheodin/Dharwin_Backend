import httpStatus from 'http-status';
import pick from '../utils/pick.js';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import * as studentService from '../services/student.service.js';
import * as activityLogService from '../services/activityLog.service.js';
import { ActivityActions, EntityTypes } from '../config/activityLog.js';
import { isS3Configured } from '../config/s3.js';

const getStudents = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['status', 'search']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await studentService.queryStudents(filter, options);
  res.send(result);
});

const getStudent = catchAsync(async (req, res) => {
  const student = await studentService.getStudentById(req.params.studentId);
  if (!student) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Student not found');
  }
  res.send(student);
});

const updateStudent = catchAsync(async (req, res) => {
  const student = await studentService.updateStudentById(req.params.studentId, req.body);
  await activityLogService.createActivityLog(
    req.user.id,
    ActivityActions.STUDENT_UPDATE,
    EntityTypes.STUDENT,
    student.id,
    {},
    req
  );
  res.send(student);
});

const deleteStudent = catchAsync(async (req, res) => {
  await studentService.deleteStudentById(req.params.studentId);
  await activityLogService.createActivityLog(
    req.user.id,
    ActivityActions.STUDENT_DELETE,
    EntityTypes.STUDENT,
    req.params.studentId,
    {},
    req
  );
  res.status(httpStatus.NO_CONTENT).send();
});

const uploadProfilePicture = catchAsync(async (req, res) => {
  if (!isS3Configured()) {
    throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'S3 is not configured. Set AWS_* environment variables.');
  }
  if (!req.file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No file provided');
  }
  const student = await studentService.uploadStudentProfilePicture(req.params.studentId, req.file);
  await activityLogService.createActivityLog(
    req.user.id,
    ActivityActions.STUDENT_UPDATE,
    EntityTypes.STUDENT,
    student.id,
    { field: 'profilePicture' },
    req
  );
  res.status(httpStatus.OK).json({
    success: true,
    message: 'Profile picture uploaded successfully',
    data: student,
  });
});

const getProfilePicture = catchAsync(async (req, res) => {
  if (!isS3Configured()) {
    throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'S3 is not configured. Set AWS_* environment variables.');
  }
  const presignedUrl = await studentService.getStudentProfilePictureUrl(req.params.studentId);
  if (!presignedUrl) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Student has no profile picture');
  }
  res.redirect(presignedUrl);
});

export {
  getStudents,
  getStudent,
  updateStudent,
  deleteStudent,
  uploadProfilePicture,
  getProfilePicture,
};
