const mongoose = require('mongoose');

/**
 * Department Model
 * Represents academic departments (e.g., Computer Science, Mathematics)
 */
const departmentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Department name is required'],
    trim: true,
    unique: true
  },
  code: {
    type: String,
    required: [true, 'Department code is required'],
    uppercase: true,
    trim: true,
    unique: true,
    match: [/^[A-Z]{2,6}$/, 'Department code must be 2-6 uppercase letters']
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
departmentSchema.index({ name: 'text' }); // For text search

module.exports = mongoose.model('Department', departmentSchema);
