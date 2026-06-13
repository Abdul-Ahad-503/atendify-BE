const mongoose = require('mongoose');

/**
 * Meeting Model
 * Represents individual weekly lecture/lab meetings for a course offering
 * 
 * One document = One recurring weekly meeting (e.g., "Monday 8:30-9:20 in R-403")
 */
const meetingSchema = new mongoose.Schema({
  offeringId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CourseOffering',
    required: [true, 'Course offering is required']
  },
  // Denormalized for faster conflict queries (avoids JOIN with CourseOffering)
  termId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Term',
    required: [true, 'Term is required']
  },
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Teacher is required']
  },
  
  // Schedule details
  day: {
    type: String,
    required: [true, 'Day is required'],
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  },
  slot: {
    type: Number,
    required: [true, 'Slot number is required'],
    min: 1,
    max: 10
  },
  roomNo: {
    type: String,
    required: [true, 'Room number is required'],
    trim: true,
    uppercase: true
  },
  
  // Time in HH:MM format
  timeStart: {
    type: String,
    required: [true, 'Start time is required'],
    match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Start time must be in HH:MM format']
  },
  timeEnd: {
    type: String,
    required: [true, 'End time is required'],
    match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'End time must be in HH:MM format']
  },
  
  // Minutes since midnight (for efficient overlap queries)
  startMinutes: {
    type: Number,
    required: true,
    min: 0,
    max: 1439 // 23:59 = 1439 minutes
  },
  endMinutes: {
    type: Number,
    required: true,
    min: 0,
    max: 1439,
    validate: {
      validator: function(value) {
        return value > this.startMinutes;
      },
      message: 'End time must be after start time'
    }
  }
}, {
  timestamps: true
});

// PRE-SAVE HOOK: Auto-calculate startMinutes and endMinutes
meetingSchema.pre('save', function(next) {
  if (this.isModified('timeStart')) {
    const [hours, minutes] = this.timeStart.split(':').map(Number);
    this.startMinutes = hours * 60 + minutes;
  }
  if (this.isModified('timeEnd')) {
    const [hours, minutes] = this.timeEnd.split(':').map(Number);
    this.endMinutes = hours * 60 + minutes;
  }
  next();
});

// INDEXES

// 1. Unique meeting within same offering (can't have duplicate day/slot for same offering)
meetingSchema.index({ offeringId: 1, day: 1, slot: 1 }, { unique: true });

// 2. Room conflict detection: same term + room + day + overlapping time
meetingSchema.index({ termId: 1, day: 1, roomNo: 1, startMinutes: 1, endMinutes: 1 });

// 3. Teacher conflict detection: same term + teacher + day + overlapping time
meetingSchema.index({ termId: 1, teacherId: 1, day: 1, startMinutes: 1, endMinutes: 1 });

// 4. Query all meetings for an offering
meetingSchema.index({ offeringId: 1 });

// Virtual for time range display
meetingSchema.virtual('timeRange').get(function() {
  return `${this.timeStart}-${this.timeEnd}`;
});

// Ensure virtuals are included in JSON
meetingSchema.set('toJSON', { virtuals: true });
meetingSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Meeting', meetingSchema);
