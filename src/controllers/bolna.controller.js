import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync.js';
import ApiError from '../utils/ApiError.js';
import bolnaService from '../services/bolna.service.js';
import callRecordService from '../services/callRecord.service.js';
import { getJobById } from '../services/job.service.js';
import { numberToWords, currencyToWords } from '../utils/numberToWords.js';

function jobContextFromDoc(job) {
  if (!job) return {};
  const orgName = job.organisation?.name || job.organisation || '';
  let salaryRange = '';
  if (job.salaryRange) {
    const { min, max, currency } = job.salaryRange;
    const curr = currencyToWords(currency);
    if (min != null && max != null) salaryRange = `${numberToWords(min)} to ${numberToWords(max)} ${curr}`;
    else if (min != null) salaryRange = `From ${numberToWords(min)} ${curr}`;
    else if (max != null) salaryRange = `Up to ${numberToWords(max)} ${curr}`;
  }
  return {
    jobTitle: job.title,
    organisation: orgName,
    jobType: job.jobType,
    location: job.location,
    experienceLevel: job.experienceLevel,
    salaryRange: salaryRange || undefined,
  };
}

const initiateCall = catchAsync(async (req, res) => {
  const body = req.body;
  const candidateName = body.candidateName || body.name;
  if (!candidateName) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'candidateName or name is required');
  }
  if (!body.jobId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'jobId is required for job posting verification call');
  }

  const job = await getJobById(body.jobId);
  if (!job) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Job not found');
  }
  const jobContext = jobContextFromDoc(job);

  const result = await bolnaService.initiateCall({
    phone: body.phone,
    candidateName,
    fromPhoneNumber: body.fromPhoneNumber,
    ...jobContext,
  });
  if (!result.success) {
    throw new ApiError(httpStatus.BAD_GATEWAY, result.error || 'Failed to initiate call');
  }
  res.status(httpStatus.OK).send({
    success: true,
    executionId: result.executionId,
    message: 'Call initiated successfully',
  });
});

const getCallStatus = catchAsync(async (req, res) => {
  const { executionId } = req.params;
  const result = await bolnaService.getExecutionDetails(executionId);
  if (!result.success) {
    throw new ApiError(httpStatus.BAD_GATEWAY, result.error || 'Failed to fetch call status');
  }
  res.status(httpStatus.OK).send({
    success: true,
    details: result.details,
  });
});

const getCallRecords = catchAsync(async (req, res) => {
  const options = {
    page: req.query.page,
    limit: req.query.limit,
    search: req.query.search,
    status: req.query.status,
    language: req.query.language,
    sortBy: req.query.sortBy,
    order: req.query.order,
  };
  const data = await callRecordService.listCallRecords(options);
  res.status(httpStatus.OK).send({
    success: true,
    records: data.results,
    total: data.total,
    totalPages: data.totalPages,
    page: data.page,
    limit: data.limit,
  });
});

const syncMissingCallRecords = catchAsync(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const backfill = await callRecordService.backfillFromBolna({ maxPages: 2 });
  const sync = await callRecordService.syncMissingData(limit);
  res.status(httpStatus.OK).send({
    success: true,
    backfilled: backfill.backfilled,
    synced: sync.synced,
    errors: backfill.errors + sync.errors,
    message: `Backfilled ${backfill.backfilled} record(s) from Bolna, synced ${sync.synced} with transcript/recording.`,
  });
});

const deleteCallRecord = catchAsync(async (req, res) => {
  const record = await callRecordService.deleteCallRecord(req.params.id);
  if (!record) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Call record not found');
  }
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Call record deleted',
  });
});

const receiveWebhook = catchAsync(async (req, res) => {
  const payload = req.body || {};
  if (typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      error: 'Body must be a JSON object',
    });
  }
  const record = await callRecordService.createFromWebhook(payload);
  res.status(httpStatus.OK).send({
    success: true,
    id: record._id?.toString(),
    executionId: record.executionId,
    message: 'Webhook received and stored',
  });
});

export {
  initiateCall,
  getCallStatus,
  getCallRecords,
  receiveWebhook,
  syncMissingCallRecords,
  deleteCallRecord,
};

