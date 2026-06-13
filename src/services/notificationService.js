const sendAttendancePush = async (students, meetingId, details) => {
  const messages = students
    .filter(s => s.pushToken)
    .map(s => ({
      to: s.pushToken,
      title: '📋 Mark Your Attendance',
      body: `${details.courseName} class is in session`,
      data: { meetingId: String(meetingId), action: 'MARK_ATTENDANCE' },
      sound: 'default',
    }));

  if (messages.length === 0) {
    console.log('⚠️ [PUSH] No students have push tokens, skipping notifications');
    return;
  }

  // Send in batches of 100 (Expo limit)
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chunk),
    });

    const result = await response.json();
    console.log(`✅ [PUSH] Sent batch ${i / 100 + 1}:`, result);
  }
};

module.exports = { sendAttendancePush };