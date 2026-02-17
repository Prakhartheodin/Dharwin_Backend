import httpStatus from 'http-status';
import pick from '../utils/pick.js';
import catchAsync from '../utils/catchAsync.js';
import {
  createLeaveRequest,
  queryLeaveRequests,
  getLeaveRequestById,
  approveLeaveRequest,
  rejectLeaveRequest,
  cancelLeaveRequest,
  getLeaveRequestsByStudentId,
} from '../services/leaveRequest.service.js';

const create = catchAsync(async (req, res) => {
  const { studentId } = req.params;
  const { dates, leaveType, notes } = req.body;

  const leaveRequest = await createLeaveRequest(studentId, dates, leaveType, notes, req.user);

  res.status(httpStatus.CREATED).send({
    success: true,
    message: 'Leave request created successfully',
    data: leaveRequest,
  });
});

const list = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['student', 'status', 'leaveType']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);

  const result = await queryLeaveRequests(filter, options, req.user);

  res.status(httpStatus.OK).send({
    success: true,
    data: result,
  });
});

const get = catchAsync(async (req, res) => {
  const { requestId } = req.params;
  const leaveRequest = await getLeaveRequestById(requestId, req.user);

  res.status(httpStatus.OK).send({
    success: true,
    data: leaveRequest,
  });
});

const approve = catchAsync(async (req, res) => {
  const { requestId } = req.params;
  const { adminComment } = req.body;

  const result = await approveLeaveRequest(requestId, adminComment, req.user);

  res.status(httpStatus.OK).send({
    success: true,
    message: result.message,
    data: result.data,
  });
});

const reject = catchAsync(async (req, res) => {
  const { requestId } = req.params;
  const { adminComment } = req.body;

  const leaveRequest = await rejectLeaveRequest(requestId, adminComment, req.user);

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Leave request rejected successfully',
    data: leaveRequest,
  });
});

const cancel = catchAsync(async (req, res) => {
  const { requestId } = req.params;

  const leaveRequest = await cancelLeaveRequest(requestId, req.user);

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Leave request cancelled successfully',
    data: leaveRequest,
  });
});

const getByStudent = catchAsync(async (req, res) => {
  const { studentId } = req.params;
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'status']);

  const result = await getLeaveRequestsByStudentId(studentId, options, req.user);

  res.status(httpStatus.OK).send({
    success: true,
    data: result,
  });
});

export {
  create,
  list,
  get,
  approve,
  reject,
  cancel,
  getByStudent,
};
