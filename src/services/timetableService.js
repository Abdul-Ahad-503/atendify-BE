const Meeting = require('../models/Meeting');
const CourseOffering = require('../models/CourseOffering');
const Course = require('../models/Course');
const { isTimeOverlap } = require('../utils/timeUtils');

/**
 * Validate no room conflict exists for the given time slot
 * 
 * @param {Object} params
 * @param {ObjectId} params.termId - Term ID
 * @param {String} params.day - Day of week
 * @param {String} params.roomNo - Room number
 * @param {Number} params.startMinutes - Start time in minutes
 * @param {Number} params.endMinutes - End time in minutes
 * @param {ObjectId} params.excludeMeetingId - Meeting ID to exclude (for updates)
 * @returns {Object} { isValid: boolean, conflict: string | null, availableSlots: Array }
 */
const validateNoRoomConflict = async ({ termId, day, roomNo, startMinutes, endMinutes, excludeMeetingId = null }) => {
  const query = {
    termId,
    day,
    roomNo: roomNo.toUpperCase()
  };

  if (excludeMeetingId) {
    query._id = { $ne: excludeMeetingId };
  }

  // Find all meetings in the same room on the same day
  const existingMeetings = await Meeting.find(query).select('startMinutes endMinutes timeStart timeEnd roomNo');

  // Check for time overlap
  for (const meeting of existingMeetings) {
    if (isTimeOverlap(startMinutes, endMinutes, meeting.startMinutes, meeting.endMinutes)) {
      // Get available slots (1-12)
      const availableSlots = getAvailableSlots(existingMeetings, day);
      return {
        isValid: false,
        conflict: `Room ${roomNo} is already booked on ${day}. Available time slots: ${availableSlots.join(', ')}`,
        availableSlots
      };
    }
  }

  return { isValid: true, conflict: null, availableSlots: [] };
};

/**
 * Validate no teacher conflict exists for the given time slot
 * 
 * @param {Object} params
 * @param {ObjectId} params.termId - Term ID
 * @param {ObjectId} params.teacherId - Teacher's user ID
 * @param {String} params.day - Day of week
 * @param {Number} params.startMinutes - Start time in minutes
 * @param {Number} params.endMinutes - End time in minutes
 * @param {ObjectId} params.excludeMeetingId - Meeting ID to exclude (for updates)
 * @returns {Object} { isValid: boolean, conflict: string | null, availableSlots: Array }
 */
const validateNoTeacherConflict = async ({ termId, teacherId, day, startMinutes, endMinutes, excludeMeetingId = null }) => {
  const query = {
    termId,
    teacherId,
    day
  };

  if (excludeMeetingId) {
    query._id = { $ne: excludeMeetingId };
  }

  // Find all meetings by the same teacher on the same day
  const existingMeetings = await Meeting.find(query).select('startMinutes endMinutes timeStart timeEnd');

  // Check for time overlap
  for (const meeting of existingMeetings) {
    if (isTimeOverlap(startMinutes, endMinutes, meeting.startMinutes, meeting.endMinutes)) {
      // Get available slots (1-12)
      const availableSlots = getAvailableSlots(existingMeetings, day);
      return {
        isValid: false,
        conflict: `You already have a class on ${day}. Available time slots: ${availableSlots.join(', ')}`,
        availableSlots
      };
    }
  }

  return { isValid: true, conflict: null, availableSlots: [] };
};

/**
 * Get available time slots (1-12) for a given day
 * 
 * @param {Array} existingMeetings - Array of existing meetings
 * @param {String} day - Day of week
 * @returns {Array} Array of available slot numbers
 */
function getAvailableSlots(existingMeetings, day) {
  // Slot range is 1-12 (morning + afternoon)
  const availableSlots = [];

  for (let slot = 1; slot <= 12; slot++) {
    const slotStartMinutes = slot * 60;
    const slotEndMinutes = (slot + 1) * 60;

    // Check if this slot is already booked
    const isSlotBooked = existingMeetings.some(meeting => {
      // If meeting spans multiple slots, it occupies all those slots
      if (meeting.startMinutes < slotStartMinutes && meeting.endMinutes > slotEndMinutes) {
        return true;
      }
      // If meeting starts in this slot
      if (meeting.startMinutes >= slotStartMinutes && meeting.startMinutes < slotEndMinutes) {
        return true;
      }
      // If meeting ends in this slot
      if (meeting.endMinutes > slotStartMinutes && meeting.endMinutes <= slotEndMinutes) {
        return true;
      }
      return false;
    });

    if (!isSlotBooked) {
      availableSlots.push(slot);
    }
  }

  return availableSlots;
}

/**
 * Enforce credit hours limit - meetings per offering must not exceed course credit hours
 * 
 * @param {ObjectId} offeringId - Course offering ID
 * @param {Number} additionalMeetings - Number of meetings being added (default 1)
 * @throws {Error} If credit hours limit would be exceeded
 */
const enforceCreditHoursLimit = async (offeringId, additionalMeetings = 1) => {
  // Get offering and populate course to get credit hours
  const offering = await CourseOffering.findById(offeringId).populate('courseId');
  
  if (!offering) {
    throw new Error('Course offering not found');
  }
  
  const creditHours = offering.courseId.creditHours;
  
  // Count existing meetings for this offering
  const meetingCount = await Meeting.countDocuments({ offeringId });
  
  // Check if adding new meetings would exceed credit hours
  if (meetingCount + additionalMeetings > creditHours) {
    throw new Error(
      `Credit hours limit exceeded: This ${creditHours}-credit course can have maximum ${creditHours} meetings per week. Current: ${meetingCount}`
    );
  }
};

/**
 * Authorize that the teacher owns the offering
 * 
 * @param {ObjectId} offeringId - Course offering ID
 * @param {ObjectId} teacherIdFromToken - Teacher ID from JWT token
 * @throws {Error} If teacher doesn't own the offering
 * @returns {Object} The offering document
 */
const authorizeTeacherOwnsOffering = async (offeringId, teacherIdFromToken) => {
  const offering = await CourseOffering.findById(offeringId);
  
  if (!offering) {
    throw new Error('Course offering not found');
  }
  
  if (offering.teacherId.toString() !== teacherIdFromToken.toString()) {
    throw new Error('Unauthorized: You do not own this course offering');
  }
  
  return offering;
};

/**
 * Validate that a meeting belongs to an offering owned by the teacher
 * 
 * @param {ObjectId} meetingId - Meeting ID
 * @param {ObjectId} teacherIdFromToken - Teacher ID from JWT token
 * @throws {Error} If unauthorized
 * @returns {Object} The meeting document with populated offering
 */
const authorizeMeetingOwnership = async (meetingId, teacherIdFromToken) => {
  const meeting = await Meeting.findById(meetingId).populate('offeringId');
  
  if (!meeting) {
    throw new Error('Meeting not found');
  }
  
  if (meeting.offeringId.teacherId.toString() !== teacherIdFromToken.toString()) {
    throw new Error('Unauthorized: You do not own this meeting');
  }
  
  return meeting;
};

module.exports = {
  validateNoRoomConflict,
  validateNoTeacherConflict,
  enforceCreditHoursLimit,
  authorizeTeacherOwnsOffering,
  authorizeMeetingOwnership
};
