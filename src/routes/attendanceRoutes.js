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
    checkActiveSession
} = require('../controllers/attendanceController');

// ============ TEACHER ROUTES ============

// Teacher starts attendance session for a meeting
router.post('/teacher/start', protect, authorize('teacher'), startAttendanceSession);
router.get('/active-session/:meetingId', protect, checkActiveSession);


// Teacher mark attendance (legacy endpoint)
router.post('/teacher/mark', protect, authorize('teacher'), markTeacherAttendance);

router.post('/session/:sessionId/end', protect, endAttendanceSession);


// ============ STUDENT ROUTES ============

// Student marks attendance for a meeting
router.post('/student/mark', protect, authorize('student'), markStudentAttendance);

// Get student's attendance history 
router.get('/student/history', protect, authorize('student'), getStudentHistory);

// ============ SHARED/QUERY ROUTES ============

// Get attendance for a specific meeting
router.get('/meeting/:meetingId', protect, getAttendanceByMeeting);

// Get attendance statistics for an offering
router.get('/stats/offering/:offeringId', protect, getOfferingStats);

module.exports = router;
