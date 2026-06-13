const mongoose = require('mongoose');

const attendancePayloadSchema = new mongoose.Schema(
    {
        teacherId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },
        classId: {
            type: String,
            required: true,
            trim: true
        },
        courseId: {
            type: String,
            required: true,
            trim: true
        },
        payload: {
            type: mongoose.Schema.Types.Mixed,
            required: true
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model('AttendancePayload', attendancePayloadSchema);
