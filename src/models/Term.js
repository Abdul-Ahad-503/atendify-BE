const mongoose = require('mongoose');

/**
 * Term Model
 * Represents academic terms/sessions (e.g., Spring-2026, Fall-2026)
 */
const termSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Term name is required'],
    trim: true,
    unique: true,
    // e.g., "Spring-2026", "Fall-2025"
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required']
  },
  endDate: {
    type: Date,
    required: [true, 'End date is required'],
    validate: {
      validator: function(value) {
        return value > this.startDate;
      },
      message: 'End date must be after start date'
    }
  },
  isActive: {
    type: Boolean,
    default: false,
    // Only one term should be active at a time (enforced in business logic)
  }
}, {
  timestamps: true
});

// Indexes
termSchema.index({ isActive: 1 });
termSchema.index({ startDate: 1, endDate: 1 });

// Virtual to check if term is current
termSchema.virtual('isCurrent').get(function() {
  const now = new Date();
  return now >= this.startDate && now <= this.endDate;
});

// Ensure virtuals are included in JSON
termSchema.set('toJSON', { virtuals: true });
termSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Term', termSchema);
