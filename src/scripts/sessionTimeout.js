const AttendancePayload = require('../models/AttendancePayload');
const Meeting = require('../models/Meeting');
const User = require('../models/User');
const { sendAttendancePush } = require('../services/notificationService');
const mongoose = require('mongoose');

/**
 * Check and auto-end expired attendance sessions
 * Runs every 5 minutes to check for sessions that have exceeded timeout
 */
const checkExpiredSessions = async () => {
  try {
    console.log('🔍 [SESSION TIMEOUT] Checking for expired sessions...');

    // Find all active sessions (not ended)
    const activeSessions = await AttendancePayload.find({
      'payload.status': { $ne: 'ended' }
    });

    if (activeSessions.length === 0) {
      console.log('✅ [SESSION TIMEOUT] No active sessions found');
      return;
    }

    let expiredCount = 0;
    let autoEndedCount = 0;

    for (const session of activeSessions) {
      const sessionCreatedAt = session.createdAt;
      const timeoutMinutes = session.sessionTimeoutMinutes || 50;
      const sessionAgeMinutes = (new Date() - sessionCreatedAt) / (1000 * 60);

      // Check if session has exceeded timeout
      if (sessionAgeMinutes > timeoutMinutes) {
        console.log(`⏰ [SESSION TIMEOUT] Session ${session.classId} expired (${Math.round(sessionAgeMinutes)} minutes old)`);

        // End the session
        await endExpiredSession(session);

        expiredCount++;
        autoEndedCount++;
      }
    }

    if (expiredCount > 0) {
      console.log(`✅ [SESSION TIMEOUT] Auto-ended ${autoEndedCount} expired session(s)`);
    } else {
      console.log('✅ [SESSION TIMEOUT] No sessions expired');
    }
  } catch (error) {
    console.error('❌ [SESSION TIMEOUT] Error checking sessions:', error.message);
  }
};

/**
 * End an expired session automatically
 */
const endExpiredSession = async (session) => {
  try {
    const meetingId = session.classId;
    const teacherId = session.teacherId;

    console.log(`🛑 [SESSION TIMEOUT] Ending expired session for meeting ${meetingId}`);

    // Get meeting and offering details
    const meeting = await Meeting.findById(meetingId).populate('offeringId');
    if (!meeting) {
      console.error(`❌ [SESSION TIMEOUT] Meeting not found: ${meetingId}`);
      return;
    }

    const offering = meeting.offeringId;
    if (!offering) {
      console.error(`❌ [SESSION TIMEOUT] Offering not found for meeting: ${meetingId}`);
      return;
    }

    // Find enrolled students
    const enrolledStudents = await User.find({
      role: 'student',
      programId: offering.programId,
      semester: offering.semester,
      section: offering.section,
      isActive: true
    }).select('_id');

    if (enrolledStudents.length === 0) {
      console.log(`ℹ️ [SESSION TIMEOUT] No students enrolled for meeting ${meetingId}`);
      return;
    }

    // Find which enrolled students already have attendance records for this meeting
    const existingRecords = await mongoose.model('Attendance').find({
      meetingId: meeting._id
    }).select('studentId');

    const existingStudentIds = new Set(
      existingRecords.map(r => String(r.studentId))
    );

    // Create absent records for those who never marked
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
        notes: 'Auto-marked absent - Session timed out after 50 minutes',
        requestPayload: null
      }));

    if (absentRecords.length > 0) {
      await mongoose.model('Attendance').insertMany(absentRecords);
      console.log(`✅ [SESSION TIMEOUT] Auto-marked ${absentRecords.length} students as absent`);
    }

    // Update session status to ended
    await AttendancePayload.findByIdAndUpdate(session._id, {
      'payload.status': 'ended',
      'payload.endedAt': new Date(),
      'payload.autoEnded': true,
      'payload.timeoutReason': 'Session exceeded timeout period'
    });

    console.log(`✅ [SESSION TIMEOUT] Session ${meetingId} successfully ended`);

    // Send notification to teacher about auto-ended session
    console.log(`ℹ️ [SESSION TIMEOUT] Session ${meetingId} auto-ended - notify teacher if needed`);
  } catch (error) {
    console.error(`❌ [SESSION TIMEOUT] Error ending session ${session.classId}:`, error.message);
  }
};

/**
 * Start the session timeout checker
 */
const startSessionTimeoutChecker = () => {
  console.log('⏰ [SESSION TIMEOUT] Starting session timeout checker...');

  // Check immediately on startup
  checkExpiredSessions();

  // Check every 5 minutes
  setInterval(checkExpiredSessions, 5 * 60 * 1000);

  console.log('✅ [SESSION TIMEOUT] Session timeout checker is running (checks every 5 minutes)');
};

module.exports = {
  checkExpiredSessions,
  endExpiredSession,
  startSessionTimeoutChecker
};