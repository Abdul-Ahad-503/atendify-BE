const Attendance = require('../models/Attendance');
const Meeting = require('../models/Meeting');
const User = require('../models/User');
const AttendancePayload = require('../models/AttendancePayload');

/**
 * Haversine formula to calculate distance between two geographic points
 */
const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371000;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

/**
 * Track student's location during session
 * If distance increases beyond 2x radius, mark as absent
 * POST /api/attendance/student/track-location
 */
const trackStudentLocation = async (req, res) => {
    try {
        const { meetingId, sessionId, location } = req.body;
        const studentId = req.user._id;

        if (!meetingId || !location) {
            return res.status(400).json({ success: false, message: 'meetingId and location are required' });
        }

        const latitude = Number(location.latitude);
        const longitude = Number(location.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return res.status(400).json({ success: false, message: 'Invalid location coordinates' });
        }

        // Find the teacher's session
        const meeting = await Meeting.findById(meetingId);
        if (!meeting) {
            return res.status(404).json({ success: false, message: 'Meeting not found' });
        }

        // Get the active teacher payload
        const teacherPayload = await AttendancePayload.findOne({
            classId: String(meetingId),
            'payload.status': { $ne: 'ended' }
        }).sort({ createdAt: -1 });

        if (!teacherPayload || !teacherPayload.payload.location) {
            return res.status(400).json({ success: false, message: 'No active session from teacher' });
        }

        const classLocation = teacherPayload.payload.location;
        const radiusMeters = teacherPayload.payload.radiusMeters || 10;
        const distance = calculateDistance(latitude, longitude, classLocation.latitude, classLocation.longitude);

        // Student is out of bounds if distance > 2x radius
        const outOfBounds = distance > (radiusMeters * 2);
        const status = outOfBounds ? 'absent' : 'present';

        // Find the existing attendance record for this session
        let attendance = await Attendance.findOne({
            studentId,
            meetingId,
            sessionId: sessionId || teacherPayload._id
        });

        if (attendance) {
            // Update existing attendance if out of bounds
            if (outOfBounds) {
                attendance.status = 'absent';
                attendance.distanceMeters = Math.round(distance);
                attendance.withinRadius = false;
                attendance.notes = 'Auto-marked absent - student left class proximity';
                await attendance.save();
            } else if (attendance.status === 'absent') {
                // If previously absent but now within bounds, mark present
                attendance.status = 'present';
                attendance.distanceMeters = Math.round(distance);
                attendance.withinRadius = true;
                attendance.notes = 'Student returned to class';
                await attendance.save();
            }
        }

        return res.status(200).json({
            success: true,
            message: 'Location tracked',
            data: {
                distance: Math.round(distance),
                withinRadius: distance <= radiusMeters,
                outOfBounds,
                status,
                sessionId: String(teacherPayload._id)
            }
        });
    } catch (error) {
        console.error('❌ Error tracking student location:', error.message);
        return res.status(500).json({ success: false, message: 'Failed to track location' });
    }
};

/**
 * Get active session for a student
 * GET /api/attendance/student/active-session/:meetingId
 */
const getActiveStudentSession = async (req, res) => {
    try {
        const { meetingId } = req.params;
        const studentId = req.user._id;

        // Check if there's an active teacher session
        const teacherPayload = await AttendancePayload.findOne({
            classId: String(meetingId),
            'payload.status': { $ne: 'ended' }
        }).sort({ createdAt: -1 });

        if (!teacherPayload) {
            return res.status(200).json({
                success: true,
                message: 'No active session',
                data: { isActive: false }
            });
        }

        // Check if student already marked attendance
        const attendance = await Attendance.findOne({
            studentId,
            meetingId,
            sessionId: teacherPayload._id
        });

        return res.status(200).json({
            success: true,
            message: 'Active session found',
            data: {
                isActive: true,
                sessionId: String(teacherPayload._id),
                meetingId,
                teacherLocation: teacherPayload.payload.location,
                radiusMeters: teacherPayload.payload.radiusMeters || 10,
                alreadyMarked: !!attendance,
                attendanceStatus: attendance?.status || null
            }
        });
    } catch (error) {
        console.error('❌ Error getting active session:', error.message);
        return res.status(500).json({ success: false, message: 'Failed to get active session' });
    }
};

/**
 * End all inactive student sessions when teacher ends their session
 */
const endStudentSessionsForMeeting = async (meetingId) => {
    try {
        const inactiveStudents = await Attendance.updateMany(
            { meetingId, status: 'present', withinRadius: true },
            { $set: { withinRadius: false, notes: 'Session ended by teacher' } }
        );
        console.log(`✅ Updated ${inactiveStudents.modifiedCount} student sessions for meeting ${meetingId}`);
        return inactiveStudents.modifiedCount;
    } catch (error) {
        console.error('❌ Error ending student sessions:', error.message);
        return 0;
    }
};

module.exports = {
    trackStudentLocation,
    getActiveStudentSession,
    endStudentSessionsForMeeting
};