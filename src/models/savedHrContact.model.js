import mongoose from 'mongoose';
import toJSON from './plugins/toJSON.plugin.js';
import paginate from './plugins/paginate.plugin.js';

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    apolloId: { type: String, required: true },
    firstName: { type: String, default: '' },
    lastName: { type: String, default: '' },
    title: { type: String, default: '' },
    email: { type: String, default: '' },
    phoneNumbers: [
      {
        rawNumber: { type: String },
        sanitizedNumber: { type: String },
        typeCd: { type: String },
      },
    ],
    linkedinUrl: { type: String, default: '' },
    location: { type: String, default: '' },
    companyName: { type: String, default: '' },
    savedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

schema.index({ userId: 1, apolloId: 1 }, { unique: true });
schema.plugin(toJSON);
schema.plugin(paginate);

const SavedHrContact = mongoose.model('SavedHrContact', schema);
export default SavedHrContact;
