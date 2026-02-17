import mongoose from 'mongoose';
import toJSON from './plugins/toJSON.plugin.js';
import paginate from './plugins/paginate.plugin.js';

const shiftSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
    },
    timezone: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    startTime: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: function (v) {
          return /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(v);
        },
        message: 'Start time must be in HH:mm format (24-hour)',
      },
    },
    endTime: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: function (v) {
          return /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(v);
        },
        message: 'End time must be in HH:mm format (24-hour)',
      },
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

shiftSchema.index({ timezone: 1, isActive: 1 });
shiftSchema.index({ name: 1, timezone: 1 });

shiftSchema.pre('save', function (next) {
  if (this.startTime && this.endTime) {
    const [startHours, startMinutes] = this.startTime.split(':').map(Number);
    const [endHours, endMinutes] = this.endTime.split(':').map(Number);
    const startTotalMinutes = startHours * 60 + startMinutes;
    const endTotalMinutes = endHours * 60 + endMinutes;
    if (endTotalMinutes === startTotalMinutes) {
      return next(new Error('End time cannot be the same as start time'));
    }
  }
  next();
});

shiftSchema.plugin(toJSON);
shiftSchema.plugin(paginate);

const Shift = mongoose.model('Shift', shiftSchema);

export default Shift;
