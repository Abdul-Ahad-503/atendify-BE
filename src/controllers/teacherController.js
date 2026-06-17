const CourseOffering = require('../models/CourseOffering');
const Meeting = require('../models/Meeting');
const Course = require('../models/Course');
const Term = require('../models/Term');
const User = require('../models/User');
const Department = require('../models/Department');
const Program = require('../models/Program');
const mongoose = require('mongoose');
const { sendSuccess, sendError } = require('../utils/responseUtils');
const {
  validateNoRoomConflict,
  validateNoTeacherConflict,
  enforceCreditHoursLimit,
  authorizeTeacherOwnsOffering,
  authorizeMeetingOwnership
} = require('../services/timetableService');
const { timeToMinutes } = require('../utils/timeUtils');

/**
 * Create a new course offering
 * POST /api/teacher/offerings
 * 
 * Teacher creates an offering for a specific cohort (program + semester + section) in a term
 * Accepts courseName & creditHours - automatically creates course if it doesn't exist
 */
const createOffering = async (req, res) => {
  try {
    const { termId, departmentId, programId, semester, section, courseName, creditHours, group } = req.body;
    const teacherId = req.user._id; // From JWT token
    
    // Validate teacher role
    if (req.user.role !== 'teacher') {
      return sendError(res, 403, 'Only teachers can create course offerings');
    }
    
    // Validate required fields
    if (!termId) {
      return sendError(res, 400, 'termId is required');
    }
    if (!departmentId) {
      return sendError(res, 400, 'departmentId is required');
    }
    if (!programId) {
      return sendError(res, 400, 'programId is required');
    }
    if (!semester) {
      return sendError(res, 400, 'semester is required');
    }
    if (!section) {
      return sendError(res, 400, 'section is required');
    }
    if (!courseName) {
      return sendError(res, 400, 'courseName is required');
    }
    if (!creditHours) {
      return sendError(res, 400, 'creditHours is required');
    }
    
    // Find term by name or ObjectId
    let term;
    console.log('🔍 Looking for term:', termId);
    
    if (mongoose.Types.ObjectId.isValid(termId)) {
      term = await Term.findById(termId);
      console.log('✅ Found term by ID:', term?.name);
    } else {
      // Search by name (case-insensitive)
      term = await Term.findOne({ name: new RegExp(`^${termId}$`, 'i') });
      console.log('✅ Found term by name:', term?.name);
      
      if (!term) {
        // List all available terms for debugging
        const allTerms = await Term.find({}, 'name');
        console.log('Available terms:', allTerms.map(t => t.name));
      }
    }
    
    if (!term) {
      return sendError(res, 404, 'Term not found. Run seeder first: node src/seeders/timetableSeeder.js');
    }
    
    // Find department by name/code or ObjectId
    let department;
    console.log('🔍 Looking for department:', departmentId);
    
    if (mongoose.Types.ObjectId.isValid(departmentId)) {
      department = await Department.findById(departmentId);
    } else {
      // Search by code or name (case-insensitive)
      department = await Department.findOne({
        $or: [
          { code: departmentId.toUpperCase() },
          { name: new RegExp(`^${departmentId}$`, 'i') }
        ]
      });
    }
    
    if (!department) {
      const allDepts = await Department.find({}, 'code name');
      console.log('Available departments:', allDepts.map(d => `${d.code} - ${d.name}`));
      return sendError(res, 404, 'Department not found');
    }
    
    // Find program by code/name or ObjectId
    let program;
    console.log('🔍 Looking for program:', programId);
    
    if (mongoose.Types.ObjectId.isValid(programId)) {
      program = await Program.findById(programId);
    } else {
      // Search by code or name (case-insensitive)
      program = await Program.findOne({
        $or: [
          { code: programId.toUpperCase() },
          { name: new RegExp(`^${programId}$`, 'i') }
        ]
      });
    }
    
    if (!program) {
      const allProgs = await Program.find({}, 'code name');
      console.log('Available programs:', allProgs.map(p => `${p.code} - ${p.name}`));
      return sendError(res, 404, 'Program not found');
    }
    
    // Find or create course
    let course = await Course.findOne({ 
      name: courseName.trim(),
      departmentId: department._id
    });
    
    if (!course) {
      // Generate unique course code (DEPT-CODE + random 4 digits)
      let courseCode;
      let codeExists = true;
      
      while (codeExists) {
        const randomNum = Math.floor(1000 + Math.random() * 9000); // 1000-9999
        courseCode = `${department.code}-${randomNum}`;
        codeExists = await Course.findOne({ code: courseCode });
      }
      
      // Create new course
      course = await Course.create({
        code: courseCode,
        name: courseName.trim(),
        creditHours: parseInt(creditHours),
        departmentId: department._id,
        programId: program._id
      });
      
      console.log(`✅ Auto-created course: ${course.code} - ${course.name}`);
    }
    
    // Create offering
    const offering = await CourseOffering.create({
      termId: term._id,
      departmentId: department._id,
      programId: program._id,
      semester,
      section: section.toUpperCase(),
      courseId: course._id,
      teacherId,
      group: group || 'MAIN',
      status: 'draft'
    });
    
    // Populate for response
    await offering.populate(['courseId', 'programId', 'termId', 'departmentId']);
    
    sendSuccess(res, 201, 'Course offering created successfully', { offering });
    
  } catch (error) {
    console.error('❌ Error creating offering:', error);
    if (error.code === 11000) {
      return sendError(res, 409, 'You already have an offering for this course and cohort');
    }
    sendError(res, 400, 'Failed to create course offering', [error.message]);
  }
};

/**
 * Add a meeting to an offering
 * POST /api/teacher/offerings/:id/meetings
 * 
 * Creates a weekly meeting (lecture/lab) for the offering
 */
const addMeeting = async (req, res) => {
  try {
    const { id: offeringId } = req.params;
    const { day, slot, roomNo, timeStart, timeEnd } = req.body;
    const teacherId = req.user._id;
    
    console.log('📝 Adding meeting:', { offeringId, day, slot, roomNo, timeStart, timeEnd });
    
    // 1. Authorize teacher owns offering
    const offering = await authorizeTeacherOwnsOffering(offeringId, teacherId);
    
    // 2. Calculate time in minutes
    const startMinutes = timeToMinutes(timeStart);
    const endMinutes = timeToMinutes(timeEnd);
    
    // 3. Enforce credit hours limit
    await enforceCreditHoursLimit(offeringId);
    
    // 4. Validate no room conflict
    await validateNoRoomConflict({
      termId: offering.termId,
      day,
      roomNo,
      startMinutes,
      endMinutes
    });
    
    // 5. Validate no teacher conflict
    await validateNoTeacherConflict({
      termId: offering.termId,
      teacherId,
      day,
      startMinutes,
      endMinutes
    });
    
    // 6. Create meeting
    const meeting = await Meeting.create({
      offeringId,
      termId: offering.termId,
      teacherId,
      day,
      slot,
      roomNo: roomNo.toUpperCase(),
      timeStart,
      timeEnd,
      startMinutes,
      endMinutes
    });
    
    sendSuccess(res, 201, 'Meeting added successfully', { meeting });
    
  } catch (error) {
    console.error('❌ Error adding meeting:', error);
    if (error.code === 11000) {
      return sendError(res, 409, 'This time slot is already used for this offering');
    }
    sendError(res, 400, 'Failed to add meeting', [error.message]);
  }
};

/**
 * Update a meeting
 * PATCH /api/teacher/meetings/:id
 * 
 * Updates meeting details (day, time, room)
 */
const updateMeeting = async (req, res) => {
  try {
    const { id: meetingId } = req.params;
    const { day, slot, roomNo, timeStart, timeEnd } = req.body;
    const teacherId = req.user._id;
    
    // 1. Authorize meeting ownership
    const meeting = await authorizeMeetingOwnership(meetingId, teacherId);
    
    // 2. Calculate new time in minutes
    const startMinutes = timeStart ? timeToMinutes(timeStart) : meeting.startMinutes;
    const endMinutes = timeEnd ? timeToMinutes(timeEnd) : meeting.endMinutes;
    
    // 3. Validate no room conflict (exclude current meeting)
    await validateNoRoomConflict({
      termId: meeting.termId,
      day: day || meeting.day,
      roomNo: roomNo || meeting.roomNo,
      startMinutes,
      endMinutes,
      excludeMeetingId: meetingId
    });
    
    // 4. Validate no teacher conflict (exclude current meeting)
    await validateNoTeacherConflict({
      termId: meeting.termId,
      teacherId,
      day: day || meeting.day,
      startMinutes,
      endMinutes,
      excludeMeetingId: meetingId
    });
    
    // 5. Update meeting
    if (day) meeting.day = day;
    if (slot) meeting.slot = slot;
    if (roomNo) meeting.roomNo = roomNo.toUpperCase();
    if (timeStart) meeting.timeStart = timeStart;
    if (timeEnd) meeting.timeEnd = timeEnd;
    
    await meeting.save();
    
    sendSuccess(res, 200, 'Meeting updated successfully', { meeting });
    
  } catch (error) {
    sendError(res, 400, 'Failed to update meeting', [error.message]);
  }
};

/**
 * Delete a meeting
 * DELETE /api/teacher/meetings/:id
 * 
 * Removes a meeting from the schedule
 */
const deleteMeeting = async (req, res) => {
  try {
    const { id: meetingId } = req.params;
    const teacherId = req.user._id;
    
    // Authorize meeting ownership
    const meeting = await authorizeMeetingOwnership(meetingId, teacherId);
    
    await Meeting.findByIdAndDelete(meetingId);
    
    sendSuccess(res, 200, 'Meeting deleted successfully');
    
  } catch (error) {
    sendError(res, 400, 'Failed to delete meeting', [error.message]);
  }
};

/**
 * Get teacher's offerings
 * GET /api/teacher/me/offerings?termId=...
 * 
 * Lists all offerings created by the logged-in teacher
 */
const getMyOfferings = async (req, res) => {
  try {
    const { termId } = req.query;
    const teacherId = req.user._id;
    
    const query = { teacherId };
    if (termId) query.termId = termId;
    
    const offerings = await CourseOffering.find(query)
      .populate('courseId', 'code name creditHours')
      .populate('programId', 'code name')
      .populate('departmentId', 'code name')
      .populate('termId', 'name')
      .sort({ createdAt: -1 });
    
    // For each offering, get meetings
    const offeringsWithMeetings = await Promise.all(
      offerings.map(async (offering) => {
        const meetings = await Meeting.find({ offeringId: offering._id }).sort({ day: 1, slot: 1 });
        return {
          ...offering.toObject(),
          meetings
        };
      })
    );
    
    sendSuccess(res, 200, 'Offerings retrieved successfully', {
      count: offeringsWithMeetings.length,
      offerings: offeringsWithMeetings
    });
    
  } catch (error) {
    sendError(res, 400, 'Failed to retrieve offerings', [error.message]);
  }
};

/**
 * Publish an offering (make it visible to students)
 * PATCH /api/teacher/offerings/:id/publish
 */
const publishOffering = async (req, res) => {
  try {
    const { id: offeringId } = req.params;
    const teacherId = req.user._id;
    
    const offering = await authorizeTeacherOwnsOffering(offeringId, teacherId);
    
    offering.status = 'published';
    await offering.save();
    
    sendSuccess(res, 200, 'Offering published successfully', { offering });
    
  } catch (error) {
    sendError(res, 400, 'Failed to publish offering', [error.message]);
  }
};

/**
 * Get teacher's timetable organized by day
 * GET /api/teacher/me/timetable?termId=...
 * 
 * Returns teacher's weekly schedule organized by day
 */
const getMyTimetable = async (req, res) => {
  try {
    const { termId } = req.query;
    const teacherId = req.user._id;
    
    // Build query
    const query = { teacherId };
    if (termId) {
      // Handle termId as name or ObjectId
      let term;
      if (mongoose.Types.ObjectId.isValid(termId)) {
        term = await Term.findById(termId);
      } else {
        term = await Term.findOne({ name: new RegExp(`^${termId}$`, 'i') });
      }
      
      if (term) {
        query.termId = term._id;
      } else {
        // If no term found, use active term
        const activeTerm = await Term.findOne({ isActive: true });
        if (activeTerm) query.termId = activeTerm._id;
      }
    } else {
      // Default to active term
      const activeTerm = await Term.findOne({ isActive: true });
      if (activeTerm) query.termId = activeTerm._id;
    }
    
    // Get all meetings for this teacher
    const meetings = await Meeting.find(query)
      .populate({
        path: 'offeringId',
        populate: [
          { path: 'courseId', select: 'code name creditHours' },
          { path: 'programId', select: 'code name' },
          { path: 'termId', select: 'name' }
        ]
      })
      .sort({ day: 1, slot: 1 });
    
    // Organize by day
    const timetable = {
      Monday: [],
      Tuesday: [],
      Wednesday: [],
      Thursday: [],
      Friday: [],
      Saturday: [],
      Sunday: []
    };
    
    // Get unique offerings to count students once per offering
    const offeringStudentCounts = {};
    
    for (const meeting of meetings) {
      if (meeting.offeringId && !offeringStudentCounts[meeting.offeringId._id]) {
        const studentCount = await User.countDocuments({
          programId: meeting.offeringId.programId,
          semester: meeting.offeringId.semester,
          section: meeting.offeringId.section,
          role: 'student',
          isActive: true
        });
        offeringStudentCounts[meeting.offeringId._id] = studentCount;
      }
    }
    
    meetings.forEach(meeting => {
      if (meeting.offeringId && meeting.offeringId.courseId) {
        const meetingData = {
          id: meeting._id,
          courseName: meeting.offeringId.courseId.name,
          courseCode: meeting.offeringId.courseId.code,
          programCode: meeting.offeringId.programId?.code || 'N/A',
          semester: meeting.offeringId.semester,
          section: meeting.offeringId.section,
          slot: meeting.slot,
          timeStart: meeting.timeStart,
          timeEnd: meeting.timeEnd,
          roomNo: meeting.roomNo,
          offeringId: meeting.offeringId._id,
          group: meeting.offeringId.group || 'MAIN',
          creditHours: meeting.offeringId.courseId.creditHours,
          enrolledStudents: offeringStudentCounts[meeting.offeringId._id] || 0
        };
        
        timetable[meeting.day].push(meetingData);
      }
    });
    
    // Remove empty days (optional - keep all days for consistent UI)
    // Object.keys(timetable).forEach(day => {
    //   if (timetable[day].length === 0) delete timetable[day];
    // });
    
    sendSuccess(res, 200, 'Teacher timetable retrieved successfully', { timetable });
    
  } catch (error) {
    console.error('❌ Error getting teacher timetable:', error);
    sendError(res, 400, 'Failed to retrieve timetable', [error.message]);
  }
};

/**
 * Get teacher dashboard
 * GET /api/teacher/dashboard
 * 
 * Returns dashboard data including today's classes, active sessions, stats
 */
const getDashboard = async (req, res) => {
  try {
    const teacher = req.user;
    
    if (teacher.role !== 'teacher') {
      return sendError(res, 403, 'Only teachers can access this endpoint');
    }
    
    // Get active term
    const activeTerm = await Term.findOne({ isActive: true });
    if (!activeTerm) {
      return sendError(res, 404, 'No active term found');
    }
    
    // Get teacher's offerings
    const offerings = await CourseOffering.find({
      teacherId: teacher._id,
      termId: activeTerm._id
    })
      .populate('courseId', 'code name creditHours')
      .populate('programId', 'code name');
    
    // Get all meetings for these offerings
    const offeringIds = offerings.map(o => o._id);
    const allMeetings = await Meeting.find({ offeringId: { $in: offeringIds } })
      .populate({
        path: 'offeringId',
        populate: [
          { path: 'courseId', select: 'code name creditHours' },
          { path: 'programId', select: 'code name' }
        ]
      })
      .sort({ day: 1, slot: 1 });
    
    // Get today's day name
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = days[new Date().getDay()];
    
    // Filter today's classes
    const todayClasses = allMeetings
      .filter(m => m.day === today && m.offeringId)
      .map(m => ({
        id: m._id,
        course: {
          id: m.offeringId.courseId._id,
          courseCode: m.offeringId.courseId.code,
          courseName: m.offeringId.courseId.name,
          semester: m.offeringId.semester,
          creditHours: m.offeringId.courseId.creditHours
        },
        dayOfWeek: days.indexOf(m.day),
        startTime: m.timeStart,
        endTime: m.timeEnd,
        room: {
          roomNumber: m.roomNo
        },
        section: m.offeringId.section,
        programCode: m.offeringId.programId?.code || 'N/A',
        isActive: true
      }));
    
    // Get tomorrow's classes
    const tomorrow = days[(new Date().getDay() + 1) % 7];
    const upcomingClasses = allMeetings
      .filter(m => m.day === tomorrow && m.offeringId)
      .map(m => ({
        id: m._id,
        course: {
          id: m.offeringId.courseId._id,
          courseCode: m.offeringId.courseId.code,
          courseName: m.offeringId.courseId.name,
          semester: m.offeringId.semester,
          creditHours: m.offeringId.courseId.creditHours
        },
        dayOfWeek: days.indexOf(m.day),
        startTime: m.timeStart,
        endTime: m.timeEnd,
        room: {
          roomNumber: m.roomNo
        },
        section: m.offeringId.section,
        programCode: m.offeringId.programId?.code || 'N/A'
      }));
    
    // Count enrolled students for each offering
    const enrolledStudentCounts = {};
    for (const offering of offerings) {
      const count = await User.countDocuments({
        programId: offering.programId,
        semester: offering.semester,
        section: offering.section,
        role: 'student',
        isActive: true
      });
      enrolledStudentCounts[offering._id.toString()] = count;
    }
    
    const totalStudents = Object.values(enrolledStudentCounts).reduce((sum, count) => sum + count, 0);

    // Compute real active sessions by checking AttendancePayload
    const AttendancePayload = require('../models/AttendancePayload');
    const meetingIds = allMeetings.map(m => m._id.toString());
    const activePayloads = await AttendancePayload.find({
      classId: { $in: meetingIds },
      'payload.status': { $ne: 'ended' }
    }).sort({ createdAt: -1 });

    const activeSessionsMap = new Map();
    for (const p of activePayloads) {
      if (!activeSessionsMap.has(p.classId)) {
        activeSessionsMap.set(p.classId, p);
      }
    }

    const Attendance = require('../models/Attendance');
    let totalPresentToday = 0;
    let totalClassesHeld = 0;
    let totalAttendanceSum = 0;

    for (const meeting of allMeetings) {
      const records = await Attendance.find({ meetingId: meeting._id });
      if (records.length > 0) totalClassesHeld++;
      const presentCount = records.filter(r => r.status === 'present' || r.status === 'late').length;
      totalPresentToday += presentCount;
      const meetingTotal = enrolledStudentCounts[meeting.offeringId?._id?.toString()] || 1;
      if (records.length > 0) {
        totalAttendanceSum += Math.round((presentCount / Math.max(records.length, meetingTotal)) * 100);
      }
    }

    const avgAttendance = totalClassesHeld > 0 ? Math.round(totalAttendanceSum / totalClassesHeld) : 0;

    // Build active sessions with real counts
    const activeSessions = [];
    for (const [classId, payload] of activeSessionsMap) {
      const meeting = allMeetings.find(m => String(m._id) === classId);
      if (!meeting || !meeting.offeringId) continue;

      const records = await Attendance.find({ meetingId: meeting._id });
      const presentCount = records.filter(r => r.status === 'present' || r.status === 'late').length;
      const offeringIdStr = meeting.offeringId._id?.toString();

      activeSessions.push({
        id: payload._id,
        course: {
          id: meeting.offeringId.courseId?._id,
          courseCode: meeting.offeringId.courseId?.code,
          courseName: meeting.offeringId.courseId?.name
        },
        startTime: payload.createdAt || new Date(),
        room: { roomNumber: meeting.roomNo },
        totalPresent: presentCount,
        totalStudentsEnrolled: enrolledStudentCounts[offeringIdStr] || 0,
        section: meeting.offeringId.section,
        semester: meeting.offeringId.semester
      });
    }
    
    sendSuccess(res, 200, 'Dashboard data retrieved successfully', {
      upcomingClasses,
      todayClasses,
      activeSessions,
      recentSessions: [],
      notifications: [],
      stats: {
        totalCourses: offerings.length,
        totalStudents,
        classesToday: todayClasses.length,
        avgAttendance,
        totalPresentToday,
        activeSessionsCount: activeSessions.length
      }
    });
    
  } catch (error) {
    console.error('❌ Error getting teacher dashboard:', error);
    sendError(res, 400, 'Failed to retrieve dashboard data', [error.message]);
  }
};

module.exports = {
  createOffering,
  addMeeting,
  updateMeeting,
  deleteMeeting,
  getMyOfferings,
  publishOffering,
  getMyTimetable,
  getDashboard
};
