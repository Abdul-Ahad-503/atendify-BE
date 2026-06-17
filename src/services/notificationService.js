const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const serviceAccount = require('../../service-account.json');

if (getApps().length === 0) {
  initializeApp({
    credential: cert(serviceAccount)
  });
}

const sendAttendancePush = async (students, meetingId, details, teacherId = null) => {
  console.log('🔔 [PUSH] Called with', students.length, 'students');

  // Defensive filter — exclude the teacher from recipients (in case query returns them)
  let filteredStudents = students;
  if (teacherId) {
    filteredStudents = students.filter(
      s => String(s._id) !== String(teacherId)
    );
  }

  const tokens = filteredStudents
    .filter(s => s.pushToken)
    .map(s => s.pushToken);

  console.log('🔔 [PUSH] Tokens found:', tokens.length);

  if (tokens.length === 0) {
    console.log('⚠️ [PUSH] No tokens, skipping');
    return;
  }

  // Hybrid push: notification payload for visible alert (so user knows attendance started)
  // + data payload for background auto-attendance via TaskManager.
  // The client (expo-notifications + TaskManager) will:
  // 1. Show the notification to the user (tapping opens mark-attendance screen)
  // 2. Wake in background, get GPS, auto-mark attendance
  // 3. Show local notification with result
  const message = {
    notification: {
      title: '📋 Attendance Started',
      body: `${details?.courseName || 'Class'} — tap to mark attendance`,
    },
    data: {
      meetingId: String(meetingId),
      action: 'MARK_ATTENDANCE',
      type: 'BACKGROUND_AUTO_MARK',
      courseName: details?.courseName || '',
      courseCode: details?.courseCode || '',
      roomNo: details?.roomNumber || '',
      timeStart: details?.timeStart || '',
      timeEnd: details?.timeEnd || '',
      section: details?.section || '',
      semester: String(details?.semester || ''),
    },
    android: {
      priority: 'high',
      ttl: 300000, // 5 minutes
      notification: {
        channelId: 'attendance',
        priority: 'high',
        visibility: 'public',
      },
    },
    apns: {
      headers: {
        'apns-priority': '10',
        'apns-push-type': 'alert',
      },
      payload: {
        aps: {
          alert: {
            title: '📋 Attendance Started',
            body: `${details?.courseName || 'Class'} — tap to mark attendance`,
          },
          sound: 'default',
          'content-available': 1,
          badge: 1,
        },
      },
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