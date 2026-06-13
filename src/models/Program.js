const mongoose = require('mongoose');

/**
 * Program Model
 * Represents degree programs (e.g., BSCS, BSIT, BSSE)
 */
const programSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Program name is required'],
    trim: true
  },
  code: {
    type: String,
    required: [true, 'Program code is required'],
    uppercase: true,
    trim: true,
    unique: true,
    match: [/^[A-Z]{2,6}$/, 'Program code must be 2-6 uppercase letters (e.g., BSCS)']
  },
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required: [true, 'Department is required']
  },
  totalSemesters: {
    type: Number,
    default: 8,
    min: 1,
    max: 10
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
programSchema.index({ departmentId: 1 });
programSchema.index({ name: 'text' }); // For text search

// Compound index for department-specific queries
programSchema.index({ departmentId: 1, code: 1 });

module.exports = mongoose.model('Program', programSchema);
