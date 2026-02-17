import httpStatus from 'http-status';
import pick from '../utils/pick.js';
import catchAsync from '../utils/catchAsync.js';
import * as studentGroupService from '../services/studentGroup.service.js';

const create = catchAsync(async (req, res) => {
  const group = await studentGroupService.createStudentGroup(req.body, req.user);
  res.status(httpStatus.CREATED).send({
    success: true,
    message: 'Student group created successfully',
    data: group,
  });
});

const list = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['name', 'isActive', 'createdBy']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await studentGroupService.queryStudentGroups(filter, options);
  res.status(httpStatus.OK).send({ success: true, data: result });
});

const get = catchAsync(async (req, res) => {
  const group = await studentGroupService.getStudentGroupById(req.params.groupId);
  res.status(httpStatus.OK).send({ success: true, data: group });
});

const listGroupStudents = catchAsync(async (req, res) => {
  const result = await studentGroupService.getGroupStudents(req.params.groupId, req.query);
  res.status(httpStatus.OK).send({ success: true, data: result });
});

const update = catchAsync(async (req, res) => {
  const group = await studentGroupService.updateStudentGroupById(req.params.groupId, req.body, req.user);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Student group updated successfully',
    data: group,
  });
});

const remove = catchAsync(async (req, res) => {
  await studentGroupService.deleteStudentGroupById(req.params.groupId, req.user);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Student group deleted successfully',
  });
});

const addStudents = catchAsync(async (req, res) => {
  const group = await studentGroupService.addStudentsToGroup(
    req.params.groupId,
    req.body.studentIds,
    req.user
  );
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Students added to group successfully',
    data: group,
  });
});

const removeStudents = catchAsync(async (req, res) => {
  const group = await studentGroupService.removeStudentsFromGroup(
    req.params.groupId,
    req.body.studentIds,
    req.user
  );
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Students removed from group successfully',
    data: group,
  });
});

const assignHolidays = catchAsync(async (req, res) => {
  const result = await studentGroupService.assignHolidaysToGroup(
    req.params.groupId,
    req.body.holidayIds,
    req.user
  );
  res.status(httpStatus.OK).send(result);
});

const removeHolidays = catchAsync(async (req, res) => {
  const result = await studentGroupService.removeHolidaysFromGroup(
    req.params.groupId,
    req.body.holidayIds,
    req.user
  );
  res.status(httpStatus.OK).send(result);
});

export {
  create,
  list,
  get,
  listGroupStudents,
  update,
  remove,
  addStudents,
  removeStudents,
  assignHolidays,
  removeHolidays,
};
