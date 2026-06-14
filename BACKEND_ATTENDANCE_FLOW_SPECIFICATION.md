# AttendX Backend Attendance Flow Specification

**Version:** 1.0  
**Date:** 2026-06-14  
**Audience:** Frontend Development Team  
**Project:** AttendX - Attendance Management System

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Complete System Flow](#complete-system-flow)
3. [Phase 1: Teacher Initiates Attendance](#phase-1-teacher-initiates-attendance)
4. [Phase 2: Students Receive Notification](#phase-2-students-receive-notification)
5. [Phase 3: Student Marks Attendance](#phase-3-student-marks-attendance)
6. [Phase 4: Teacher Views Live Attendance](#phase-4-teacher-views-live-attendance)
7. [Phase 5: Teacher Ends Session](#phase-5-teacher-ends-session)
8. [Phase 6: View Attendance Report](#phase-6-view-attendance-report)
9. [Phase 7: Student Views History](#phase-7-student-views-history)
10. [Phase 8: Student Views Statistics](#phase-8-student-views-statistics)
11. [Error Handling](#error-handling)
12. [State Management](#state-management)
13. [Frontend Requirements Checklist](#frontend-requirements-checklist)

---

## 🎯 Overview

The attendance system follows a **location-based validation model** where:

- **Teachers** initiate attendance sessions with their GPS location
- **Students** are notified and mark attendance with their GPS location
- **Backend** calculates distance using Haversine formula
- **Automatic Status Determination**: Present if within radius, Absent if outside
- **Full History Maintained** for analytics and reporting

### Key Architectural Decisions

| Aspect | Implementation |
|--------|-----------------|
| **Enrollment** | Implicit via programId + semester + section (no explicit enrollment table) |
| **Distance Calculation** | Haversine formula (accurate geographic distance) |
| **Status Logic** | distance <= radiusMeters → "present", else "absent" |
| **Notification** | Push notifications (FCM/APNs) or polling fallback |
| **Session Management** | Stored in AttendancePayload collection with timestamps |
| **Data Persistence** | Full Attendance records with geospatial indexes |

---

## 🔄 Complete System Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      ATTENDANCE SYSTEM ARCHITECTURE                     │
└─────────────────────────────────────────────────────────────────────────┘

                          TEACHER SIDE                          STUDENT SIDE
                          ────────────                          ────────────

                    ┌──────────────────┐
                    │  1. Open App     │
                    │  View Meetings   │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │ 2. Click         │
                    │ "Mark Attendance"│
                    └────────┬─────────┘
                             │
                    ┌────────▼──────────────┐
                    │ 3. Get GPS Location   │
                    │    (24.8607, 67.0011)│
                    └────────┬──────────────┘
                             │
                    ┌────────▼──────────────────┐
                    │ 4. POST                  │
                    │ /api/attendance/         │
                    │ teacher/start            │
                    │ {meetingId, location}    │
                    └────────┬──────────────────┘
                             │
              ┌──────────────▼──────────────────┐
              │   BACKEND PROCESSES             │
              ├──────────────────────────────────┤
              │ ✓ Validate meeting exists       │
              │ ✓ Validate teacher owns meeting │
              │ ✓ Find enrolled students       │
              │   (programId+semester+section)  │
              │ ✓ Send push notifications      │
              │ ✓ Save session to DB           │
              └──────────────────────────────────┘
                             │
              ┌──────────────▼──────────────────┐
              │ Returns: sessionId + student    │
              │ list + teacherLocation         │
              └──────────────────────────────────┘
                             │
                    ┌────────▼─────────┐
                    │ 5. Show           │
                    │ "Session Active"  │
                    │ Live Counter      │
                    │ (0/45 students)   │
                    └─────────┬─────────┘
                              │
                    ┌─────────▼──────────┐
                    │ 6. Poll for        │
                    │ updates every 5s   │
                    │ GET /api/          │
                    │ attendance/        │
                    │ meeting/:id        │
                    └─────────┬──────────┘
                              │
                              │
                              │  (Meanwhile...)
                              │
                              │  ┌─────────────────────┐
                              │  │ STUDENT GETS        │
                              │  │ NOTIFICATION        │
                              │  │ (Push or Polling)   │
                              │  └────────┬────────────┘
                              │           │
                              │  ┌────────▼─────────────┐
                              │  │ Shows Prompt:        │
                              │  │ "Mark Attendance?"   │
                              │  │ [Mark Now] [Later]   │
                              │  └────────┬─────────────┘
                              │           │
                              │  ┌────────▼──────────────┐
                              │  │ 7. Student Clicks    │
                              │  │ "Mark Now"           │
                              │  └────────┬──────────────┘
                              │           │
                              │  ┌────────▼──────────────────┐
                              │  │ 8. Get GPS Location       │
                              │  │    (24.8608, 67.0012)    │
                              │  └────────┬──────────────────┘
                              │           │
                              │  ┌────────▼──────────────────┐
                              │  │ 9. POST                  │
                              │  │ /api/attendance/         │
                              │  │ student/mark             │
                              │  │ {meetingId, location}    │
                              │  └────────┬──────────────────┘
                              │           │
              ┌───────────────▼───────────▼──────────────┐
              │      BACKEND PROCESSES                  │
              ├─────────────────────────────────────────┤
              │ ✓ Validate student enrolled             │
              │ ✓ Get teacher's location from session  │
              │ ✓ Calculate distance (Haversine)       │
              │   8m = distance(lat1,lon1,lat2,lon2)   │
              │ ✓ Check: 8m <= 10m? YES → PRESENT      │
              │ ✓ Create Attendance record in DB       │
              │ ✓ Store with GeoJSON locations        │
              └──────────────────────────────────────────┘
                              │
              ┌───────────────▼───────────────────────┐
              │ Returns:                              │
              │ {                                     │
              │   status: "present",                  │
              │   distance: "8m",                     │
              │   withinRadius: true,                 │
              │   attendanceId: "xxx"                 │
              │ }                                     │
              └──────────────────────────────────────┘
                              │
                    ┌─────────▼──────────┐
                    │ 10. Show Result    │
                    │ ✅ MARKED PRESENT  │
                    │ 8m / 10m radius    │
                    │ [Back to Home]     │
                    └────────────────────┘
                              │
                              │
                              ▼ (Continues polling)
                    ┌─────────────────────┐
                    │ 11. Counter Updates │
                    │ 1/45 → 2/45 →       │
                    │ ... → 45/45         │
                    └────────┬────────────┘
                             │
                    ┌────────▼─────────┐
                    │ 12. Click        │
                    │ "End Session"    │
                    └────────┬─────────┘
                             │
              ┌──────────────▼──────────────────┐
              │   BACKEND ENDS SESSION          │
              ├──────────────────────────────────┤
              │ Mark session as "ended"         │
              │ Stop accepting new marks        │
              └──────────────────────────────────┘
                             │
                    ┌────────▼─────────────┐
                    │ 13. View Report      │
                    │ 45 Total             │
                    │ 45 Present           │
                    │ 0 Absent             │
                    │ Avg Distance: 6m     │
                    └──────────────────────┘
```

---

## 📝 Phase 1: Teacher Initiates Attendance

### Request Format

**Endpoint:** `POST /api/attendance/teacher/start`  
**Authentication:** Bearer token (teacher only)  
**Content-Type:** `application/json`

```javascript
{
  "meetingId": "65abc123def456789xyz",
  "location": {
    "latitude": 24.8607,
    "longitude": 67.0011
  },
  "details": {
    "courseName": "Data Structures",
    "courseCode": "DCS-2001",
    "roomNumber": "R-403",
    "section": "A",
    "semester": 4,
    "enrolledCount": 45
  },
  "deviceInfo": "iPhone 14 Pro"
}
```

### What Backend Does

1. **Validate Input**
   - ✓ meetingId must exist
   - ✓ latitude/longitude must be valid numbers
   - ✓ teacher must own this meeting

2. **Find Meeting**
   ```
   Query: Meeting.findById(meetingId).populate('offeringId')
   Result: Meeting document with offering details
   ```

3. **Find Enrolled Students**
   ```
   Query: User.find({
     role: 'student',
     programId: meeting.offering.programId,
     semester: meeting.offering.semester,
     section: meeting.offering.section,
     isActive: true
   })
   Result: Array of 45 students with _id, name, email, pushToken
   ```

4. **Send Push Notifications**
   ```javascript
   For each student, send:
   {
     type: 'ATTENDANCE_SESSION_STARTED',
     title: 'Attendance Session Started',
     message: 'Your teacher started attendance for Data Structures',
     data: {
       meetingId: '65abc123def456789xyz',
       courseName: 'Data Structures',
       courseCode: 'DCS-2001'
     }
   }
   ```

5. **Save Session Info**
   ```javascript
   AttendancePayload.create({
     teacherId: teacher_id,
     classId: meetingId,
     courseId: offering_id,
     payload: {
       action: 'START_ATTENDANCE_SESSION',
       meetingId,
       location: { latitude, longitude },
       details,
       deviceInfo,
       enrolledStudentsCount: 45,
       timestamp: Date.now()
     }
   })
   ```

### Response

```json
{
  "success": true,
  "message": "Attendance session started successfully",
  "data": {
    "sessionId": "607f1f77bcf86cd799439011",
    "meetingId": "65abc123def456789xyz",
    "enrolledStudentsCount": 45,
    "studentsToNotify": [
      {
        "studentId": "607f1f77bcf86cd799439012",
        "name": "Ali Khan",
        "email": "ali@example.com"
      },
      {
        "studentId": "607f1f77bcf86cd799439013",
        "name": "Fatima Ali",
        "email": "fatima@example.com"
      }
      // ... 43 more students
    ],
    "teacherLocation": {
      "latitude": 24.8607,
      "longitude": 67.0011
    }
  }
}
```

### Frontend Implementation

```javascript
// Navigation to session screen
navigation.navigate('AttendanceSessionScreen', {
  sessionId: response.data.sessionId,
  meetingId: response.data.meetingId,
  enrolledCount: response.data.enrolledStudentsCount,
  startTime: new Date()
});

// Start polling for updates every 5 seconds
startPolling(() => {
  fetch(`/api/attendance/meeting/${meetingId}`)
    .then(data => updateLiveCounter(data.summary))
}, 5000);
```

---

## 🔔 Phase 2: Students Receive Notification

### Option A: Push Notification (Real-time)

**Provider:** Firebase Cloud Messaging (FCM) or Apple Push Notifications (APNs)

**Notification Payload:**
```json
{
  "type": "ATTENDANCE_SESSION_STARTED",
  "title": "Attendance Session Started",
  "message": "Your teacher started attendance for Data Structures",
  "data": {
    "meetingId": "65abc123def456789xyz",
    "courseName": "Data Structures",
    "courseCode": "DCS-2001",
    "classLocation": {
      "latitude": 24.8607,
      "longitude": 67.0011
    }
  }
}
```

### Option B: Polling (Fallback)

**Endpoint:** `GET /api/attendance/active-sessions`  
**Frequency:** Every 10 seconds

**Response:**
```json
{
  "success": true,
  "data": {
    "activeSession": {
      "meetingId": "65abc123def456789xyz",
      "courseName": "Data Structures",
      "courseCode": "DCS-2001",
      "roomNo": "R-403",
      "timeStart": "08:30",
      "timeEnd": "09:20"
    }
  }
}
```

### Frontend Implementation

```javascript
// Listen for notifications
useEffect(() => {
  const subscription = notificationListener((notification) => {
    if (notification.data.type === 'ATTENDANCE_SESSION_STARTED') {
      showModal({
        title: 'Attendance Session Started',
        message: `Your teacher started attendance for ${notification.data.courseName}`,
        buttons: [
          {
            text: 'Mark Now',
            onPress: () => navigateTo('MarkAttendanceScreen', {
              meetingId: notification.data.meetingId
            })
          },
          {
            text: 'Mark Later',
            onPress: () => dismissModal()
          }
        ]
      });
    }
  });

  return () => subscription.remove();
}, []);
```

---

## 📍 Phase 3: Student Marks Attendance

### Request Format

**Endpoint:** `POST /api/attendance/student/mark`  
**Authentication:** Bearer token (student only)  
**Content-Type:** `application/json`

```javascript
{
  "meetingId": "65abc123def456789xyz",
  "location": {
    "latitude": 24.8608,
    "longitude": 67.0012
  },
  "radiusMeters": 10,
  "deviceInfo": "Samsung Galaxy S21"
}
```

### What Backend Does

1. **Validate Input**
   - ✓ meetingId exists
   - ✓ latitude/longitude are valid numbers
   - ✓ radiusMeters >= 5

2. **Verify Student Enrollment**
   ```javascript
   const student = await User.findById(studentId)
   const offering = meeting.offeringId
   
   // Must match all three:
   if (
     student.programId != offering.programId ||
     student.semester != offering.semester ||
     student.section != offering.section
   ) {
     return error('Not enrolled in this course')
   }
   ```

3. **Get Teacher's Location**
   ```javascript
   const teacherSession = await AttendancePayload.findOne({
     teacherId: meeting.teacherId,
     classId: meetingId
   })
   
   const classLocation = teacherSession.payload.location
   // Result: { latitude: 24.8607, longitude: 67.0011 }
   ```

4. **Calculate Distance Using Haversine Formula**
   ```javascript
   const distance = calculateDistance(
     24.8608,   // studentLocation.latitude
     67.0012,   // studentLocation.longitude
     24.8607,   // classLocation.latitude
     67.0011    // classLocation.longitude
   )
   
   // Formula breakdown:
   // R = 6371000 meters (Earth's radius)
   // φ1 = lat1 * π/180
   // φ2 = lat2 * π/180
   // Δφ = (lat2 - lat1) * π/180
   // Δλ = (lon2 - lon1) * π/180
   // a = sin²(Δφ/2) + cos(φ1) * cos(φ2) * sin²(Δλ/2)
   // c = 2 * atan2(√a, √(1-a))
   // distance = R * c
   
   // Result: 8 meters
   ```

5. **Determine Attendance Status**
   ```javascript
   withinRadius = distance <= radiusMeters
   // 8 <= 10? YES ✓
   
   status = withinRadius ? 'present' : 'absent'
   // Result: 'present'
   ```

6. **Create Attendance Record**
   ```javascript
   Attendance.create({
     meetingId,
     studentId,
     teacherId: meeting.teacherId,
     offeringId: meeting.offeringId._id,
     termId: meeting.termId,
     
     // GeoJSON format for geospatial queries
     studentLocation: {
       type: 'Point',
       coordinates: [67.0012, 24.8608]  // [longitude, latitude]
     },
     classLocation: {
       type: 'Point',
       coordinates: [67.0011, 24.8607]
     },
     
     distanceMeters: 8,
     withinRadius: true,
     radiusMeters: 10,
     status: 'present',
     
     markedAt: Date.now(),
     meetingDate: new Date(),
     
     deviceInfo,
     requestPayload: req.body
   })
   ```

### Response

```json
{
  "success": true,
  "message": "Attendance marked successfully",
  "data": {
    "attendanceId": "607f1f77bcf86cd799439015",
    "status": "present",
    "distance": "8m",
    "withinRadius": true,
    "radiusMeters": 10,
    "markedAt": "2026-06-14T10:31:15Z"
  }
}
```

### Frontend Implementation

```javascript
const markAttendance = async (meetingId) => {
  try {
    setLoading(true);

    // Get GPS location
    const location = await getStudentLocation();
    if (!location) {
      showError('Cannot access GPS location');
      return;
    }

    // Call API
    const response = await fetch('/api/attendance/student/mark', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        meetingId,
        location: {
          latitude: location.latitude,
          longitude: location.longitude
        },
        radiusMeters: 10,
        deviceInfo: getDeviceInfo()
      })
    });

    const data = await response.json();

    if (!data.success) {
      handleError(data.message);
      return;
    }

    // Store locally
    saveLocalAttendance(data.data);

    // Show result screen
    navigation.navigate('AttendanceResultScreen', {
      attendance: data.data
    });

  } finally {
    setLoading(false);
  }
};
```

---

## 📊 Phase 4: Teacher Views Live Attendance

### Request Format

**Endpoint:** `GET /api/attendance/meeting/:meetingId`  
**Authentication:** Bearer token  
**Frequency:** Poll every 5 seconds

```bash
GET /api/attendance/meeting/65abc123def456789xyz
Authorization: Bearer TOKEN
```

### Response

```json
{
  "success": true,
  "message": "Attendance records fetched",
  "data": {
    "summary": {
      "total": 45,
      "present": 35,
      "absent": 10,
      "late": 0,
      "avgDistance": "6m"
    },
    "records": [
      {
        "_id": "607f1f77bcf86cd799439015",
        "studentId": {
          "_id": "607f1f77bcf86cd799439012",
          "name": "Ali Khan",
          "rollNumber": "2021-CS-123"
        },
        "status": "present",
        "distance": "8m",
        "distanceMeters": 8,
        "withinRadius": true,
        "markedAt": "2026-06-14T10:31:15Z"
      },
      {
        "_id": "607f1f77bcf86cd799439016",
        "studentId": {
          "_id": "607f1f77bcf86cd799439013",
          "name": "Fatima Ali",
          "rollNumber": "2021-CS-124"
        },
        "status": "absent",
        "distance": "45m",
        "distanceMeters": 45,
        "withinRadius": false,
        "markedAt": "2026-06-14T10:32:20Z"
      }
      // ... 43 more records
    ]
  }
}
```

### Frontend Implementation

```javascript
const AttendanceSessionScreen = ({ meetingId, enrolledCount }) => {
  const [attendanceCount, setAttendanceCount] = useState(0);
  const [records, setRecords] = useState([]);

  useEffect(() => {
    const interval = setInterval(fetchAttendance, 5000);
    fetchAttendance(); // Initial fetch
    return () => clearInterval(interval);
  }, []);

  const fetchAttendance = async () => {
    try {
      const response = await fetch(`/api/attendance/meeting/${meetingId}`, {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });

      const data = await response.json();

      if (data.success) {
        setAttendanceCount(data.data.summary.present);
        setRecords(data.data.records);
      }
    } catch (error) {
      console.error('Polling error:', error);
    }
  };

  const progressPercentage = (attendanceCount / enrolledCount) * 100;

  return (
    <View>
      <Text>Session Active - Live</Text>
      <Text>{attendanceCount} / {enrolledCount} students marked</Text>
      <ProgressBar progress={progressPercentage / 100} />
      <Text>{Math.round(progressPercentage)}% Complete</Text>
      <FlatList
        data={records}
        renderItem={({ item }) => (
          <StudentMarkedCard student={item} />
        )}
      />
    </View>
  );
};
```

---

## 🛑 Phase 5: Teacher Ends Session

### Request Format

**Endpoint:** `POST /api/attendance/teacher/end`  
**Authentication:** Bearer token (teacher)

```javascript
{
  "sessionId": "607f1f77bcf86cd799439011"
}
```

### What Backend Does

1. Mark session as ended in database
2. Stop accepting new attendance marks
3. Return success

### Response

```json
{
  "success": true,
  "message": "Session ended successfully",
  "data": {
    "sessionId": "607f1f77bcf86cd799439011",
    "status": "ended",
    "endedAt": "2026-06-14T10:35:00Z"
  }
}
```

### Frontend Implementation

```javascript
const handleEndSession = async () => {
  Alert.alert(
    'End Session?',
    'Are you sure? Students will no longer be able to mark attendance',
    [
      { text: 'Cancel' },
      {
        text: 'End Session',
        onPress: async () => {
          const response = await fetch('/api/attendance/teacher/end', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${userToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sessionId })
          });

          const data = await response.json();

          if (data.success) {
            showSuccess('Session ended');
            navigation.navigate('AttendanceReportScreen');
          }
        },
        style: 'destructive'
      }
    ]
  );
};
```

---

## 📋 Phase 6: View Attendance Report

### Request Format

**Endpoint:** `GET /api/attendance/meeting/:meetingId`  
**Authentication:** Bearer token  
**Usage:** After session ends

```bash
GET /api/attendance/meeting/65abc123def456789xyz
Authorization: Bearer TOKEN
```

### Frontend Implementation

```javascript
const AttendanceReportScreen = ({ meetingId }) => {
  const [report, setReport] = useState(null);

  useEffect(() => {
    fetchReport();
  }, []);

  const fetchReport = async () => {
    const response = await fetch(`/api/attendance/meeting/${meetingId}`, {
      headers: { 'Authorization': `Bearer ${userToken}` }
    });

    const data = await response.json();
    setReport(data.data);
  };

  return (
    <View>
      <SummaryCard
        label="Present"
        value={report.summary.present}
        color="green"
      />
      <SummaryCard
        label="Absent"
        value={report.summary.absent}
        color="red"
      />
      <SummaryCard
        label="Total"
        value={report.summary.total}
        color="blue"
      />

      <FlatList
        data={report.records}
        renderItem={({ item }) => (
          <DetailedStudentRecord record={item} />
        )}
      />

      <Button onPress={exportReport}>Export as PDF</Button>
    </View>
  );
};
```

---

## 📱 Phase 7: Student Views History

### Request Format

**Endpoint:** `GET /api/attendance/student/history`  
**Authentication:** Bearer token (student)  
**Query Parameters:** Optional filters

```bash
GET /api/attendance/student/history?termId=xxx&offeringId=yyy&startDate=2026-06-01&endDate=2026-06-30
Authorization: Bearer TOKEN
```

### Response

```json
{
  "success": true,
  "data": {
    "total": 24,
    "records": [
      {
        "_id": "607f1f77bcf86cd799439015",
        "status": "present",
        "distanceMeters": 8,
        "withinRadius": true,
        "markedAt": "2026-06-14T10:31:15Z",
        "meetingId": {
          "day": "Monday",
          "timeStart": "08:30",
          "timeEnd": "09:20",
          "roomNo": "R-403"
        },
        "offeringId": {
          "courseId": {
            "code": "DCS-2001",
            "name": "Data Structures"
          }
        }
      },
      {
        "_id": "607f1f77bcf86cd799439016",
        "status": "absent",
        "distanceMeters": 45,
        "withinRadius": false,
        "markedAt": "2026-06-13T10:31:15Z",
        "meetingId": {
          "day": "Sunday",
          "timeStart": "08:30",
          "timeEnd": "09:20",
          "roomNo": "R-403"
        },
        "offeringId": {
          "courseId": {
            "code": "DCS-2001",
            "name": "Data Structures"
          }
        }
      }
      // ... 22 more records
    ]
  }
}
```

### Frontend Implementation

```javascript
const AttendanceHistoryScreen = () => {
  const [history, setHistory] = useState([]);
  const [filters, setFilters] = useState({});

  useEffect(() => {
    loadHistory();
  }, [filters]);

  const loadHistory = async () => {
    const params = new URLSearchParams();
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);

    const response = await fetch(
      `/api/attendance/student/history?${params}`,
      { headers: { 'Authorization': `Bearer ${userToken}` } }
    );

    const data = await response.json();
    setHistory(data.data.records);
  };

  return (
    <View>
      <DateRangeFilter onFilter={setFilters} />
      
      <FlatList
        data={history}
        renderItem={({ item }) => (
          <HistoryCard
            courseCode={item.offeringId.courseId.code}
            courseName={item.offeringId.courseId.name}
            date={formatDate(item.markedAt)}
            time={`${item.meetingId.timeStart}-${item.meetingId.timeEnd}`}
            status={item.status}
            distance={`${item.distanceMeters}m`}
            room={item.meetingId.roomNo}
          />
        )}
      />
    </View>
  );
};
```

---

## 📊 Phase 8: Student Views Statistics

### Request Format

**Endpoint:** `GET /api/attendance/stats/offering/:offeringId`  
**Authentication:** Bearer token

```bash
GET /api/attendance/stats/offering/607f1f77bcf86cd799439002
Authorization: Bearer TOKEN
```

### Response

```json
{
  "success": true,
  "data": {
    "totalStudents": 45,
    "stats": [
      {
        "studentId": "607f1f77bcf86cd799439012",
        "student": {
          "name": "Ali Khan",
          "studentId": "2021-CS-123"
        },
        "totalClasses": 24,
        "presentCount": 22,
        "absentCount": 1,
        "lateCount": 1,
        "avgDistance": 5.2,
        "attendancePercentage": 91.67
      }
      // ^ Your stats (first in array)
    ]
  }
}
```

### Frontend Implementation

```javascript
const StatisticsScreen = ({ offeringId }) => {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    const response = await fetch(
      `/api/attendance/stats/offering/${offeringId}`,
      { headers: { 'Authorization': `Bearer ${userToken}` } }
    );

    const data = await response.json();
    const myStats = data.data.stats[0]; // Your stats
    setStats(myStats);
  };

  return (
    <View>
      <ProgressCircle
        percent={stats?.attendancePercentage || 0}
        radius={80}
        color="#10B981"
      >
        <Text>{stats?.attendancePercentage?.toFixed(1)}%</Text>
      </ProgressCircle>

      <StatCard label="Total Classes" value={stats?.totalClasses} />
      <StatCard label="Present" value={stats?.presentCount} />
      <StatCard label="Absent" value={stats?.absentCount} />
      <StatCard label="Late" value={stats?.lateCount} />
      <StatCard 
        label="Avg Distance" 
        value={`${stats?.avgDistance?.toFixed(2)}m`}
      />
    </View>
  );
};
```

---

## ⚠️ Error Handling

### Common Error Scenarios

| Error Message | HTTP Code | Scenario | Frontend Action |
|---|---|---|---|
| `classId is required` | 400 | Missing classId | Show validation error |
| `location.latitude and location.longitude are required` | 400 | GPS not captured | Show "GPS Error" |
| `Meeting not found` | 404 | Invalid meetingId | Show error, refresh list |
| `You are not authorized to mark attendance for this meeting` | 403 | Teacher doesn't own meeting | Show unauthorized error |
| `You are not enrolled in this course` | 403 | Student not in cohort | Show "Not enrolled" error |
| `Teacher has not started attendance session yet` | 400 | Student marks before teacher starts | Show "Not started yet" error |
| `radiusMeters must be a valid number >= 5` | 400 | Invalid radius | Show validation error |
| `User not found` | 401 | Token invalid | Redirect to login |
| `Not authorized, no token provided` | 401 | Missing Bearer token | Redirect to login |
| `Network error` | 500+ | Backend error | Show "Try again" with retry button |

### Frontend Error Handler

```javascript
const handleAttendanceError = (error, message) => {
  if (message.includes('GPS') || message.includes('location')) {
    showError('GPS location is required. Please check your location settings.');
  } else if (message.includes('not enrolled')) {
    showError('You are not enrolled in this course.');
    navigation.navigate('HomeScreen');
  } else if (message.includes('not started')) {
    showError('Teacher has not started attendance session yet.');
  } else if (message.includes('already marked')) {
    showInfo('You have already marked attendance for this class.');
  } else if (message.includes('authorized')) {
    showError('You are not authorized for this action.');
    navigation.navigate('HomeScreen');
  } else {
    showError(message || 'An error occurred. Please try again.');
  }
};
```

---

## 🗂️ State Management

### Redux/Zustand Store Structure

```javascript
const attendanceState = {
  // Teacher session state
  activeSession: {
    sessionId: string,
    meetingId: string,
    status: 'active' | 'ended' | null,
    startedAt: timestamp,
    enrolledCount: number,
    markedCount: number,
    presentCount: number,
    absentCount: number,
    teacherLocation: { latitude: number, longitude: number }
  },

  // Student attendance state
  lastAttendance: {
    attendanceId: string,
    status: 'present' | 'absent',
    distance: string,
    markedAt: timestamp,
    withinRadius: boolean
  },

  // Cached history
  historyCache: Array<{
    attendanceId: string,
    courseCode: string,
    courseName: string,
    date: string,
    time: string,
    status: string,
    distance: string,
    room: string
  }>,

  // Statistics
  statistics: {
    totalClasses: number,
    presentCount: number,
    absentCount: number,
    lateCount: number,
    attendancePercentage: number,
    avgDistance: number
  },

  // Current notification
  activeNotification: {
    type: string,
    meetingId: string,
    courseName: string
  } | null,

  // Loading states
  loading: {
    marking: boolean,
    polling: boolean,
    fetchingHistory: boolean,
    fetchingStats: boolean
  }
};
```

---

## ✅ Frontend Requirements Checklist

### GPS & Location Services
- [ ] Request foreground location permissions (iOS & Android)
- [ ] Handle permission denied scenario gracefully
- [ ] Get high-accuracy GPS coordinates (Accuracy.High)
- [ ] Handle GPS timeout (15 seconds)
- [ ] Validate coordinates are not null/undefined
- [ ] Show GPS accuracy indicator on screen

### Teacher Flow
- [ ] Fetch today's meetings from `/api/teacher/me/timetable`
- [ ] Display meeting list with enrolled student count
- [ ] "Mark Attendance" button requests GPS
- [ ] Send POST request to `/api/attendance/teacher/start`
- [ ] Show "Session Active" screen
- [ ] Poll `/api/attendance/meeting/:id` every 5 seconds
- [ ] Display live counter: "X / Y students marked"
- [ ] Show progress bar percentage
- [ ] "End Session" button with confirmation
- [ ] Display final report after session ends
- [ ] Option to export report as PDF/Excel

### Student Flow
- [ ] Listen for push notifications or poll for active sessions
- [ ] Display notification prompt: "Mark Attendance?"
- [ ] "Mark Now" button navigates to attendance screen
- [ ] Request GPS location
- [ ] Send POST request to `/api/attendance/student/mark`
- [ ] Display result screen (present/absent)
- [ ] Show distance from class location
- [ ] Show radius limit and compliance
- [ ] Display success/failure animation (Lottie)
- [ ] Show map view with both locations (optional)
- [ ] Save attendance record locally (offline support)

### History & Statistics
- [ ] GET `/api/attendance/student/history` with filters
- [ ] Display attendance history list
- [ ] Filter by date range
- [ ] Filter by course/offering
- [ ] Each record shows: date, time, course, status, distance
- [ ] GET `/api/attendance/stats/offering/:id`
- [ ] Display attendance percentage in progress circle
- [ ] Show stats cards: total, present, absent, late, avg distance
- [ ] Display breakdown chart

### Error Handling
- [ ] GPS permission denied → Show settings prompt
- [ ] Invalid meeting ID → Show error
- [ ] Student not enrolled → Show error
- [ ] Session not started → Show error
- [ ] Network errors → Show retry button
- [ ] Already marked → Show info message
- [ ] Server errors → Show generic error with retry

### UI/UX Polish
- [ ] Loading spinners/skeletons
- [ ] Success animations (Lottie)
- [ ] Error animations with red indicators
- [ ] Smooth screen transitions
- [ ] Bottom sheets for modals
- [ ] Pull-to-refresh for lists
- [ ] Empty states with helpful messages
- [ ] Proper error boundaries

### Offline Support
- [ ] Cache attendance locally
- [ ] Queue pending requests
- [ ] Show "Offline" indicator
- [ ] Retry when connection restored
- [ ] Sync cached data automatically

### Authentication
- [ ] Save Bearer token after login
- [ ] Add token to all API requests
- [ ] Handle token expiration (401 responses)
- [ ] Refresh token when needed
- [ ] Clear token on logout
- [ ] Redirect to login on authorization failure

### Performance
- [ ] Minimize API calls (use polling interval wisely)
- [ ] Cache data appropriately
- [ ] Lazy load lists with FlatList
- [ ] Optimize images
- [ ] Use memoization for components
- [ ] Debounce GPS requests

---

## 🔗 API Endpoints Summary

| Method | Endpoint | Auth | Role | Purpose |
|--------|----------|------|------|---------|
| POST | `/api/attendance/teacher/start` | ✓ | teacher | Start attendance session |
| POST | `/api/attendance/teacher/end` | ✓ | teacher | End session |
| POST | `/api/attendance/student/mark` | ✓ | student | Mark attendance |
| GET | `/api/attendance/meeting/:id` | ✓ | any | Get meeting attendance |
| GET | `/api/attendance/student/history` | ✓ | student | Get history |
| GET | `/api/attendance/stats/offering/:id` | ✓ | any | Get statistics |
| GET | `/api/teacher/me/timetable` | ✓ | teacher | Get meetings |

---

## 📚 Additional Resources

### Distance Calculation (Haversine Formula)

```javascript
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in meters
}
```

### Authentication Setup

```javascript
// Save token after login
await AsyncStorage.setItem('userToken', data.data.token);

// Add to all requests
const headers = {
  'Authorization': `Bearer ${userToken}`,
  'Content-Type': 'application/json'
};
```

---

## 🚀 Implementation Timeline

1. **Week 1:** GPS & authentication
2. **Week 2:** Teacher start session + live counter
3. **Week 3:** Student mark attendance + result display
4. **Week 4:** History & statistics
5. **Week 5:** Error handling & polish
6. **Week 6:** Testing & optimization

---

**Document Version:** 1.0  
**Last Updated:** 2026-06-14  
**Questions?** Contact Backend Team
