import httpStatus from 'http-status';
import SupportTicket from '../models/supportTicket.model.js';
import Candidate from '../models/candidate.model.js';
import User from '../models/user.model.js';
import ApiError from '../utils/ApiError.js';
import { uploadMultipleFilesToS3 } from './upload.service.js';

/**
 * Create a support ticket
 * @param {Object} ticketData - Ticket data
 * @param {string} userId - User ID who created the ticket
 * @param {Array} files - Array of uploaded files (optional)
 * @param {Object} user - Current user object (to check role)
 * @returns {Promise<SupportTicket>}
 */
const createSupportTicket = async (ticketData, userId, files = [], user = null) => {
  let candidate = null;
  let candidateId = null;

  // Check if admin is creating ticket on behalf of a candidate
  if (user && user.role === 'admin' && ticketData.candidateId) {
    candidate = await Candidate.findById(ticketData.candidateId);
    if (!candidate) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Candidate not found');
    }
    candidateId = candidate._id;
  } else {
    candidate = await Candidate.findOne({ owner: userId });
    candidateId = candidate?._id || null;
  }

  let attachments = [];
  if (files && files.length > 0) {
    try {
      const uploadResults = await uploadMultipleFilesToS3(files, userId, 'support-tickets');
      attachments = uploadResults.map((result) => ({
        key: result.key,
        url: result.url,
        originalName: result.originalName,
        size: result.size,
        mimeType: result.mimeType,
        uploadedAt: new Date(),
      }));
    } catch (error) {
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Failed to upload attachments: ${error.message}`);
    }
  }

  const { candidateId: _candidateId, ...ticketFields } = ticketData;

  const ticket = await SupportTicket.create({
    ...ticketFields,
    createdBy: userId,
    candidate: candidateId,
    attachments,
  });

  await ticket.populate([
    { path: 'createdBy', select: 'name email role' },
    { path: 'candidate', select: 'fullName email' },
  ]);

  const ticketObj = ticket.toObject ? ticket.toObject() : ticket;
  ticketObj.createdAt = ticket.createdAt;
  ticketObj.updatedAt = ticket.updatedAt;
  return ticketObj;
};

/**
 * Query support tickets with filters
 */
const querySupportTickets = async (filter, options, user) => {
  if (user.role !== 'admin') {
    const candidate = await Candidate.findOne({ owner: user.id });
    if (candidate) {
      filter.$or = [{ createdBy: user.id }, { candidate: candidate._id }];
    } else {
      filter.createdBy = user.id;
    }
  } else if (user.role === 'admin' && user.subRole && user.subRole !== 'Admin') {
    filter.assignedTo = user.id;
  }

  const result = await SupportTicket.paginate(filter, options);

  if (result.results && result.results.length > 0) {
    await SupportTicket.populate(result.results, [
      { path: 'createdBy', select: 'name email role subRole' },
      { path: 'candidate', select: 'fullName email' },
      { path: 'assignedTo', select: 'name email role subRole' },
      { path: 'resolvedBy', select: 'name email' },
      { path: 'closedBy', select: 'name email' },
      { path: 'comments.commentedBy', select: 'name email role subRole' },
    ]);

    const processedTickets = await Promise.all(
      result.results.map(async (ticket) => {
        const ticketObj = ticket.toObject ? ticket.toObject() : ticket;
        ticketObj.createdAt = ticket.createdAt || ticketObj.createdAt;
        ticketObj.updatedAt = ticket.updatedAt || ticketObj.updatedAt;

        if (ticketObj.comments && Array.isArray(ticketObj.comments)) {
          for (const comment of ticketObj.comments) {
            if (comment.commentedBy) {
              const needsPopulation =
                typeof comment.commentedBy === 'string' ||
                (typeof comment.commentedBy === 'object' && !comment.commentedBy.name);

              if (needsPopulation) {
                const commenterId =
                  typeof comment.commentedBy === 'string'
                    ? comment.commentedBy
                    : comment.commentedBy._id?.toString() || comment.commentedBy.toString();
                const commenter = await User.findById(commenterId).select('name email role subRole').lean();
                if (commenter) {
                  comment.commentedBy = {
                    id: commenter._id.toString(),
                    name: commenter.name,
                    email: commenter.email,
                    role: commenter.role,
                    subRole: commenter.subRole || null,
                  };
                }
              } else if (comment.commentedBy?._id) {
                comment.commentedBy.id = comment.commentedBy._id.toString();
                delete comment.commentedBy._id;
              }
            }
          }
        }

        return ticketObj;
      })
    );

    result.results = processedTickets;
  }

  return result;
};

/**
 * Get support ticket by ID
 */
const getSupportTicketById = async (ticketId, user) => {
  const ticket = await SupportTicket.findById(ticketId);

  if (!ticket) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Support ticket not found');
  }

  if (user.role !== 'admin') {
    const candidate = await Candidate.findOne({ owner: user.id });
    const canView =
      String(ticket.createdBy) === String(user.id) || (candidate && String(ticket.candidate) === String(candidate._id));

    if (!canView) {
      throw new ApiError(httpStatus.FORBIDDEN, 'You can only view your own tickets');
    }
  } else if (user.role === 'admin' && user.subRole && user.subRole !== 'Admin') {
    if (!ticket.assignedTo || String(ticket.assignedTo) !== String(user.id)) {
      throw new ApiError(httpStatus.FORBIDDEN, 'You can only view tickets assigned to you');
    }
  }

  await ticket.populate([
    { path: 'createdBy', select: 'name email role subRole' },
    { path: 'candidate', select: 'fullName email' },
    { path: 'assignedTo', select: 'name email role subRole' },
    { path: 'resolvedBy', select: 'name email' },
    { path: 'closedBy', select: 'name email' },
    { path: 'comments.commentedBy', select: 'name email role subRole' },
  ]);

  const ticketObj = ticket.toObject ? ticket.toObject() : ticket;
  ticketObj.createdAt = ticket.createdAt;
  ticketObj.updatedAt = ticket.updatedAt;

  if (ticketObj.comments && Array.isArray(ticketObj.comments)) {
    for (const comment of ticketObj.comments) {
      if (comment.commentedBy) {
        const isObjectId =
          typeof comment.commentedBy === 'string' ||
          (typeof comment.commentedBy === 'object' &&
            (comment.commentedBy._id || (comment.commentedBy.toString && !comment.commentedBy.name)));

        if (isObjectId) {
          const commenterId =
            typeof comment.commentedBy === 'string'
              ? comment.commentedBy
              : comment.commentedBy._id?.toString() || comment.commentedBy.toString();
          const commenter = await User.findById(commenterId).select('name email role subRole').lean();
          if (commenter) {
            comment.commentedBy = {
              id: commenter._id.toString(),
              name: commenter.name,
              email: commenter.email,
              role: commenter.role,
              subRole: commenter.subRole || null,
            };
          }
        } else if (comment.commentedBy?._id) {
          comment.commentedBy.id = comment.commentedBy._id.toString();
          delete comment.commentedBy._id;
        }
      }
    }
  }

  return ticketObj;
};

/**
 * Update support ticket
 */
const updateSupportTicketById = async (ticketId, updateData, user) => {
  const ticket = await SupportTicket.findById(ticketId);

  if (!ticket) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Support ticket not found');
  }

  if (user.role !== 'admin') {
    const candidate = await Candidate.findOne({ owner: user.id });
    const canUpdate =
      String(ticket.createdBy) === String(user.id) || (candidate && String(ticket.candidate) === String(candidate._id));

    if (!canUpdate) {
      throw new ApiError(httpStatus.FORBIDDEN, 'You can only update your own tickets');
    }
  } else if (user.role === 'admin' && user.subRole && user.subRole !== 'Admin') {
    if (!ticket.assignedTo || String(ticket.assignedTo) !== String(user.id)) {
      throw new ApiError(httpStatus.FORBIDDEN, 'You can only update tickets assigned to you');
    }
  }

  if (user.role !== 'admin') {
    if (updateData.status && updateData.status !== 'Closed') {
      throw new ApiError(httpStatus.FORBIDDEN, 'You can only close your own tickets');
    }
    delete updateData.assignedTo;
    delete updateData.priority;
    delete updateData.category;
  }

  if (updateData.assignedTo && user.role === 'admin') {
    const assignedUser = await User.findById(updateData.assignedTo).select('role subRole');

    if (!assignedUser) {
      throw new ApiError(httpStatus.NOT_FOUND, 'User to assign ticket to not found');
    }

    if (user.subRole) {
      if (!assignedUser.subRole) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'Cannot assign ticket to a user without a subRole. Only users with subRoles can be assigned tickets by subRole admins.'
        );
      }
      if (assignedUser.role !== 'admin') {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'Cannot assign ticket to a non-admin user. Tickets can only be assigned to admin users with subRoles.'
        );
      }
    }
  }

  if (updateData.status) {
    await ticket.updateStatus(updateData.status, user.id);
    delete updateData.status;
  }

  Object.assign(ticket, updateData);
  await ticket.save();

  await ticket.populate([
    { path: 'createdBy', select: 'name email role subRole' },
    { path: 'candidate', select: 'fullName email' },
    { path: 'assignedTo', select: 'name email role subRole' },
    { path: 'resolvedBy', select: 'name email' },
    { path: 'closedBy', select: 'name email' },
    { path: 'comments.commentedBy', select: 'name email role subRole' },
  ]);

  const ticketObj = ticket.toObject ? ticket.toObject() : ticket;
  ticketObj.createdAt = ticket.createdAt;
  ticketObj.updatedAt = ticket.updatedAt;

  if (ticketObj.comments && Array.isArray(ticketObj.comments)) {
    for (const comment of ticketObj.comments) {
      if (comment.commentedBy) {
        const isObjectId =
          typeof comment.commentedBy === 'string' ||
          (typeof comment.commentedBy === 'object' &&
            (comment.commentedBy._id || (comment.commentedBy.toString && !comment.commentedBy.name)));

        if (isObjectId) {
          const commenterId =
            typeof comment.commentedBy === 'string'
              ? comment.commentedBy
              : comment.commentedBy._id?.toString() || comment.commentedBy.toString();
          const commenter = await User.findById(commenterId).select('name email role subRole').lean();
          if (commenter) {
            comment.commentedBy = {
              id: commenter._id.toString(),
              name: commenter.name,
              email: commenter.email,
              role: commenter.role,
              subRole: commenter.subRole || null,
            };
          }
        } else if (comment.commentedBy?._id) {
          comment.commentedBy.id = comment.commentedBy._id.toString();
          delete comment.commentedBy._id;
        }
      }
    }
  }

  return ticketObj;
};

/**
 * Add comment to support ticket
 */
const addCommentToTicket = async (ticketId, content, user, files = []) => {
  const ticket = await SupportTicket.findById(ticketId);

  if (!ticket) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Support ticket not found');
  }

  if (user.role !== 'admin') {
    const candidate = await Candidate.findOne({ owner: user.id });
    const canComment =
      String(ticket.createdBy) === String(user.id) || (candidate && String(ticket.candidate) === String(candidate._id));

    if (!canComment) {
      throw new ApiError(httpStatus.FORBIDDEN, 'You can only comment on your own tickets');
    }
  } else if (user.role === 'admin' && user.subRole && user.subRole !== 'Admin') {
    if (!ticket.assignedTo || String(ticket.assignedTo) !== String(user.id)) {
      throw new ApiError(httpStatus.FORBIDDEN, 'You can only comment on tickets assigned to you');
    }
  }

  if (ticket.status === 'Closed') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot add comment to closed ticket');
  }

  let attachments = [];
  if (files && files.length > 0) {
    try {
      const uploadResults = await uploadMultipleFilesToS3(files, user.id, 'support-tickets/comments');
      attachments = uploadResults.map((result) => ({
        key: result.key,
        url: result.url,
        originalName: result.originalName,
        size: result.size,
        mimeType: result.mimeType,
        uploadedAt: new Date(),
      }));
    } catch (error) {
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Failed to upload attachments: ${error.message}`);
    }
  }

  const isAdminComment = user.role === 'admin';
  await ticket.addComment(content, user.id, isAdminComment, attachments);

  await ticket.populate([
    { path: 'createdBy', select: 'name email role subRole' },
    { path: 'candidate', select: 'fullName email' },
    { path: 'assignedTo', select: 'name email role subRole' },
    { path: 'resolvedBy', select: 'name email' },
    { path: 'closedBy', select: 'name email' },
    { path: 'comments.commentedBy', select: 'name email role subRole' },
  ]);

  const ticketObj = ticket.toObject ? ticket.toObject() : ticket;
  ticketObj.createdAt = ticket.createdAt;
  ticketObj.updatedAt = ticket.updatedAt;

  if (ticketObj.comments && Array.isArray(ticketObj.comments)) {
    for (const comment of ticketObj.comments) {
      if (comment.commentedBy) {
        const isObjectId =
          typeof comment.commentedBy === 'string' ||
          (typeof comment.commentedBy === 'object' &&
            (comment.commentedBy._id || (comment.commentedBy.toString && !comment.commentedBy.name)));

        if (isObjectId) {
          const commenterId =
            typeof comment.commentedBy === 'string'
              ? comment.commentedBy
              : comment.commentedBy._id?.toString() || comment.commentedBy.toString();
          const commenter = await User.findById(commenterId).select('name email role subRole').lean();
          if (commenter) {
            comment.commentedBy = {
              id: commenter._id.toString(),
              name: commenter.name,
              email: commenter.email,
              role: commenter.role,
              subRole: commenter.subRole || null,
            };
          }
        } else if (comment.commentedBy?._id) {
          comment.commentedBy.id = comment.commentedBy._id.toString();
          delete comment.commentedBy._id;
        }
      }
    }
  }

  return ticketObj;
};

/**
 * Delete support ticket
 */
const deleteSupportTicketById = async (ticketId, user) => {
  const ticket = await SupportTicket.findById(ticketId);

  if (!ticket) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Support ticket not found');
  }

  if (user.role !== 'admin') {
    throw new ApiError(httpStatus.FORBIDDEN, 'Only admin can delete tickets');
  }

  await ticket.deleteOne();
};

export {
  createSupportTicket,
  querySupportTickets,
  getSupportTicketById,
  updateSupportTicketById,
  addCommentToTicket,
  deleteSupportTicketById,
};
