const mongoose = require('mongoose');

/**
 * Course Model
 * Master catalog of courses (e.g., "Data Structures", "Database Systems")
 */
const courseSchema = new mongoose.Schema({
  code: {
    type: String,
    required: [true, 'Course code is required'],
    uppercase: true,
    trim: true,
    unique: true,
    // e.g., "PHC-1003", "DCS-2004"
    match: [/^[A-Z]{2,6}-\d{4}$/, 'Course code must follow format ABC-1234']
  },
  name: {
    type: String,
    required: [true, 'Course name is required'],
    trim: true
  },
  creditHours: {
    type: Number,
    required: [true, 'Credit hours are required'],
    min: 1,
    max: 6,
    validate: {
      validator: Number.isInteger,
      message: 'Credit hours must be an integer'
    }
  },
  // Optional: Link course to specific program/department
  programId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Program',
    default: null
  },
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    default: null
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
courseSchema.index({ name: 'text' }); // Full-text search on course name
courseSchema.index({ programId: 1 });
courseSchema.index({ departmentId: 1 });

module.exports = mongoose.model('Course', courseSchema);
