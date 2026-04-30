import mongoose from 'mongoose';
import toJSON from './plugins/toJSON.plugin.js';
import paginate from './plugins/paginate.plugin.js';

const schema = new mongoose.Schema(
  {
    companyKey: { type: String, required: true, trim: true, lowercase: true },
    contacts: [
      {
        apolloId: { type: String },
        firstName: { type: String },
        lastName: { type: String },
        title: { type: String },
        email: { type: String },
        phoneNumbers: [
          {
            rawNumber: { type: String },
            sanitizedNumber: { type: String },
            typeCd: { type: String },
          },
        ],
        phoneFetched: { type: Boolean, default: false },
        linkedinUrl: { type: String },
        location: { type: String },
      },
    ],
    searchedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
  },
  { timestamps: true }
);

schema.index({ companyKey: 1 }, { unique: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

schema.plugin(toJSON);
schema.plugin(paginate);

const ApolloEnrichment = mongoose.model('ApolloEnrichment', schema);

export default ApolloEnrichment;
