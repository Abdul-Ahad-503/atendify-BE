const Attendance = require('../models/Attendance');
const CourseOffering = require('../models/CourseOffering');
const Meeting = require('../models/Meeting');
const User = require('../models/User');
const Term = require('../models/Term');

/**
 * Haversine formula to calculate distance between two geographic points
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in meters
 */
const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371000; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // distance in meters

    return distance;
};

/**
 * Find all students enrolled in a course offering cohort
 * Enrollment is implicit by matching programId + semester + section + shift
 * @param {ObjectId} offeringId
 * @returns {Array} Array of enrolled Student User documents
 */
const findEnrolledStudents = async (offeringId) => {
    try {
        const offering = await CourseOffering.findById(offeringId);
        if (!offering) {
            throw new Error('Course offering not found');
        }

        const { programId, semester, section } = offering;

        const enrolledStudents = await User.find({
            role: 'student',
            programId,
            semester,
            section: section.toUpperCase(),
            isActive: true
        }).select('_id email name studentId rollNumber shift');

        return enrolledStudents;
    } catch (error) {
        throw new Error(`Failed to find enrolled students: ${error.message}`);
    }
};

/**
 * Mark attendance for a student
 * Validates location based on radius and creates attendance record
 * @param {Object} params
 * @param {ObjectId} params.meetingId
 * @param {ObjectId} params.studentId
 * @param {Object} params.studentLocation - { latitude, longitude }
 * @param {Object} params.classLocation - { latitude, longitude }
 * @param {number} params.radiusMeters - Acceptable radius in meters (default 10)
 * @param {Object} params.metadata - { deviceInfo, notes, requestPayload }
 * @returns {Object} Attendance record
 */
const markAttendance = async ({
    meetingId,
    studentId,
    studentLocation,
    classLocation,
    radiusMeters = 10,
    metadata = {}
}) => {
    try {
        // Fetch meeting and offering details
        const meeting = await Meeting.findById(meetingId).populate('offeringId');
        if (!meeting) {
            throw new Error('Meeting not found');
        }

        const offering = meeting.offeringId;
        if (!offering) {
            throw new Error('Course offering not found for this meeting');
        }

        // Verify student is enrolled in this offering
        const student = await User.findById(studentId);
        if (!student || student.role !== 'student') {
            throw new Error('Student not found or invalid role');
        }

        if (
            String(student.programId) !== String(offering.programId) ||
            student.semester !== offering.semester ||
            student.section !== offering.section
        ) {
            throw new Error('Student is not enrolled in this course');
        }

        // Calculate distance between student and class locations
        const distance = calculateDistance(
            studentLocation.latitude,
            studentLocation.longitude,
            classLocation.latitude,
            classLocation.longitude
        );

        const withinRadius = distance <= radiusMeters;

        // Get term
        const term = await Term.findById(meeting.termId);

        // Create attendance record
        const attendance = await Attendance.create({
            meetingId,
            offeringId: offering._id,
            studentId,
            teacherId: meeting.teacherId,
            termId: meeting.termId,
            status: withinRadius ? 'present' : 'absent',
            studentLocation: {
                type: 'Point',
                coordinates: [studentLocation.longitude, studentLocation.latitude]
            },
            classLocation: {
                type: 'Point',
                coordinates: [classLocation.longitude, classLocation.latitude]
            },
            distanceMeters: Math.round(distance),
            withinRadius,
            radiusMeters,
            markedAt: new Date(),
            meetingDate: new Date(), // Could be customized based on actual meeting date
            deviceInfo: metadata.deviceInfo || null,
            notes: metadata.notes || null,
            requestPayload: metadata.requestPayload || null
        });

        return attendance;
    } catch (error) {
        throw new Error(`Failed to mark attendance: ${error.message}`);
    }
};

/**
 * Get attendance record for a meeting
 * @param {ObjectId} meetingId
 * @returns {Array} Attendance records for that meeting
 */
const getAttendanceForMeeting = async (meetingId) => {
    try {
        const records = await Attendance.find({ meetingId })
            .populate('studentId', 'name email studentId rollNumber')
            .populate('teacherId', 'name email')
            .sort({ markedAt: 1 });

        return records;
    } catch (error) {
        throw new Error(`Failed to fetch attendance: ${error.message}`);
    }
};

/**
 * Get attendance history for a student
 * @param {ObjectId} studentId
 * @param {Object} filters - { termId, offeringId, startDate, endDate }
 * @returns {Array} Attendance records
 */
const getStudentAttendanceHistory = async (studentId, filters = {}) => {
    try {
        const query = { studentId };

        if (filters.termId) query.termId = filters.termId;
        if (filters.offeringId) query.offeringId = filters.offeringId;
        if (filters.startDate || filters.endDate) {
            query.markedAt = {};
            if (filters.startDate) query.markedAt.$gte = new Date(filters.startDate);
            if (filters.endDate) query.markedAt.$lte = new Date(filters.endDate);
        }

        const records = await Attendance.find(query)
            .populate('meetingId', 'day timeStart timeEnd roomNo')
            .populate('offeringId')
            .populate('teacherId', 'name email')
            .sort({ markedAt: -1 });

        return records;
    } catch (error) {
        throw new Error(`Failed to fetch attendance history: ${error.message}`);
    }
};

/**
 * Get attendance statistics for a course offering
 * @param {ObjectId} offeringId
 * @returns {Object} Statistics
 */
const getAttendanceStats = async (offeringId) => {
    try {
        const pipeline = [
            { $match: { offeringId: new (require('mongoose')).Types.ObjectId(offeringId) } },
            {
                $group: {
                    _id: '$studentId',
                    totalClasses: { $sum: 1 },
                    presentCount: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
                    absentCount: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
                    lateCount: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
                    avgDistance: { $avg: '$distanceMeters' }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'student'
                }
            },
            {
                $addFields: {
                    attendancePercentage: {
                        $round: [{ $multiply: [{ $divide: ['$presentCount', '$totalClasses'] }, 100] }, 2]
                    }
                }
            }
        ];

        const stats = await Attendance.aggregate(pipeline);
        return stats;
    } catch (error) {
        throw new Error(`Failed to fetch attendance stats: ${error.message}`);
    }
};

module.exports = {
    calculateDistance,
    findEnrolledStudents,
    markAttendance,
    getAttendanceForMeeting,
    getStudentAttendanceHistory,
    getAttendanceStats
};
