const CourseOffering = require('../models/CourseOffering');
const Meeting = require('../models/Meeting');
const Term = require('../models/Term');
const Program = require('../models/Program');
const mongoose = require('mongoose');
const { sendSuccess, sendError } = require('../utils/responseUtils');

const escapeRegex = (text = '') => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const resolveTerm = async (termId) => {
  if (termId) {
    if (mongoose.Types.ObjectId.isValid(termId)) {
      return Term.findById(termId);
    }
    return Term.findOne({ name: new RegExp(`^${escapeRegex(termId)}$`, 'i') });
  }

  return Term.findOne({ isActive: true });
};

const resolveProgram = async (program) => {
  if (!program) return null;

  if (mongoose.Types.ObjectId.isValid(program)) {
    return Program.findById(program);
  }

  const input = String(program).trim();

  let programDoc = await Program.findOne({
    $or: [
      { code: input.toUpperCase() },
      { name: new RegExp(`^${escapeRegex(input)}$`, 'i') }
    ]
  });

  if (!programDoc) {
    programDoc = await Program.findOne({ code: new RegExp(escapeRegex(input), 'i') });
  }

  return programDoc;
};

/**
 * Get student dashboard
 * GET /api/student/dashboard
 * 
 * Returns dashboard data including today's classes, stats
 */
const getDashboard = async (req, res) => {
  try {
    const student = req.user;
    
    if (student.role !== 'student') {
      return sendError(res, 403, 'Only students can access this endpoint');
    }
    
    if (!student.programId || !student.semester || !student.section) {
      return sendError(res, 400, 'Student profile is incomplete');
    }
    
    // Get active term
    const activeTerm = await Term.findOne({ isActive: true });
    if (!activeTerm) {
      return sendError(res, 404, 'No active term found');
    }
    
    // Get student's offerings
    const offerings = await CourseOffering.find({
      programId: student.programId,
      semester: student.semester,
      section: student.section.toUpperCase(),
      termId: activeTerm._id,
      status: 'published'
    })
      .populate('courseId', 'code name creditHours')
      .populate('teacherId', 'name email');
    
    // Get all meetings for these offerings
    const offeringIds = offerings.map(o => o._id);
    const allMeetings = await Meeting.find({ offeringId: { $in: offeringIds } })
      .populate({
        path: 'offeringId',
        populate: [
          { path: 'courseId', select: 'code name creditHours' },
          { path: 'teacherId', select: 'name email' }
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
          department: student.departmentId || 'N/A',
          semester: m.offeringId.semester,
          creditHours: m.offeringId.courseId.creditHours
        },
        dayOfWeek: days.indexOf(m.day),
        startTime: m.timeStart,
        endTime: m.timeEnd,
        room: {
          roomNumber: m.roomNo
        },
        teacher: {
          id: m.offeringId.teacherId._id,
          name: m.offeringId.teacherId.name,
          email: m.offeringId.teacherId.email,
          role: 'teacher'
        },
        isActive: true
      }));
    
    // Get tomorrow's day for upcoming classes
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
        teacher: {
          id: m.offeringId.teacherId._id,
          name: m.offeringId.teacherId.name,
          email: m.offeringId.teacherId.email
        }
      }));
    
    // Compute real attendance stats
    const Attendance = require('../models/Attendance');
    const allOfferingIds = offerings.map(o => o._id);
    let totalClassesAttended = 0;
    let totalClasses = 0;
    let presentToday = 0;
    let criticalCourses = 0;
    const attendanceOverview = [];

    for (const offering of offerings) {
      const meetings = await Meeting.find({ offeringId: offering._id }).select('_id');
      const meetingIds = meetings.map(m => m._id);

      if (meetingIds.length === 0) continue;

      const records = await Attendance.find({
        studentId: student._id,
        meetingId: { $in: meetingIds }
      });

      const classesAttended = records.filter(r => r.status === 'present' || r.status === 'late').length;
      const total = Math.max(records.length, meetings.length);
      const percentage = total > 0 ? Math.round((classesAttended / total) * 100) : 0;

      totalClassesAttended += classesAttended;
      totalClasses += total;

      attendanceOverview.push({
        id: offering._id,
        course: {
          id: offering.courseId._id,
          courseCode: offering.courseId.code,
          courseName: offering.courseId.name
        },
        classesAttended,
        totalClasses: total,
        percentage,
        status: percentage < 75 ? 'critical' : percentage < 85 ? 'warning' : 'good'
      });

      if (percentage < 75) criticalCourses++;

      // Check if marked present today
      const todayStr = new Date().toISOString().split('T')[0];
      const todayRecords = records.filter(r => {
        const recordDate = new Date(r.markedAt).toISOString().split('T')[0];
        return recordDate === todayStr;
      });
      if (todayRecords.some(r => r.status === 'present' || r.status === 'late')) {
        presentToday++;
      }
    }

    const averageAttendance = totalClasses > 0 ? Math.round((totalClassesAttended / totalClasses) * 100) : 0;

    sendSuccess(res, 200, 'Dashboard data retrieved successfully', {
      upcomingClasses,
      todayClasses,
      attendanceOverview,
      recentAttendance: [], // TODO: Implement when Attendance model is created
      notifications: [], // TODO: Implement when Notification model is created
      stats: {
        totalCourses: offerings.length,
        averageAttendance,
        presentToday,
        criticalCourses
      }
    });
    
  } catch (error) {
    console.error('❌ Error getting student dashboard:', error);
    sendError(res, 400, 'Failed to retrieve dashboard data', [error.message]);
  }
};

/**
 * Get student's timetable
 * GET /api/student/me/timetable?termId=...
 * 
 * Fetches timetable for the student's cohort (program + semester + section)
 * Only shows published offerings
 */
const getMyTimetable = async (req, res) => {
  try {
    const { termId } = req.query;
    const student = req.user;
    
    // Validate student role
    if (student.role !== 'student') {
      return sendError(res, 403, 'Only students can access this endpoint');
    }
    
    // Validate student has required fields
    if (!student.programId || !student.semester || !student.section) {
      return sendError(res, 400, 'Student profile is incomplete. Please update your program, semester, and section');
    }
    
    // Build query
    const query = {
      programId: student.programId,
      semester: student.semester,
      section: student.section.toUpperCase(),
      status: 'published' // Only show published offerings
    };

    // Resolve term by ObjectId or name (same behavior as teacher endpoints)
    let resolvedTerm = null;
    if (termId) {
      if (mongoose.Types.ObjectId.isValid(termId)) {
        resolvedTerm = await Term.findById(termId);
      } else {
        resolvedTerm = await Term.findOne({ name: new RegExp(`^${termId}$`, 'i') });
      }

      if (!resolvedTerm) {
        return sendError(res, 404, 'Term not found');
      }
      query.termId = resolvedTerm._id;
    } else {
      // If no termId provided, get active term
      const activeTerm = await Term.findOne({ isActive: true });
      if (!activeTerm) {
        return sendError(res, 404, 'No active term found');
      }
      query.termId = activeTerm._id;
      resolvedTerm = activeTerm;
    }
    
    // Fetch offerings
    const offerings = await CourseOffering.find(query)
      .populate('courseId', 'code name creditHours description')
      .populate('teacherId', 'name email')
      .populate('programId', 'code name')
      .populate('termId', 'name startDate endDate')
      .sort({ 'courseId.code': 1 });
    
    // For each offering, get meetings
    const timetable = await Promise.all(
      offerings.map(async (offering) => {
        const meetings = await Meeting.find({ offeringId: offering._id })
          .sort({ day: 1, slot: 1 });
        
        return {
          offering: {
            id: offering._id,
            group: offering.group,
            course: {
              code: offering.courseId.code,
              name: offering.courseId.name,
              creditHours: offering.courseId.creditHours,
              description: offering.courseId.description
            },
            teacher: {
              name: offering.teacherId.name,
              email: offering.teacherId.email
            }
          },
          meetings: meetings.map(m => ({
            id: m._id,
            day: m.day,
            slot: m.slot,
            roomNo: m.roomNo,
            timeStart: m.timeStart,
            timeEnd: m.timeEnd,
            timeRange: m.timeRange
          }))
        };
      })
    );
    
    // Organize by day for easier frontend consumption
    const byDay = {
      Monday: [],
      Tuesday: [],
      Wednesday: [],
      Thursday: [],
      Friday: [],
      Saturday: [],
      Sunday: []
    };
    timetable.forEach(item => {
      item.meetings.forEach(meeting => {
        byDay[meeting.day].push({
          ...meeting,
          course: item.offering.course,
          teacher: item.offering.teacher,
          group: item.offering.group
        });
      });
    });
    
    // Sort each day by slot
    Object.keys(byDay).forEach(day => {
      byDay[day].sort((a, b) => a.slot - b.slot);
    });
    
    sendSuccess(res, 200, 'Timetable retrieved successfully', {
      cohort: {
        program: offerings[0]?.programId.name || 'N/A',
        semester: student.semester,
        section: student.section,
        term: offerings[0]?.termId.name || resolvedTerm?.name || 'N/A'
      },
      courses: timetable,
      byDay
    });
    
  } catch (error) {
    console.error('❌ Error getting student timetable:', error);
    sendError(res, 400, 'Failed to retrieve timetable', [error.message]);
  }
};

/**
 * Get timetable by cohort request payload
 * POST /api/student/timetable/by-cohort
 *
 * Request body: { program, semester, section, termId? }
 */
const getTimetableByCohort = async (req, res) => {
  try {
    const { program, semester, section, termId } = req.body;

    if (!program) {
      return sendError(res, 400, 'program is required (ObjectId, code, or name)');
    }

    if (!semester) {
      return sendError(res, 400, 'semester is required');
    }

    if (!section) {
      return sendError(res, 400, 'section is required');
    }

    const semesterNumber = Number(semester);
    if (!Number.isInteger(semesterNumber) || semesterNumber < 1 || semesterNumber > 8) {
      return sendError(res, 400, 'semester must be an integer from 1 to 8');
    }

    const normalizedSection = String(section).trim().toUpperCase();
    if (!/^[A-Z]$/.test(normalizedSection)) {
      return sendError(res, 400, 'section must be a single letter A-Z');
    }

    const programDoc = await resolveProgram(program);
    if (!programDoc) {
      return sendError(res, 404, 'Program not found');
    }

    const resolvedTerm = await resolveTerm(termId);
    if (!resolvedTerm) {
      return sendError(res, 404, termId ? 'Term not found' : 'No active term found');
    }

    const query = {
      programId: programDoc._id,
      semester: semesterNumber,
      section: normalizedSection,
      termId: resolvedTerm._id,
      status: 'published'
    };

    const offerings = await CourseOffering.find(query)
      .populate('courseId', 'code name creditHours description')
      .populate('teacherId', 'name email')
      .populate('programId', 'code name')
      .populate('termId', 'name startDate endDate')
      .sort({ 'courseId.code': 1 });

    const timetable = await Promise.all(
      offerings.map(async (offering) => {
        const meetings = await Meeting.find({ offeringId: offering._id }).sort({ day: 1, slot: 1 });

        return {
          offering: {
            id: offering._id,
            group: offering.group,
            course: {
              code: offering.courseId.code,
              name: offering.courseId.name,
              creditHours: offering.courseId.creditHours,
              description: offering.courseId.description
            },
            teacher: {
              name: offering.teacherId.name,
              email: offering.teacherId.email
            }
          },
          meetings: meetings.map((m) => ({
            id: m._id,
            day: m.day,
            slot: m.slot,
            roomNo: m.roomNo,
            timeStart: m.timeStart,
            timeEnd: m.timeEnd,
            timeRange: m.timeRange
          }))
        };
      })
    );

    const byDay = {
      Monday: [],
      Tuesday: [],
      Wednesday: [],
      Thursday: [],
      Friday: [],
      Saturday: [],
      Sunday: []
    };

    timetable.forEach((item) => {
      item.meetings.forEach((meeting) => {
        byDay[meeting.day].push({
          ...meeting,
          course: item.offering.course,
          teacher: item.offering.teacher,
          group: item.offering.group
        });
      });
    });

    Object.keys(byDay).forEach((day) => {
      byDay[day].sort((a, b) => a.slot - b.slot);
    });

    sendSuccess(res, 200, 'Cohort timetable retrieved successfully', {
      cohort: {
        program: programDoc.name,
        programCode: programDoc.code,
        semester: semesterNumber,
        section: normalizedSection,
        term: resolvedTerm.name
      },
      courses: timetable,
      byDay
    });
  } catch (error) {
    console.error('❌ Error getting cohort timetable:', error);
    sendError(res, 400, 'Failed to retrieve cohort timetable', [error.message]);
  }
};

/**
 * Get all courses for student's program
 * GET /api/student/me/courses
 * 
 * Lists all available courses (for course catalog view)
 */
const getAvailableCourses = async (req, res) => {
  try {
    const student = req.user;
    
    if (!student.programId) {
      return sendError(res, 400, 'Student program not set');
    }
    
    const Course = require('../models/Course');
    const courses = await Course.find({
      $or: [
        { programId: student.programId },
        { programId: null } // General courses
      ],
      isActive: true
    }).select('code name creditHours description');
    
    sendSuccess(res, 200, 'Courses retrieved successfully', {
      count: courses.length,
      courses
    });
    
  } catch (error) {
    sendError(res, 400, 'Failed to retrieve courses', [error.message]);
  }
};

module.exports = {
  getDashboard,
  getMyTimetable,
  getTimetableByCohort,
  getAvailableCourses
};
