const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const {
    startAttendanceSession,
    markStudentAttendance,
    getAttendanceByMeeting,
    getStudentHistory,
    getOfferingStats,
    markTeacherAttendance,
    endAttendanceSession,
    checkActiveSession,
    sendTestNotification,
    getTeacherHistory,
    getStudentActiveSessions,
    updateAttendanceStatus
} = require('../controllers/attendanceController');
const {
    trackStudentLocation,
    getActiveStudentSession
} = require('../services/studentSessionService');

// ============ TEACHER ROUTES ============

// Teacher starts attendance session for a meeting
router.post('/teacher/start', protect, authorize('teacher'), startAttendanceSession);
router.get('/active-session/:meetingId', protect, checkActiveSession);


// Teacher mark attendance (legacy endpoint)
router.post('/teacher/mark', protect, authorize('teacher'), markTeacherAttendance);

router.post('/session/:sessionId/end', protect, endAttendanceSession);
router.post('/test/notify-student', sendTestNotification);

// Teacher: Update attendance status after session ends
router.patch('/meeting/:meetingId/attendance/:attendanceId/status', protect, authorize('teacher'), updateAttendanceStatus);


// ============ STUDENT ROUTES ============

// Student marks attendance for a meeting
router.post('/student/mark', protect, authorize('student'), markStudentAttendance);

// Get all active sessions for the student's today's classes
router.get('/student/active-sessions', protect, authorize('student'), getStudentActiveSessions);

// Get student's attendance history 
router.get('/student/history', protect, authorize('student'), getStudentHistory);

// Teacher attendance history
router.get('/teacher/history', protect, authorize('teacher'), getTeacherHistory);

// ============ STUDENT SESSION TRACKING ============

// Student tracks their location during active session
router.post('/student/track-location', protect, authorize('student'), trackStudentLocation);

// Get active session for a student
router.get('/student/active-session/:meetingId', protect, authorize('student'), getActiveStudentSession);

// ============ SHARED/QUERY ROUTES ============

// Get attendance for a specific meeting
router.get('/meeting/:meetingId', protect, getAttendanceByMeeting);

// Get attendance statistics for an offering
router.get('/stats/offering/:offeringId', protect, getOfferingStats);

module.exports = router;
