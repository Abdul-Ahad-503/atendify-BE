const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const serviceAccount = require('../../service-account.json');

if (getApps().length === 0) {
  initializeApp({
    credential: cert(serviceAccount)
  });
}

const sendAttendancePush = async (students, meetingId, details) => {
  console.log('🔔 [PUSH] Called with', students.length, 'students');

  const tokens = students
    .filter(s => s.pushToken)
    .map(s => s.pushToken);

  console.log('🔔 [PUSH] Tokens found:', tokens.length);

  if (tokens.length === 0) {
    console.log('⚠️ [PUSH] No tokens, skipping');
    return;
  }

  const message = {
    notification: {
      title: '📋 Mark Your Attendance',
      body: `${details?.courseName || 'Your'} class is in session`,
    },
    data: {
      meetingId: String(meetingId),
      action: 'MARK_ATTENDANCE'
    },
    tokens,
  };

  try {
    const response = await getMessaging().sendEachForMulticast(message);
    console.log('✅ [PUSH] Success:', response.successCount);
    console.log('❌ [PUSH] Failed:', response.failureCount);
    response.responses.forEach((r, i) => {
      if (!r.success) {
        console.error(`❌ Token ${i} failed:`, r.error?.message);
      }
    });
  } catch (error) {
    console.error('❌ [PUSH] Error:', error.message);
  }
};

module.exports = { sendAttendancePush };