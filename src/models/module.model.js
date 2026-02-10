import mongoose from 'mongoose';
import toJSON from './plugins/toJSON.plugin.js';
import paginate from './plugins/paginate.plugin.js';

const PLAYLIST_TYPES = ['video', 'youtube', 'quiz', 'pdf', 'blog', 'test'];

const quizOptionSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true },
    correct: { type: Boolean, required: true, default: false },
  },
  { _id: false }
);

const quizQuestionSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, trim: true },
    multipleCorrect: { type: Boolean, default: false },
    options: {
      type: [quizOptionSchema],
      required: true,
      validate: {
        validator(v) {
          return Array.isArray(v) && v.length >= 1 && v.some((o) => o.correct);
        },
        message: 'At least one option must be marked correct',
      },
    },
  },
  { _id: false }
);

const playlistItemSchema = new mongoose.Schema(
  {
    order: { type: Number, required: true },
    type: {
      type: String,
      required: true,
      enum: PLAYLIST_TYPES,
    },
    title: { type: String, required: true, trim: true },
    duration: { type: mongoose.Schema.Types.Mixed }, // string or number (minutes)
    // video, youtube, pdf, test: source as URL or S3 reference
    sourceKey: { type: String, trim: true },
    sourceUrl: { type: String, trim: true },
    // blog
    blogContent: { type: String, trim: true },
    // quiz
    quizData: [quizQuestionSchema],
  },
  { _id: true }
);

playlistItemSchema.set('toJSON', { virtuals: false });
playlistItemSchema.set('toObject', { virtuals: false });

const moduleSchema = mongoose.Schema(
  {
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    coverImageKey: { type: String, trim: true },
    coverImageUrl: { type: String, trim: true },
    shortDescription: {
      type: String,
      required: true,
      trim: true,
    },
    studentIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
      },
    ],
    mentorIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Mentor',
      },
    ],
    playlist: {
      type: [playlistItemSchema],
      default: [],
    },
    status: {
      type: String,
      enum: ['active', 'draft'],
      default: 'active',
    },
  },
  {
    timestamps: true,
  }
);

moduleSchema.plugin(toJSON);
moduleSchema.plugin(paginate);

const originalToJSON = moduleSchema.options.toJSON?.transform;
moduleSchema.options.toJSON = moduleSchema.options.toJSON || {};
moduleSchema.options.toJSON.transform = function (doc, ret, options) {
  if (originalToJSON) originalToJSON(doc, ret, options);
  ret.createdAt = doc.createdAt;
  ret.updatedAt = doc.updatedAt;
  ret.categoryId = ret.category;
  return ret;
};

const Module = mongoose.model('Module', moduleSchema);

export default Module;
export { PLAYLIST_TYPES, playlistItemSchema, quizQuestionSchema, quizOptionSchema };
