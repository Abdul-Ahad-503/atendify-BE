const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const {
  createOffering,
  addMeeting,
  updateMeeting,
  deleteMeeting,
  getMyOfferings,
  publishOffering,
  getMyTimetable,
  getDashboard
} = require('../controllers/teacherController');

/**
 * TEACHER ROUTES
 * All routes require authentication and teacher role
 */

// Dashboard
router.get('/dashboard', protect, authorize('teacher'), getDashboard);

// Course Offerings
router.post('/offerings', protect, authorize('teacher'), createOffering);
router.get('/me/offerings', protect, authorize('teacher'), getMyOfferings);
router.get('/offerings', protect, authorize('teacher'), getMyOfferings); // Also support without /me
router.patch('/offerings/:id/publish', protect, authorize('teacher'), publishOffering);

// Timetable
router.get('/me/timetable', protect, authorize('teacher'), getMyTimetable);

// Meetings
router.post('/offerings/:id/meetings', protect, authorize('teacher'), addMeeting);
router.patch('/meetings/:id', protect, authorize('teacher'), updateMeeting);
router.delete('/meetings/:id', protect, authorize('teacher'), deleteMeeting);

module.exports = router;
