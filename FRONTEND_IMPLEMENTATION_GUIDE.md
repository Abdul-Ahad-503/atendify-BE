# Frontend Implementation Guide: Attendance System

**By:** Backend Developer  
**Date:** 2026-06-06  
**Project:** AttendX - Attendance Management System

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Teacher Side Implementation](#teacher-side-implementation)
3. [Student Side Implementation](#student-side-implementation)
4. [Authentication & Storage](#authentication--storage)
5. [Data Models](#data-models)
6. [Error Handling](#error-handling)
7. [Testing Scenarios](#testing-scenarios)
8. [Implementation Checklist](#implementation-checklist)

---

## 🎯 Overview

The attendance system has **two main flows**:

1. **Teacher Initiates** → Marks all enrolled students' location requirements
2. **Students Respond** → Mark their attendance if within acceptable radius (5-10m)

### Key Architecture

- Teachers use GPS to start attendance session
- Backend finds all enrolled students (by programId + semester + section)
- Students receive notification and mark attendance with GPS
- Distance calculated using Haversine formula
- Status: `present` if within radius, `absent` if outside
- Full attendance history stored for analytics

---

## 👨‍🏫 Teacher Side Implementation

### 1. Teacher Dashboard / Class List

**What to Display:**

- List of TODAY's meetings for the logged-in teacher
- Each meeting shows:
  - Course name and code
  - Time (HH:MM - HH:MM)
  - Room number
  - Enrolled students count
  - Day of week

**API Endpoint:**

```
GET /api/teacher/me/timetable
Auth: Bearer token
```

**Response Format:**

```json
{
  "success": true,
  "data": {
    "meetings": [
      {
        "meetingId": "65abc123def",
        "courseCode": "DCS-2001",
        "courseName": "Data Structures",
        "day": "Monday",
        "timeStart": "08:30",
        "timeEnd": "09:20",
        "roomNo": "R-403",
        "enrolledCount": 45,
        "section": "A",
        "semester": 4
      },
      {
        "meetingId": "65abc456ghi",
        "courseCode": "DCS-3002",
        "courseName": "Computer Networks",
        "day": "Monday",
        "timeStart": "10:00",
        "timeEnd": "11:00",
        "roomNo": "R-405",
        "enrolledCount": 38,
        "section": "B",
        "semester": 5
      }
    ]
  }
}
```

**Implementation:**

```javascript
const fetchTeacherMeetings = async () => {
  try {
    const response = await fetch("/api/teacher/me/timetable", {
      headers: {
        Authorization: `Bearer ${userToken}`,
      },
    });

    const data = await response.json();

    if (data.success) {
      setMeetings(data.data.meetings);
    } else {
      showError(data.message);
    }
  } catch (error) {
    showError(`Error: ${error.message}`);
  }
};
```

---

### 2. Start Attendance Session

**When Teacher Clicks "Mark Attendance" Button:**

#### Step 1: Request GPS Permission

```javascript
import * as Location from "expo-location";

const getTeacherLocation = async () => {
  try {
    // Request permission
    let { status } = await Location.requestForegroundPermissionsAsync();

    if (status !== "granted") {
      showError("GPS permission is required to mark attendance");
      return null;
    }

    // Get current location with high accuracy
    let location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy,
    };
  } catch (error) {
    showError(`GPS Error: ${error.message}`);
    return null;
  }
};
```

#### Step 2: Call Backend to Start Attendance Session

```javascript
const startAttendanceSession = async (meeting) => {
  try {
    setLoading(true);

    // Get GPS location
    const location = await getTeacherLocation();
    if (!location) {
      showError("Cannot get GPS location");
      return;
    }

    // Call backend API
    const response = await fetch("/api/attendance/teacher/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        meetingId: meeting.meetingId,
        location: {
          latitude: location.latitude,
          longitude: location.longitude,
        },
        details: {
          courseName: meeting.courseName,
          courseCode: meeting.courseCode,
          roomNumber: meeting.roomNo,
          section: meeting.section,
          semester: meeting.semester,
          enrolledCount: meeting.enrolledCount,
        },
        deviceInfo: getDeviceInfo(), // e.g., "iPhone 14 Pro"
      }),
    });

    const data = await response.json();

    if (!data.success) {
      showError(data.message);
      return;
    }

    // ✅ SUCCESS
    showSuccess(
      `Attendance started!\n${data.data.enrolledStudentsCount} students notified`,
    );

    // Store session data
    storeAttendanceSession({
      sessionId: data.data.sessionId,
      meetingId: meeting.meetingId,
      courseName: meeting.courseName,
      courseCode: meeting.courseCode,
      startTime: new Date(),
      enrolledCount: data.data.enrolledStudentsCount,
      teacherLocation: location,
    });

    // Navigate to live session screen
    navigation.navigate("AttendanceSessionScreen", {
      sessionId: data.data.sessionId,
      meetingId: meeting.meetingId,
      meeting: meeting,
    });
  } catch (error) {
    showError(`Failed to start attendance: ${error.message}`);
  } finally {
    setLoading(false);
  }
};
```

**Request Body:**

```json
{
  "meetingId": "65abc123def",
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

**Response:**

```json
{
  "success": true,
  "message": "Attendance session started successfully",
  "data": {
    "sessionId": "607f1f77bcf86cd799439011",
    "meetingId": "65abc123def",
    "enrolledStudentsCount": 45,
    "studentsToNotify": [
      {
        "studentId": "607f1f77bcf86cd799439012",
        "name": "Ali Khan",
        "email": "ali@example.com"
      }
    ],
    "teacherLocation": {
      "latitude": 24.8607,
      "longitude": 67.0011
    }
  }
}
```

---

### 3. Live Attendance Session Screen

**Display:**

- Course name and code
- Time and room
- Session status (Active)
- Real-time student count (how many have marked)
- Progress bar
- End Session button

**Implementation:**

```javascript
const AttendanceSessionScreen = ({ sessionId, meetingId, meeting }) => {
  const [attendanceCount, setAttendanceCount] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    // Fetch attendance count every 5 seconds
    const interval = setInterval(fetchAttendanceCount, 5000);

    // Initial fetch
    fetchAttendanceCount();

    return () => clearInterval(interval);
  }, [meetingId]);

  const fetchAttendanceCount = async () => {
    try {
      const response = await fetch(`/api/attendance/meeting/${meetingId}`, {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      const data = await response.json();
      if (data.success) {
        setAttendanceCount(data.data.summary.present);
      }
    } catch (error) {
      console.error("Error fetching attendance count:", error);
    }
  };

  const handleEndSession = async () => {
    Alert.alert(
      "End Attendance Session?",
      "Are you sure you want to end this session?",
      [
        {
          text: "Cancel",
          onPress: () => {},
          style: "cancel",
        },
        {
          text: "End Session",
          onPress: async () => {
            setLoading(true);
            try {
              // Just navigate - session ends on backend automatically
              navigation.navigate("AttendanceReportScreen", { meetingId });
              showSuccess("Attendance session ended");
            } finally {
              setLoading(false);
            }
          },
          style: "destructive",
        },
      ],
    );
  };

  const progressPercentage = (attendanceCount / meeting.enrolledCount) * 100;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.courseCode}>{meeting.courseCode}</Text>
        <Text style={styles.courseName}>{meeting.courseName}</Text>
        <Text style={styles.roomTime}>
          {meeting.roomNo} • {meeting.timeStart}-{meeting.timeEnd}
        </Text>
      </View>

      <View style={styles.statusSection}>
        <View style={styles.statusBadge}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>Session Active</Text>
        </View>
      </View>

      <View style={styles.statsSection}>
        <Text style={styles.statsLabel}>Students Marked Attendance</Text>
        <Text style={styles.statsNumber}>
          {attendanceCount} / {meeting.enrolledCount}
        </Text>

        <ProgressBar
          progress={progressPercentage / 100}
          color="#10B981"
          style={styles.progressBar}
        />

        <Text style={styles.progressText}>
          {Math.round(progressPercentage)}% Complete
        </Text>
      </View>

      <View style={styles.detailsSection}>
        <DetailCard label="Section" value={meeting.section} />
        <DetailCard label="Semester" value={meeting.semester} />
      </View>

      <View style={styles.buttonContainer}>
        <Button
          mode="contained"
          onPress={handleEndSession}
          style={styles.endButton}
          loading={loading}
        >
          End Session
        </Button>

        <Button
          mode="outlined"
          onPress={fetchAttendanceCount}
          loading={isRefreshing}
        >
          Refresh
        </Button>
      </View>
    </SafeAreaView>
  );
};
```

---

### 4. Teacher - Attendance Report

**After Session Ends:**

```javascript
const AttendanceReportScreen = ({ meetingId }) => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAttendanceReport();
  }, []);

  const fetchAttendanceReport = async () => {
    try {
      const response = await fetch(`/api/attendance/meeting/${meetingId}`, {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      const data = await response.json();

      if (data.success) {
        setReport({
          summary: data.data.summary,
          records: data.data.records,
        });
      }
    } catch (error) {
      showError("Failed to fetch attendance report");
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingScreen />;

  return (
    <ScrollView style={styles.container}>
      {/* Summary Cards */}
      <View style={styles.summarySection}>
        <SummaryCard
          label="Present"
          value={report.summary.present}
          color="#10B981"
          icon="check-circle"
        />
        <SummaryCard
          label="Absent"
          value={report.summary.absent}
          color="#EF4444"
          icon="x-circle"
        />
        <SummaryCard
          label="Total"
          value={report.summary.total}
          color="#6366F1"
          icon="users"
        />
      </View>

      {/* Average Distance */}
      <Card style={styles.averageCard}>
        <Card.Content>
          <Text style={styles.label}>Average Distance</Text>
          <Text style={styles.value}>{report.summary.avgDistance}m</Text>
        </Card.Content>
      </Card>

      {/* Detailed List */}
      <Text style={styles.listTitle}>Attendance Details</Text>
      <FlatList
        scrollEnabled={false}
        data={report.records}
        renderItem={({ item }) => (
          <View style={styles.studentItem}>
            <View style={styles.studentInfo}>
              <Text style={styles.studentName}>{item.studentId.name}</Text>
              <Text style={styles.rollNo}>{item.studentId.rollNumber}</Text>
            </View>

            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor:
                    item.status === "present" ? "#D1FAE5" : "#FEE2E2",
                },
              ]}
            >
              <Text
                style={[
                  styles.statusLabel,
                  { color: item.status === "present" ? "#047857" : "#991B1B" },
                ]}
              >
                {item.status === "present" ? "✓ Present" : "✗ Absent"}
              </Text>
              <Text style={styles.distance}>{item.distanceMeters}m</Text>
            </View>
          </View>
        )}
        keyExtractor={(item) => String(item._id)}
      />

      {/* Export Button */}
      <Button
        mode="contained"
        onPress={exportReport}
        style={styles.exportButton}
      >
        Export Report
      </Button>
    </ScrollView>
  );
};
```

---

## 👤 Student Side Implementation

### 1. Student Receives Notification

**Scenario:** Teacher starts attendance session, student gets notified

#### Option A: Push Notification (Recommended)

```javascript
import * as Notifications from "expo-notifications";

// Setup notification handler
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    };
  },
});

// Listen for notifications
const handleNotification = (notification) => {
  const data = notification.request.content.data;

  if (data.type === "ATTENDANCE_SESSION_STARTED") {
    // Show modal with attendance marking prompt
    showAttendanceModal({
      title: "Attendance Session Started",
      message: `Your teacher started attendance for ${data.courseName}`,
      meetingId: data.meetingId,
      courseCode: data.courseCode,
      courseName: data.courseName,
    });
  }
};

useEffect(() => {
  const subscription =
    Notifications.addNotificationResponseReceivedListener(handleNotification);

  return () => subscription.remove();
}, []);
```

#### Option B: Polling (If no push notifications available)

```javascript
// Check every 10 seconds for active attendance sessions
useEffect(() => {
  const checkActiveSessions = async () => {
    try {
      // This would be a new API endpoint to fetch active sessions
      const response = await fetch("/api/attendance/active-sessions", {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      const data = await response.json();

      if (data.data.activeSession) {
        showAttendanceModal(data.data.activeSession);
      }
    } catch (error) {
      console.error("Error checking sessions:", error);
    }
  };

  const interval = setInterval(checkActiveSessions, 10000);
  checkActiveSessions(); // Initial check

  return () => clearInterval(interval);
}, []);
```

---

### 2. Student Marks Attendance

**Main Flow:**

```javascript
const markAttendance = async (meetingId) => {
  try {
    setLoading(true);

    // Step 1: Get GPS Location
    const location = await getStudentLocation();

    if (!location) {
      showError("Cannot access GPS location");
      return;
    }

    // Step 2: Call Backend API
    const response = await fetch("/api/attendance/student/mark", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        meetingId: meetingId,
        location: {
          latitude: location.latitude,
          longitude: location.longitude,
        },
        radiusMeters: 10, // Can be configurable (5-10m)
        deviceInfo: getDeviceInfo(),
      }),
    });

    const data = await response.json();

    if (!data.success) {
      handleAttendanceError(data.message);
      return;
    }

    // ✅ SUCCESS - Store result
    const attendance = data.data;

    // Save locally
    saveLocalAttendance({
      meetingId: meetingId,
      attendanceId: attendance.attendanceId,
      status: attendance.status,
      distance: attendance.distance,
      markedAt: attendance.markedAt,
    });

    // Navigate to result screen
    navigation.navigate("AttendanceResultScreen", {
      attendance: attendance,
      meetingId: meetingId,
    });
  } catch (error) {
    showError(`Error: ${error.message}`);
  } finally {
    setLoading(false);
  }
};

// Get Student Location
const getStudentLocation = async () => {
  try {
    let { status } = await Location.requestForegroundPermissionsAsync();

    if (status !== "granted") {
      showError("GPS permission is required. Please enable it in Settings.");
      return null;
    }

    let location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
      timeout: 15000, // 15 seconds timeout
    });

    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy,
    };
  } catch (error) {
    if (error.code === "LOCATION_TIMEOUT") {
      showError(
        "GPS timeout. Please try again in a location with better signal.",
      );
    } else {
      showError(`GPS Error: ${error.message}`);
    }
    return null;
  }
};
```

**Request Body:**

```json
{
  "meetingId": "65abc123def",
  "location": {
    "latitude": 24.8608,
    "longitude": 67.0012
  },
  "radiusMeters": 10,
  "deviceInfo": "Samsung Galaxy S21"
}
```

**Success Response:**

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
    "markedAt": "2026-06-06T10:30:45Z"
  }
}
```

---

### 3. Show Attendance Result

**Display:**

- Success/Failure animation
- Status badge (Present/Absent)
- Distance from class
- Radius limit
- Map view (optional)

```javascript
const AttendanceResultScreen = ({ attendance, meetingId }) => {
  const isPresentStatus = attendance.status === "present";

  const displayDistance = () => {
    const distance = parseInt(attendance.distance);
    const radius = attendance.radiusMeters;

    if (distance <= radius) {
      return {
        text: `✓ Within Range`,
        color: "#10B981",
        subtext: `${distance}m / ${radius}m`,
      };
    } else {
      return {
        text: `✗ Outside Range`,
        color: "#EF4444",
        subtext: `${distance}m / ${radius}m (${distance - radius}m too far)`,
      };
    }
  };

  const distanceInfo = displayDistance();

  return (
    <SafeAreaView style={styles.container}>
      {/* Large Animation */}
      <LottieView
        source={
          isPresentStatus ? require("./success.json") : require("./fail.json")
        }
        autoPlay
        loop={false}
        style={styles.animation}
      />

      {/* Main Status */}
      <View
        style={[
          styles.statusContainer,
          {
            backgroundColor: isPresentStatus ? "#D1FAE5" : "#FEE2E2",
          },
        ]}
      >
        <Text
          style={[
            styles.statusText,
            {
              color: isPresentStatus ? "#047857" : "#991B1B",
            },
          ]}
        >
          {isPresentStatus ? "✓ MARKED PRESENT" : "✗ MARKED ABSENT"}
        </Text>
      </View>

      {/* Distance Information */}
      <Card style={styles.distanceCard}>
        <Card.Content>
          <View style={styles.distanceRow}>
            <View>
              <Text style={styles.distanceLabel}>Distance from Class</Text>
              <Text
                style={[styles.distanceValue, { color: distanceInfo.color }]}
              >
                {attendance.distance}
              </Text>
              <Text style={styles.distanceSubtext}>{distanceInfo.subtext}</Text>
            </View>

            <Icon
              name={isPresentStatus ? "check-circle" : "alert-circle"}
              size={60}
              color={distanceInfo.color}
            />
          </View>
        </Card.Content>
      </Card>

      {/* Timestamp */}
      <Card style={styles.timestampCard}>
        <Card.Content>
          <Text style={styles.label}>Marked At</Text>
          <Text style={styles.timestamp}>
            {formatDateTime(attendance.markedAt)}
          </Text>
        </Card.Content>
      </Card>

      {/* Map View (Optional - Show locations) */}
      <View style={styles.mapSection}>
        <MapView
          style={styles.map}
          initialRegion={{
            latitude: attendance.studentLocation?.latitude || 24.86,
            longitude: attendance.studentLocation?.longitude || 67.0,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
        >
          {/* Student Location */}
          <Marker
            coordinate={{
              latitude: attendance.studentLocation?.latitude,
              longitude: attendance.studentLocation?.longitude,
            }}
            title="Your Location"
            pinColor="#3B82F6"
          />

          {/* Class Location */}
          <Marker
            coordinate={{
              latitude: attendance.classLocation?.latitude,
              longitude: attendance.classLocation?.longitude,
            }}
            title="Class Location"
            pinColor="#EF4444"
          />

          {/* Radius Circle */}
          <Circle
            center={{
              latitude: attendance.classLocation?.latitude,
              longitude: attendance.classLocation?.longitude,
            }}
            radius={attendance.radiusMeters}
            strokeColor="rgba(239, 68, 68, 0.5)"
            fillColor="rgba(239, 68, 68, 0.1)"
            strokeWidth={2}
          />
        </MapView>
      </View>

      {/* Action Button */}
      <Button
        mode="contained"
        onPress={() => navigation.navigate("HomeScreen")}
        style={styles.button}
      >
        Back to Home
      </Button>
    </SafeAreaView>
  );
};
```

---

### 4. Handle Error Cases

**Error Scenario 1: GPS Permission Denied**

```javascript
if (error.code === "PERMISSION_DENIED") {
  Alert.alert(
    "GPS Permission Required",
    "Please enable GPS in settings to mark attendance",
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Open Settings",
        onPress: () => Linking.openSettings(),
      },
    ],
  );
}
```

**Error Scenario 2: Student Not Enrolled**

```javascript
if (data.message.includes("not enrolled")) {
  showError("You are not enrolled in this course");
  navigation.navigate("HomeScreen");
}
```

**Error Scenario 3: Teacher Hasn't Started Session**

```javascript
if (data.message.includes("not started")) {
  showError("Teacher has not started attendance session yet");
  // Optionally show retry button
}
```

**Error Scenario 4: Network Error**

```javascript
if (error.message.includes("Network")) {
  showError("Network error. Please check your connection and try again.");
  // Offer to retry
}
```

**Error Scenario 5: Already Marked**

```javascript
if (data.message.includes("already marked")) {
  showInfo("You have already marked attendance for this class");
}
```

**Complete Error Handler:**

```javascript
const handleAttendanceError = (message) => {
  if (message.includes("not enrolled")) {
    showError("You are not enrolled in this course");
    navigation.navigate("HomeScreen");
  } else if (message.includes("not started")) {
    showError("Teacher has not started attendance session yet");
  } else if (message.includes("already marked")) {
    showInfo("You have already marked attendance for this class");
  } else if (message.includes("GPS")) {
    showError("GPS location is required");
  } else {
    showError(message);
  }
};
```

---

### 5. Student Views Attendance History

**API Endpoint:**

```
GET /api/attendance/student/history?termId=xxx&offeringId=yyy&startDate=2026-06-01&endDate=2026-06-30
Auth: Bearer token
```

**Implementation:**

```javascript
const StudentAttendanceHistoryScreen = () => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    termId: null,
    offeringId: null,
    startDate: null,
    endDate: null,
  });

  useEffect(() => {
    loadHistory();
  }, [filters]);

  const loadHistory = async () => {
    try {
      setLoading(true);

      const queryParams = new URLSearchParams();
      if (filters.termId) queryParams.append("termId", filters.termId);
      if (filters.offeringId)
        queryParams.append("offeringId", filters.offeringId);
      if (filters.startDate) queryParams.append("startDate", filters.startDate);
      if (filters.endDate) queryParams.append("endDate", filters.endDate);

      const response = await fetch(
        `/api/attendance/student/history?${queryParams.toString()}`,
        {
          headers: { Authorization: `Bearer ${userToken}` },
        },
      );

      const data = await response.json();

      if (data.success) {
        // Transform API response to UI format
        const formattedHistory = data.data.records.map((record) => ({
          attendanceId: record._id,
          date: formatDate(record.markedAt),
          time: `${record.meetingId.timeStart}-${record.meetingId.timeEnd}`,
          courseName: record.offeringId?.courseId?.name || "N/A",
          courseCode: record.offeringId?.courseId?.code || "N/A",
          status: record.status,
          distance: `${record.distanceMeters}m`,
          room: record.meetingId.roomNo,
          withinRadius: record.withinRadius,
        }));

        setHistory(formattedHistory);
      } else {
        showError(data.message);
      }
    } catch (error) {
      showError("Failed to load attendance history");
    } finally {
      setLoading(false);
    }
  };

  const handleDateRangeFilter = (startDate, endDate) => {
    setFilters((prev) => ({
      ...prev,
      startDate: formatDateForAPI(startDate),
      endDate: formatDateForAPI(endDate),
    }));
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Filter Section */}
      <View style={styles.filterSection}>
        <Button onPress={() => showDatePicker()} mode="outlined">
          Select Date Range
        </Button>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} />
      ) : (
        <FlatList
          data={history}
          renderItem={({ item }) => (
            <HistoryCard
              item={item}
              onPress={() => navigateTo("AttendanceDetailScreen", item)}
            />
          )}
          keyExtractor={(item) => item.attendanceId}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={
            <EmptyState message="No attendance records found" />
          }
        />
      )}
    </SafeAreaView>
  );
};

// History Card Component
const HistoryCard = ({ item, onPress }) => {
  const isPresent = item.status === "present";

  return (
    <Card style={styles.card} onPress={onPress}>
      <Card.Content>
        <View style={styles.cardContent}>
          <View style={styles.leftContent}>
            <Text style={styles.courseCode}>{item.courseCode}</Text>
            <Text style={styles.courseName}>{item.courseName}</Text>
            <Text style={styles.meta}>
              {item.date} • {item.time}
            </Text>
            <Text style={styles.room}>Room: {item.room}</Text>
          </View>

          <View
            style={[
              styles.statusBadge,
              { backgroundColor: isPresent ? "#D1FAE5" : "#FEE2E2" },
            ]}
          >
            <Text
              style={[
                styles.statusLabel,
                { color: isPresent ? "#047857" : "#991B1B" },
              ]}
            >
              {isPresent ? "✓ Present" : "✗ Absent"}
            </Text>
            <Text style={styles.distance}>{item.distance}</Text>
          </View>
        </View>
      </Card.Content>
    </Card>
  );
};
```

---

### 6. Student Views Attendance Statistics

**API Endpoint:**

```
GET /api/attendance/stats/offering/:offeringId
Auth: Bearer token
```

**Response:**

```json
{
  "success": true,
  "data": {
    "totalStudents": 45,
    "stats": [
      {
        "studentId": "607f1f77bcf86cd799439012",
        "student": {
          "_id": "607f1f77bcf86cd799439012",
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
    ]
  }
}
```

**Implementation:**

```javascript
const AttendanceStatsScreen = ({ offeringId }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, [offeringId]);

  const fetchStats = async () => {
    try {
      const response = await fetch(
        `/api/attendance/stats/offering/${offeringId}`,
        {
          headers: { Authorization: `Bearer ${userToken}` },
        },
      );

      const data = await response.json();

      if (data.success) {
        // Get current student's stats
        const myStats = data.data.stats[0];
        setStats(myStats);
      }
    } catch (error) {
      showError("Failed to fetch statistics");
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingScreen />;
  if (!stats) return <EmptyState message="No statistics available" />;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        {/* Attendance Percentage Circle */}
        <View style={styles.percentageSection}>
          <ProgressCircle
            percent={stats.attendancePercentage || 0}
            radius={80}
            borderWidth={8}
            color="#10B981"
            shadowColor="#999"
            textStyle={styles.percentageText}
          >
            <Text style={styles.percentageLabel}>
              {stats.attendancePercentage?.toFixed(1)}%
            </Text>
          </ProgressCircle>
          <Text style={styles.percentageDescription}>Attendance Rate</Text>
        </View>

        {/* Statistics Grid */}
        <View style={styles.statsGrid}>
          <StatCard
            label="Total Classes"
            value={stats.totalClasses}
            icon="calendar"
            color="#6366F1"
          />
          <StatCard
            label="Present"
            value={stats.presentCount}
            icon="check-circle"
            color="#10B981"
          />
          <StatCard
            label="Absent"
            value={stats.absentCount}
            icon="x-circle"
            color="#EF4444"
          />
          <StatCard
            label="Late"
            value={stats.lateCount}
            icon="clock"
            color="#F59E0B"
          />
        </View>

        {/* Average Distance */}
        <Card style={styles.averageCard}>
          <Card.Content>
            <Text style={styles.label}>Average Distance</Text>
            <Text style={styles.value}>
              {stats.avgDistance?.toFixed(2) || 0}m
            </Text>
            <Text style={styles.subtext}>
              How far you typically mark attendance from class
            </Text>
          </Card.Content>
        </Card>

        {/* Breakdown */}
        <Card style={styles.breakdownCard}>
          <Card.Content>
            <Text style={styles.label}>Attendance Breakdown</Text>

            <View style={styles.row}>
              <Text style={styles.label}>Present</Text>
              <Text style={[styles.value, { color: "#10B981" }]}>
                {stats.presentCount}/{stats.totalClasses}
              </Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Absent</Text>
              <Text style={[styles.value, { color: "#EF4444" }]}>
                {stats.absentCount}/{stats.totalClasses}
              </Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Late</Text>
              <Text style={[styles.value, { color: "#F59E0B" }]}>
                {stats.lateCount}/{stats.totalClasses}
              </Text>
            </View>
          </Card.Content>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
};

// Stat Card Component
const StatCard = ({ label, value, icon, color }) => {
  return (
    <Card style={[styles.statCard, { borderLeftColor: color }]}>
      <Card.Content>
        <Icon name={icon} size={32} color={color} />
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </Card.Content>
    </Card>
  );
};
```

---

## 🔐 Authentication & Storage

### Save Token After Login

```javascript
const loginUser = async (email, password) => {
  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (data.success) {
      // Save token
      await AsyncStorage.setItem("userToken", data.data.token);
      await AsyncStorage.setItem("user", JSON.stringify(data.data.user));

      // Set default header
      setAuthToken(data.data.token);

      // Navigate based on role
      if (data.data.user.role === "teacher") {
        navigation.navigate("TeacherHome");
      } else if (data.data.user.role === "student") {
        navigation.navigate("StudentHome");
      }
    } else {
      showError(data.message);
    }
  } catch (error) {
    showError(`Login failed: ${error.message}`);
  }
};
```

### Add Token to All Requests

**Using Axios Interceptor:**

```javascript
import axios from "axios";

const setAuthToken = (token) => {
  if (token) {
    axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  } else {
    delete axios.defaults.headers.common["Authorization"];
  }
};

// On app start
AsyncStorage.getItem("userToken").then((token) => {
  if (token) {
    setAuthToken(token);
  }
});
```

**Using Fetch Interceptor:**

```javascript
const fetchWithAuth = async (url, options = {}) => {
  const token = await AsyncStorage.getItem("userToken");

  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: token ? `Bearer ${token}` : "",
    },
  });
};
```

---

## 🗂️ Data Models

### Attendance Store (Redux/Zustand)

```javascript
const attendanceStore = {
  // Current session
  currentSession: {
    sessionId: string, // Unique session identifier
    meetingId: string, // Meeting reference
    status: "active" | "completed",
    studentCount: number, // Total enrolled
    markedCount: number, // Marked so far
    startTime: timestamp,
    teacherLocation: {
      latitude: number,
      longitude: number,
    },
  },

  // Last marked attendance
  lastAttendance: {
    attendanceId: string,
    meetingId: string,
    status: "present" | "absent" | "late",
    distance: number,
    withinRadius: boolean,
    markedAt: timestamp,
  },

  // Cached history
  history: [
    {
      attendanceId: string,
      meetingId: string,
      courseCode: string,
      courseName: string,
      date: string,
      time: string,
      status: string,
      distance: number,
      room: string,
    },
  ],

  // Statistics
  stats: {
    totalClasses: number,
    presentCount: number,
    absentCount: number,
    lateCount: number,
    attendancePercentage: number,
    avgDistance: number,
  },
};
```

### Local Storage Keys

```javascript
const STORAGE_KEYS = {
  USER_TOKEN: "userToken",
  USER_DATA: "userData",
  ATTENDANCE_HISTORY: "attendanceHistory",
  ACTIVE_SESSION: "activeSession",
  LAST_ATTENDANCE: "lastAttendance",
  PENDING_ATTENDANCE: "pendingAttendance", // For offline
};
```

---

## ✅ Implementation Checklist

### GPS & Location Services

- [ ] Request location permissions (iOS & Android)
- [ ] Handle permission denied scenario
- [ ] Get high-accuracy GPS coordinates
- [ ] Handle GPS timeout (>15 seconds)
- [ ] Validate coordinates are not null

### Teacher Flow

- [ ] Fetch today's meetings from API
- [ ] Display meeting list with enrolled count
- [ ] Start attendance button with GPS
- [ ] Send start session API request
- [ ] Show live session with student count
- [ ] Real-time refresh every 5 seconds
- [ ] End session functionality
- [ ] Display attendance report after session
- [ ] Export attendance report (optional)

### Student Flow

- [ ] Listen for notifications (push or polling)
- [ ] Display notification prompt
- [ ] Mark attendance button with GPS
- [ ] Send mark attendance API request
- [ ] Display attendance result (present/absent)
- [ ] Show distance and radius info
- [ ] Map visualization (optional)
- [ ] Back to home navigation

### History & Statistics

- [ ] View attendance history list
- [ ] Filter by date range
- [ ] Filter by course
- [ ] Display attendance status and distance
- [ ] View attendance percentage
- [ ] Display statistics dashboard
- [ ] Show breakdown (present/absent/late)
- [ ] Show average distance

### Error Handling

- [ ] GPS permission denied
- [ ] Network errors
- [ ] Timeout errors
- [ ] Student not enrolled
- [ ] Session not started
- [ ] Already marked attendance
- [ ] Invalid GPS coordinates
- [ ] Server errors (500, 503, etc.)

### Offline Support

- [ ] Cache attendance locally
- [ ] Retry when online
- [ ] Show offline indicator
- [ ] Queue pending requests

### UI/UX Polish

- [ ] Loading states with spinners
- [ ] Success animations (Lottie)
- [ ] Error animations
- [ ] Smooth transitions
- [ ] Bottom sheets for modals
- [ ] Pull-to-refresh
- [ ] Empty states
- [ ] Skeleton loaders

### Authentication

- [ ] Login flow
- [ ] Save token securely
- [ ] Token refresh mechanism
- [ ] Logout functionality
- [ ] Session timeout handling

---

## 🧪 Testing Scenarios

### Scenario 1: Happy Path (Teacher)

```
1. Teacher opens app
2. Sees today's meetings (Data Structures - 08:30-09:20)
3. Clicks "Mark Attendance" button
4. GPS captures location (24.8607, 67.0011)
5. Backend returns: "45 students notified"
6. Shows live session screen
7. Students start marking attendance
8. Counter increases: 1/45 → 2/45 → ... → 45/45
9. Teacher clicks "End Session"
10. Sees attendance report: 45 present, 0 absent
✅ SUCCESS
```

### Scenario 2: Happy Path (Student)

```
1. Student receives notification: "Attendance started"
2. Taps "Mark Now"
3. GPS captures location (24.8608, 67.0012)
4. Distance calculated: 8m
5. Status: "Present" (within 10m radius)
6. Shows ✅ animation
7. Taps "Back Home"
✅ SUCCESS
```

### Scenario 3: Student Outside Radius

```
1. Student is 45m away from class
2. Marks attendance
3. Distance: 45m
4. Status: "Absent" (outside 10m radius)
5. Shows ❌ animation with distance
✅ WORKING AS EXPECTED
```

### Scenario 4: GPS Permission Denied

```
1. Student clicks "Mark Attendance"
2. GPS permission prompt appears
3. Student taps "Don't Allow"
4. Error shows: "Please enable GPS in settings"
5. "Open Settings" button available
✅ ERROR HANDLED
```

### Scenario 5: Teacher Not Started Session

```
1. Student clicks "Mark Attendance" before teacher starts
2. Error: "Teacher has not started session yet"
3. Option to retry shown
✅ ERROR HANDLED
```

### Scenario 6: Network Offline

```
1. Attendance request made without internet
2. Error: "Network error"
3. Saved to pending queue locally
4. When online, automatically retry
✅ OFFLINE SUPPORT
```

### Scenario 7: View History

```
1. Student navigates to History
2. Shows all past attendance records
3. Can filter by date range or course
4. Each record shows: date, time, status, distance, room
✅ SUCCESS
```

### Scenario 8: View Statistics

```
1. Student views stats for Data Structures course
2. Shows: 91.67% attendance (22/24 classes)
3. Shows: 22 present, 1 absent, 1 late
4. Shows: Average distance 5.2m
5. Progress circle visualization
✅ SUCCESS
```

---

## 📝 API Reference Summary

| Method | Endpoint                                     | Auth | Role    | Description                    |
| ------ | -------------------------------------------- | ---- | ------- | ------------------------------ |
| POST   | `/api/attendance/teacher/start`              | ✓    | teacher | Start attendance session       |
| POST   | `/api/attendance/student/mark`               | ✓    | student | Mark student attendance        |
| GET    | `/api/attendance/meeting/:meetingId`         | ✓    | any     | Get attendance for meeting     |
| GET    | `/api/attendance/student/history`            | ✓    | student | Get student attendance history |
| GET    | `/api/attendance/stats/offering/:offeringId` | ✓    | any     | Get course attendance stats    |
| GET    | `/api/teacher/me/timetable`                  | ✓    | teacher | Get teacher's meetings         |

---

## 🚀 Next Steps (Future Enhancements)

1. **Push Notifications** - Integrate Firebase Cloud Messaging
2. **WebSocket Real-time** - Live attendance count updates
3. **Excuse/Late Tracking** - Add excuse submission flow
4. **Room Coordinates** - Store GPS coordinates in Room/Building model
5. **Attendance Rules** - Auto-mark late after 5 minutes
6. **Attendance Export** - Export to PDF/Excel
7. **Multi-language** - Support multiple languages
8. **Dark Mode** - Dark theme support
9. **Biometric Auth** - Fingerprint/Face ID for faster login
10. **Analytics Dashboard** - Advanced attendance analytics for admins

---

**End of Frontend Implementation Guide**

_Questions? Contact Backend Team_
