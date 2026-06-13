const mongoose = require('mongoose');

/**
 * Attendance Model
 * Stores actual attendance records with location validation and history
 */
const attendanceSchema = new mongoose.Schema(
    {
        // References
        meetingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Meeting',
            required: true,
            index: true
        },
        offeringId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'CourseOffering',
            required: true,
            index: true
        },
        studentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },
        teacherId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },
        termId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Term',
            required: true,
            index: true
        },

        // Attendance status
        status: {
            type: String,
            enum: ['present', 'absent', 'late', 'marked'],
            default: 'marked',
            index: true
        },

        // Student's location when marking attendance
        studentLocation: {
            type: {
                type: String,
                enum: ['Point'],
                default: 'Point'
            },
            coordinates: {
                type: [Number], // [longitude, latitude]
                required: true
                // coordinates[0] = longitude
                // coordinates[1] = latitude
            }
        },

        // Class/meeting location (from teacher or meeting room)
        classLocation: {
            type: {
                type: String,
                enum: ['Point'],
                default: 'Point'
            },
            coordinates: {
                type: [Number], // [longitude, latitude]
                required: true
            }
        },

        // Calculated distance in meters
        distanceMeters: {
            type: Number,
            required: true,
            index: true
        },

        // Was the student within acceptable radius?
        withinRadius: {
            type: Boolean,
            required: true,
            index: true
        },

        // Acceptable radius used for validation (in meters)
        radiusMeters: {
            type: Number,
            default: 10, // default 10m
            required: true
        },

        // Timestamps
        markedAt: {
            type: Date,
            default: Date.now,
            index: true
        },
        meetingDate: {
            type: Date, // The actual date this meeting occurred (for scheduling purposes)
            required: true,
            index: true
        },

        // Additional metadata
        deviceInfo: {
            type: String,
            default: null
        },
        notes: {
            type: String,
            default: null
        },

        // Request/Response metadata
        requestPayload: {
            type: mongoose.Schema.Types.Mixed,
            default: null
        }
    },
    {
        timestamps: true
    }
);

// Create geospatial index for location-based queries
attendanceSchema.index({ studentLocation: '2dsphere' });
attendanceSchema.index({ classLocation: '2dsphere' });

// Compound indexes for efficient queries
attendanceSchema.index({ meetingId: 1, studentId: 1, markedAt: 1 });
attendanceSchema.index({ offeringId: 1, markedAt: 1 });
attendanceSchema.index({ studentId: 1, markedAt: 1 });
attendanceSchema.index({ termId: 1, markedAt: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
