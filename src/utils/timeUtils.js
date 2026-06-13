/**
 * Check if current time is within class schedule
 * 
 * @param {String} startTime - Format "HH:mm"
 * @param {String} endTime - Format "HH:mm"
 * @param {Date} currentTime - Current time (optional, defaults to now)
 * @returns {Object} { isWithinTime: Boolean, minutesLate: Number, status: String }
 */
const isWithinClassTime = (startTime, endTime, currentTime = new Date()) => {
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);
  
  const currentHour = currentTime.getHours();
  const currentMin = currentTime.getMinutes();
  
  // Convert to minutes since midnight
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  const currentMinutes = currentHour * 60 + currentMin;
  
  const isWithinTime = currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  
  // Calculate minutes late (if any)
  const minutesLate = Math.max(0, currentMinutes - startMinutes);
  
  // Determine status based on late threshold
  const lateThreshold = parseInt(process.env.LATE_THRESHOLD_MINUTES) || 10;
  let status = 'present';
  
  if (!isWithinTime) {
    status = 'absent';
  } else if (minutesLate > lateThreshold) {
    status = 'late';
  }
  
  return {
    isWithinTime,
    minutesLate,
    status
  };
};

/**
 * Check if today matches the timetable day
 * 
 * @param {String} timetableDay - Day from timetable (e.g., "Monday")
 * @param {Date} currentDate - Current date (optional, defaults to now)
 * @returns {Boolean}
 */
const isTodayScheduled = (timetableDay, currentDate = new Date()) => {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const today = days[currentDate.getDay()];
  return today === timetableDay;
};

/**
 * Get current day name
 * 
 * @param {Date} date - Date object (optional, defaults to now)
 * @returns {String} Day name (e.g., "Monday")
 */
const getCurrentDay = (date = new Date()) => {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
};

/**
 * Parse time string to minutes
 * 
 * @param {String} timeString - Format "HH:mm"
 * @returns {Number} Minutes since midnight
 */
const timeToMinutes = (timeString) => {
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 60 + minutes;
};

/**
 * Check if two time ranges overlap
 * 
 * @param {Number} startA - Start time in minutes
 * @param {Number} endA - End time in minutes
 * @param {Number} startB - Start time in minutes
 * @param {Number} endB - End time in minutes
 * @returns {Boolean} True if times overlap
 */
const isTimeOverlap = (startA, endA, startB, endB) => {
  // No overlap if one ends before the other starts
  return !(endA <= startB || endB <= startA);
};

/**
 * Format date to YYYY-MM-DD
 * 
 * @param {Date} date 
 * @returns {String}
 */
const formatDate = (date) => {
  return date.toISOString().split('T')[0];
};

module.exports = {
  isWithinClassTime,
  isTodayScheduled,
  getCurrentDay,
  timeToMinutes,
  isTimeOverlap,
  formatDate
};
