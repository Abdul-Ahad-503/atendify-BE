const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const {
  getDashboard,
  getMyTimetable,
  getTimetableByCohort,
  getAvailableCourses
} = require('../controllers/studentController');

/**
 * STUDENT ROUTES
 * All routes require authentication and student role
 */

// Dashboard
router.get('/dashboard', protect, authorize('student'), getDashboard);

// Timetable
router.get('/me/timetable', protect, authorize('student'), getMyTimetable);
router.post('/timetable/by-cohort', protect, authorize('student', 'teacher', 'admin'), getTimetableByCohort);
router.get('/me/courses', protect, authorize('student'), getAvailableCourses);

module.exports = router;
