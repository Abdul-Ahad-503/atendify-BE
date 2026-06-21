const AttendancePayload = require('../models/AttendancePayload');
const Attendance = require('../models/Attendance');
const Meeting = require('../models/Meeting');
const CourseOffering = require('../models/CourseOffering');
const { sendSuccess, sendError } = require('../utils/responseUtils');
const { sendAttendancePush } = require('../services/notificationService');

const {
    findEnrolledStudents,
    markAttendance,
    getAttendanceForMeeting,
    getStudentAttendanceHistory,
    getAttendanceStats,
    getTeacherAttendanceHistory
} = require('../services/attendanceService');
const mongoose = require('mongoose');

/**
 * Teacher initiates attendance session for a meeting
 * Stores teacher's location and triggers attendance call to enrolled students
 * POST /api/attendance/teacher/start
 */
const startAttendanceSession = async (req, res) => {
    try {
        const { meetingId, location, details, deviceInfo, radiusMeters } = req.body;
        const teacherId = req.user._id;

        // Validate required fields
        if (!meetingId) {
            return sendError(res, 400, 'meetingId is required');
        }

        const latitude = location?.latitude;
        const longitude = location?.longitude;

        if (latitude === undefined || longitude === undefined) {
            return sendError(res, 400, 'location.latitude and location.longitude are required');
        }

        const latNum = Number(latitude);
        const lonNum = Number(longitude);

        if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
            return sendError(res, 400, 'location.latitude and location.longitude must be valid numbers');
        }

        // Validate radiusMeters
        const sessionRadius = radiusMeters !== undefined ? Number(radiusMeters) : 10;
        if (!Number.isFinite(sessionRadius) || sessionRadius < 5 || sessionRadius > 30) {
            return sendError(res, 400, 'radiusMeters must be a valid number between 5 and 30');
        }

        // Verify meeting exists and belongs to this teacher
        const meeting = await Meeting.findById(meetingId).populate('offeringId');
        if (!meeting) {
            return sendError(res, 404, 'Meeting not found');
        }

        if (String(meeting.teacherId) !== String(teacherId)) {
            return sendError(res, 403, 'You are not authorized to mark attendance for this meeting');
        }

        // Find enrolled students for this offering
        const offering = meeting.offeringId;
        const enrolledStudents = await require('../models/User').find({
            role: 'student',
            programId: offering.programId,
            semester: offering.semester,
            section: offering.section,
            isActive: true
        }).select('_id name email pushToken'); // pushToken included

        if (enrolledStudents.length === 0) {
            return sendSuccess(res, 200, 'Attendance session started (no enrolled students)', {
                sessionId: meetingId,
                enrolledStudentsCount: 0,
                studentsNotified: []
            });
        }

        // Save teacher's attendance trigger
        const attendanceSession = await AttendancePayload.create({
            teacherId,
            classId: String(meetingId),
            courseId: String(meeting.offeringId._id),
            payload: {
                action: 'START_ATTENDANCE_SESSION',
                meetingId,
                location: { latitude: latNum, longitude: lonNum },
                radiusMeters: sessionRadius,
                details,
                deviceInfo,
                enrolledStudentsCount: enrolledStudents.length,
                timestamp: new Date()
            }
        });
        await sendAttendancePush(enrolledStudents, meetingId, details, teacherId);

        console.log('✅ [ATTENDANCE] Teacher started session', {
            teacherId: String(teacherId),
            meetingId: String(meetingId),
            enrolledStudentsCount: enrolledStudents.length,
            teacherLocation: { latitude: latNum, longitude: lonNum }
        });

        return sendSuccess(res, 200, 'Attendance session started successfully', {
            sessionId: String(attendanceSession._id),
            meetingId: String(meetingId),
            radiusMeters: sessionRadius,
            enrolledStudentsCount: enrolledStudents.length,
            studentsToNotify: enrolledStudents.map(s => ({
                studentId: String(s._id),
                name: s.name,
                email: s.email
            })),
            teacherLocation: { latitude: latNum, longitude: lonNum }
        });
    } catch (error) {
        console.error('❌ [ATTENDANCE] Error starting session:', error.message);
        return sendError(res, 500, 'Failed to start attendance session', [error.message]);
    }
};

/**
 * Student marks attendance for a meeting
 * Validates location within acceptable radius and creates attendance record
 * Supports multiple attendance records per meeting (different sessions)
 * POST /api/attendance/student/mark
 */
const markStudentAttendance = async (req, res) => {
    try {
        const { meetingId, location, sessionId, deviceInfo } = req.body;
        const studentId = req.user._id;

        // Validate required fields
        if (!meetingId) {
            return sendError(res, 400, 'meetingId is required');
        }

        const latitude = location?.latitude;
        const longitude = location?.longitude;

        if (latitude === undefined || longitude === undefined) {
            return sendError(res, 400, 'location.latitude and location.longitude are required');
        }

        const latNum = Number(latitude);
        const lonNum = Number(longitude);

        if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
            return sendError(res, 400, 'location.latitude and location.longitude must be valid numbers');
        }

        // Fetch meeting with location info (assume room has coordinates stored elsewhere or use default)
        const meeting = await Meeting.findById(meetingId).populate('offeringId');
        if (!meeting) {
            return sendError(res, 404, 'Meeting not found');
        }

        // Check if student is enrolled in this course offering
        const student = await require('../models/User').findById(studentId);
        const offering = meeting.offeringId;

        if (String(student.programId) !== String(offering.programId) ||
            student.semester !== offering.semester ||
            student.section !== offering.section) {
            return sendError(res, 403, 'You are not enrolled in this course');
        }

        // Get teacher's session payload for location and radius
        const teacherPayload = await AttendancePayload.findOne({
            teacherId: meeting.teacherId,
            classId: String(meetingId)
        }).sort({ createdAt: -1 });

        if (!teacherPayload || !teacherPayload.payload.location) {
            return sendError(res, 400, 'Teacher has not started attendance session yet');
        }

        // Use the radius configured by the teacher when starting the session
        const sessionRadius = teacherPayload.payload.radiusMeters || 10;
        if (!Number.isFinite(sessionRadius) || sessionRadius < 5 || sessionRadius > 30) {
            return sendError(res, 400, 'Invalid session radius configuration');
        }

        // Use the actual session start time for late threshold
        const sessionStartTime = teacherPayload.payload.timestamp
            ? new Date(teacherPayload.payload.timestamp)
            : new Date(teacherPayload.createdAt);

        const classLocation = teacherPayload.payload.location;

        // Check if student already has attendance for this session
        if (sessionId) {
            const existingAttendance = await Attendance.findOne({
                meetingId: new mongoose.Types.ObjectId(meetingId),
                studentId: new mongoose.Types.ObjectId(studentId),
                sessionId: new mongoose.Types.ObjectId(sessionId)
            });

            if (existingAttendance) {
                return sendError(res, 400, 'Attendance already marked for this session');
            }
        }

        // Mark attendance using teacher's configured radius and session start time
        const attendance = await markAttendance({
            meetingId: new mongoose.Types.ObjectId(meetingId),
            studentId: new mongoose.Types.ObjectId(studentId),
            studentLocation: { latitude: latNum, longitude: lonNum },
            classLocation: { latitude: classLocation.latitude, longitude: classLocation.longitude },
            radiusMeters: sessionRadius,
            sessionStartTime,
            sessionId: sessionId ? new mongoose.Types.ObjectId(sessionId) : null,
            metadata: { deviceInfo, requestPayload: req.body }
        });

        console.log('✅ [ATTENDANCE] Student marked attendance', {
            studentId: String(studentId),
            meetingId: String(meetingId),
            sessionId: sessionId ? String(sessionId) : 'N/A',
            status: attendance.status,
            distance: `${attendance.distanceMeters}m`,
            withinRadius: attendance.withinRadius
        });

        return sendSuccess(res, 200, 'Attendance marked successfully', {
            attendanceId: String(attendance._id),
            status: attendance.status,
            distance: `${attendance.distanceMeters}m`,
            withinRadius: attendance.withinRadius,
            radiusMeters: attendance.radiusMeters,
            markedAt: attendance.markedAt
        });
    } catch (error) {
        console.error('❌ [ATTENDANCE] Error marking student attendance:', error.message);
        return sendError(res, 500, 'Failed to mark attendance', [error.message]);
    }
};

/**
 * Get attendance records for a specific meeting
 * GET /api/attendance/meeting/:meetingId
 */
const getAttendanceByMeeting = async (req, res) => {
    try {
        const { meetingId } = req.params;

        const attendance = await getAttendanceForMeeting(meetingId);

        const summary = {
            total: attendance.length,
            present: attendance.filter(a => a.status === 'present').length,
            absent: attendance.filter(a => a.status === 'absent').length,
            late: attendance.filter(a => a.status === 'late').length,
            avgDistance: attendance.length > 0 ?
                Math.round(attendance.reduce((sum, a) => sum + a.distanceMeters, 0) / attendance.length) :
                0
        };

        return sendSuccess(res, 200, 'Attendance records fetched', {
            summary,
            records: attendance
        });
    } catch (error) {
        console.error('❌ [ATTENDANCE] Error fetching meeting attendance:', error.message);
        return sendError(res, 500, 'Failed to fetch attendance', [error.message]);
    }
};

/**
 * Get student's attendance history
 * GET /api/attendance/student/history?page=1&limit=10
 */
const getStudentHistory = async (req, res) => {
    try {
        const { termId, offeringId, startDate, endDate, page = '1', limit = '10' } = req.query;
        const studentId = req.user._id;

        const filters = {};
        if (termId) filters.termId = termId;
        if (offeringId) filters.offeringId = offeringId;
        if (startDate) filters.startDate = startDate;
        if (endDate) filters.endDate = endDate;

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const history = await getStudentAttendanceHistory(studentId, filters);
        const total = history.length;
        const totalPages = Math.ceil(total / limitNum);
        const paginatedRecords = history.slice(skip, skip + limitNum);

        return sendSuccess(res, 200, 'Attendance history retrieved', {
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages
            },
            records: paginatedRecords
        });
    } catch (error) {
        console.error('❌ [ATTENDANCE] Error fetching history:', error.message);
        return sendError(res, 500, 'Failed to fetch attendance history', [error.message]);
    }
};

/**
 * Get attendance statistics for a course offering
 * GET /api/attendance/stats/offering/:offeringId
 */
const getOfferingStats = async (req, res) => {
    try {
        const { offeringId } = req.params;

        const stats = await getAttendanceStats(offeringId);

        return sendSuccess(res, 200, 'Attendance statistics retrieved', {
            totalStudents: stats.length,
            stats
        });
    } catch (error) {
        console.error('❌ [ATTENDANCE] Error fetching stats:', error.message);
        return sendError(res, 500, 'Failed to fetch attendance statistics', [error.message]);
    }
};

/**
 * (Legacy) Record raw attendance payload from mobile app
 * POST /api/attendance/teacher/mark
 */
const markTeacherAttendance = async (req, res) => {
    try {
        const { classId, courseId, location } = req.body;

        if (!classId) {
            return sendError(res, 400, 'classId is required');
        }

        if (!courseId) {
            return sendError(res, 400, 'courseId is required');
        }

        const latitude = location?.latitude;
        const longitude = location?.longitude;

        if (latitude === undefined || longitude === undefined) {
            return sendError(res, 400, 'location.latitude and location.longitude are required');
        }

        const latNum = Number(latitude);
        const lonNum = Number(longitude);

        if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
            return sendError(res, 400, 'location.latitude and location.longitude must be numbers');
        }

        await AttendancePayload.create({
            teacherId: req.user._id,
            classId: String(classId),
            courseId: String(courseId),
            payload: req.body
        });

        console.log('📥 [ATTENDANCE] Teacher payload received', {
            teacherId: req.user._id,
            classId: String(classId),
            courseId: String(courseId)
        });

        return sendSuccess(res, 200, 'Attendance payload received', { received: true });
    } catch (error) {
        return sendError(res, 500, 'Failed to record attendance payload', [error.message]);
    }
};
const endAttendanceSession = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const teacherId = req.user._id;

        // 1. Find the attendance payload session
        const session = await AttendancePayload.findById(sessionId);
        if (!session) {
            return sendError(res, 404, 'Session not found');
        }

        const meetingId = session.classId;

        // 2. Get meeting and offering details
        const meeting = await Meeting.findById(meetingId).populate('offeringId');
        if (!meeting) {
            return sendError(res, 404, 'Meeting not found');
        }

        const offering = meeting.offeringId;

        // 3. Find enrolled students
        const enrolledStudents = await require('../models/User').find({
            role: 'student',
            programId: offering.programId,
            semester: offering.semester,
            section: offering.section,
            isActive: true
        }).select('_id');

        let autoMarkedCount = 0;

        if (enrolledStudents.length > 0) {
            // 4. Find which enrolled students already have attendance records for this meeting
            const existingRecords = await Attendance.find({
                meetingId: meeting._id
            }).select('studentId');

            const existingStudentIds = new Set(
                existingRecords.map(r => String(r.studentId))
            );

            // 5. Create absent records for those who never marked
            const absentRecords = enrolledStudents
                .filter(s => !existingStudentIds.has(String(s._id)))
                .map(s => ({
                    meetingId: meeting._id,
                    offeringId: offering._id,
                    studentId: s._id,
                    teacherId: meeting.teacherId,
                    termId: meeting.termId,
                    status: 'absent',
                    studentLocation: { type: 'Point', coordinates: [0, 0] },
                    classLocation: { type: 'Point', coordinates: [0, 0] },
                    distanceMeters: 0,
                    withinRadius: false,
                    radiusMeters: 0,
                    markedAt: new Date(),
                    meetingDate: new Date(),
                    notes: 'Auto-marked absent on session end'
                }));

            if (absentRecords.length > 0) {
                await Attendance.insertMany(absentRecords);
                autoMarkedCount = absentRecords.length;
                console.log(`✅ [ATTENDANCE] Auto-marked ${autoMarkedCount} students as absent`);
            }
        }

        // 6. End the session
        await AttendancePayload.findByIdAndUpdate(sessionId, {
            'payload.status': 'ended',
            'payload.endedAt': new Date()
        });

        console.log('✅ [ATTENDANCE] Session ended', {
            sessionId: String(sessionId),
            meetingId: String(meetingId),
            autoMarkedAbsent: autoMarkedCount
        });

        return sendSuccess(res, 200, 'Session ended successfully', {
            autoMarkedAbsent: autoMarkedCount
        });
    } catch (error) {
        console.error('❌ [ATTENDANCE] Error ending session:', error.message);
        return sendError(res, 500, 'Failed to end session', [error.message]);
    }
};
const checkActiveSession = async (req, res) => {
    try {
        const { meetingId } = req.params;

        const session = await AttendancePayload.findOne({
            classId: String(meetingId),
            'payload.status': { $ne: 'ended' }
        }).sort({ createdAt: -1 });

        return sendSuccess(res, 200, 'Session status fetched', {
            isActive: !!session,
            sessionId: session ? String(session._id) : null
        });
    } catch (error) {
        return sendError(res, 500, 'Failed to check session', [error.message]);
    }
};
/**
 * TEST ONLY: Send test notification to a student
 * POST /api/attendance/test/notify-student
 * Body: { studentId, meetingId, courseName, courseCode }
 */
const sendTestNotification = async (req, res) => {
    try {
        const { studentId, meetingId, courseName, courseCode } = req.body;

        if (!studentId) {
            return sendError(res, 400, 'studentId and meetingId are required');
        }

        // Simulate notification payload
        const notificationPayload = {
            type: 'ATTENDANCE_SESSION_STARTED',
            title: 'Attendance Session Started',
            message: `Your teacher started attendance for ${courseName}`,
            data: {
                meetingId: meetingId,
                courseName: courseName,
                courseCode: courseCode,
                timestamp: new Date().toISOString()
            }
        };

        console.log('📨 [TEST] Sending notification to student:', {
            studentId: studentId,
            payload: notificationPayload
        });

        // In future, this will send via FCM/APNs
        // For now, just log and return
        return sendSuccess(res, 200, 'Test notification sent', {
            notificationPayload: notificationPayload,
            studentsNotified: [studentId],
            message: 'In production, this would be sent via Firebase/APNs'
        });
    } catch (error) {
        return sendError(res, 500, 'Failed to send test notification', [error.message]);
    }
};

/**
 * Get teacher's attendance history
 * GET /api/attendance/teacher/history?page=1&limit=10
 */
const getTeacherHistory = async (req, res) => {
    try {
        const { startDate, endDate, offeringId, page = '1', limit = '10' } = req.query;
        const teacherId = req.user._id;

        const filters = {};
        if (offeringId) filters.offeringId = offeringId;
        if (startDate) filters.startDate = startDate;
        if (endDate) filters.endDate = endDate;

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const history = await getTeacherAttendanceHistory(teacherId, filters);
        const total = history.length;
        const totalPages = Math.ceil(total / limitNum);
        const paginatedRecords = history.slice(skip, skip + limitNum);

        return sendSuccess(res, 200, 'Teacher attendance history retrieved', {
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages
            },
            records: paginatedRecords
        });
    } catch (error) {
        console.error('❌ [ATTENDANCE] Error fetching teacher history:', error.message);
        return sendError(res, 500, 'Failed to fetch teacher history', [error.message]);
    }
};

/**
 * Get all active session IDs for a student's today's classes
 * GET /api/attendance/student/active-sessions
 */
const getStudentActiveSessions = async (req, res) => {
    try {
        const student = req.user;

        const activeTerm = await require('../models/Term').findOne({ isActive: true });
        if (!activeTerm) {
            return sendSuccess(res, 200, 'No active sessions', { activeSessionIds: [] });
        }

        // Find today's offerings for this student's cohort
        const offerings = await require('../models/CourseOffering').find({
            programId: student.programId,
            semester: student.semester,
            section: student.section ? student.section.toUpperCase() : undefined,
            termId: activeTerm._id,
            status: 'published'
        }).select('_id');

        const offeringIds = offerings.map(o => o._id);
        if (offeringIds.length === 0) {
            return sendSuccess(res, 200, 'No active sessions', { activeSessionIds: [] });
        }

        // Get today's meetings
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const today = days[new Date().getDay()];

        const todayMeetings = await require('../models/Meeting').find({
            offeringId: { $in: offeringIds },
            day: today
        }).select('_id');

        const meetingIds = todayMeetings.map(m => String(m._id));
        if (meetingIds.length === 0) {
            return sendSuccess(res, 200, 'No active sessions', { activeSessionIds: [] });
        }

        // Find active (non-ended) sessions for these meetings
        const activeSessions = await require('../models/AttendancePayload').find({
            classId: { $in: meetingIds },
            'payload.status': { $ne: 'ended' },
            'payload.action': 'START_ATTENDANCE_SESSION'
        }).select('classId');

        const activeSessionIds = [...new Set(activeSessions.map(s => s.classId))];

        return sendSuccess(res, 200, 'Active sessions fetched', { activeSessionIds });
    } catch (error) {
        console.error('❌ [ATTENDANCE] Error fetching student active sessions:', error.message);
        return sendError(res, 500, 'Failed to fetch active sessions', [error.message]);
    }
};

module.exports = {
    startAttendanceSession,
    markStudentAttendance,
    getAttendanceByMeeting,
    getStudentHistory,
    getOfferingStats,
    markTeacherAttendance, // Legacy
    endAttendanceSession,
    checkActiveSession,
    sendTestNotification,
    getTeacherHistory,
    getStudentActiveSessions
};
