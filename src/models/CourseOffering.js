const mongoose = require('mongoose');

/**
 * CourseOffering Model
 * Represents a teacher's offering of a course to a specific cohort in a specific term
 * 
 * One document = "In term T, course C is taught to Program P, Semester S, Section X by Teacher U"
 * 
 * DESIGN DECISION: Multiple teachers can offer the same course to the same cohort
 * (e.g., one for lecture, another for lab). This is why teacherId is part of unique constraint.
 */
const courseOfferingSchema = new mongoose.Schema({
  termId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Term',
    required: [true, 'Term is required']
  },
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required: [true, 'Department is required']
  },
  programId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Program',
    required: [true, 'Program is required']
  },
  semester: {
    type: Number,
    required: [true, 'Semester is required'],
    min: 1,
    max: 8
  },
  section: {
    type: String,
    required: [true, 'Section is required'],
    uppercase: true,
    trim: true,
    match: [/^[A-Z]$/, 'Section must be a single uppercase letter (A-Z)']
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: [true, 'Course is required']
  },
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Teacher is required'],
    // Business logic will validate that this user has role='teacher'
  },
  // Optional: Distinguish between lecture/lab/tutorial groups
  group: {
    type: String,
    trim: true,
    default: 'MAIN',
    uppercase: true,
    // e.g., "MAIN", "LAB-A", "LAB-B"
  },
  status: {
    type: String,
    enum: ['draft', 'published'],
    default: 'draft'
  }
}, {
  timestamps: true
});

// UNIQUE CONSTRAINT: Prevent duplicate offerings
// This allows multiple teachers for same course (different groups)
courseOfferingSchema.index(
  { termId: 1, programId: 1, semester: 1, section: 1, courseId: 1, teacherId: 1, group: 1 },
  { unique: true }
);

// Additional indexes for efficient queries
courseOfferingSchema.index({ teacherId: 1, termId: 1 }); // Teacher's offerings in a term
courseOfferingSchema.index({ termId: 1, programId: 1, semester: 1, section: 1 }); // Student view
courseOfferingSchema.index({ courseId: 1 });
courseOfferingSchema.index({ status: 1 });

module.exports = mongoose.model('CourseOffering', courseOfferingSchema);
