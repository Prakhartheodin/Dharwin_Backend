import mongoose from 'mongoose';
import toJSON from './plugins/toJSON.plugin.js';
import paginate from './plugins/paginate.plugin.js';

const commentSchema = new mongoose.Schema(
  {
    content: {
      type: String,
      required: true,
      trim: true,
    },
    commentedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    isAdminComment: {
      type: Boolean,
      default: false,
    },
    attachments: {
      type: [
        {
          key: {
            type: String,
            required: true,
          },
          url: {
            type: String,
            required: true,
          },
          originalName: {
            type: String,
            required: true,
          },
          size: {
            type: Number,
            required: true,
          },
          mimeType: {
            type: String,
            required: true,
          },
          uploadedAt: {
            type: Date,
            default: Date.now,
          },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

const supportTicketSchema = new mongoose.Schema(
  {
    ticketId: {
      type: String,
      unique: true,
      index: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['Open', 'In Progress', 'Resolved', 'Closed'],
      default: 'Open',
      index: true,
    },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Urgent'],
      default: 'Medium',
      index: true,
    },
    category: {
      type: String,
      trim: true,
      default: 'General',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    candidate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Candidate',
      index: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    comments: {
      type: [commentSchema],
      default: [],
    },
    attachments: {
      type: [
        {
          key: {
            type: String,
            required: true,
          },
          url: {
            type: String,
            required: true,
          },
          originalName: {
            type: String,
            required: true,
          },
          size: {
            type: Number,
            required: true,
          },
          mimeType: {
            type: String,
            required: true,
          },
          uploadedAt: {
            type: Date,
            default: Date.now,
          },
        },
      ],
      default: [],
    },
    resolvedAt: {
      type: Date,
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    closedAt: {
      type: Date,
    },
    closedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

// Indexes for efficient queries
supportTicketSchema.index({ createdBy: 1, createdAt: -1 });
supportTicketSchema.index({ status: 1, createdAt: -1 });
supportTicketSchema.index({ priority: 1, createdAt: -1 });
supportTicketSchema.index({ ticketId: 1 });

// Pre-save middleware to generate unique ticket ID
supportTicketSchema.pre('save', async function (next) {
  if (this.isNew && !this.ticketId) {
    const crypto = await import('crypto');
    // Generate ticket ID: TKT-{timestamp}-{random}
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = crypto.randomBytes(4).toString('hex').toUpperCase();
    this.ticketId = `TKT-${timestamp}-${random}`;
  }
  next();
});

// Method to add comment
supportTicketSchema.methods.addComment = function (content, userId, isAdmin = false, attachments = []) {
  this.comments.push({
    content,
    commentedBy: userId,
    isAdminComment: isAdmin,
    attachments,
  });
  return this.save();
};

// Method to update status
supportTicketSchema.methods.updateStatus = function (status, userId) {
  this.status = status;
  if (status === 'Resolved') {
    this.resolvedAt = new Date();
    this.resolvedBy = userId;
  } else if (status === 'Closed') {
    this.closedAt = new Date();
    this.closedBy = userId;
  }
  return this.save();
};

supportTicketSchema.plugin(toJSON);
supportTicketSchema.plugin(paginate);

const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);

export default SupportTicket;
