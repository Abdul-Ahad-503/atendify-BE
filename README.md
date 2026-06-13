# Atendify Backend - Automatic Attendance System

A comprehensive, production-ready backend system for mobile-based automatic attendance tracking using geolocation and time validation.

## 🎯 Project Overview

Atendify is a Final Year Project (FYP) that automates attendance marking using:
- **Geolocation validation** (Haversine formula)
- **Time-based validation** (class schedule)
- **Teacher session management**
- **Role-based access control** (Student, Teacher, Admin)

---

## 🛠 Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (JSON Web Tokens)
- **Password Hashing**: bcryptjs
- **Validation**: express-validator
- **Security**: helmet, cors, express-rate-limit

---

## 📁 Project Structure

```
Backend/
├── src/
│   ├── config/
│   │   └── database.js          # MongoDB connection
│   ├── controllers/
│   │   ├── authController.js    # Auth logic (login, register)
│   │   ├── userController.js    # User management (Admin)
│   │   ├── courseController.js  # Course & Timetable
│   │   ├── attendanceController.js  # Attendance logic ⭐
│   │   └── dashboardController.js   # Dashboard APIs
│   ├── models/
│   │   ├── User.js              # User schema
│   │   ├── Course.js            # Course schema
│   │   ├── Room.js              # Room with geolocation
│   │   ├── Timetable.js         # Class schedule
│   │   ├── TeacherSession.js    # Live sessions
│   │   └── Attendance.js        # Attendance records ⭐
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── userRoutes.js
│   │   ├── courseRoutes.js
│   │   ├── attendanceRoutes.js
│   │   └── dashboardRoutes.js
│   ├── middleware/
│   │   ├── authMiddleware.js    # JWT verification
│   │   ├── errorMiddleware.js   # Error handling
│   │   └── validationMiddleware.js
│   ├── utils/
│   │   ├── locationUtils.js     # Haversine formula ⭐
│   │   ├── jwtUtils.js          # Token generation
│   │   ├── timeUtils.js         # Time validation
│   │   └── responseUtils.js     # Response wrappers
│   ├── app.js                   # Express app setup
│   └── server.js                # Server entry point
├── .env.example                 # Environment variables template
├── .gitignore
├── package.json
└── README.md
```

---

## 🚀 Installation & Setup

### 1. Prerequisites
- Node.js (v16 or higher)
- MongoDB (local or cloud)
- npm or yarn

### 2. Install Dependencies
```bash
cd Backend
npm install
```

### 3. Environment Configuration
Create a `.env` file in the root directory:

```env
# Server
PORT=5000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/atendify

# JWT
JWT_SECRET=your_super_secret_jwt_key_change_this
JWT_EXPIRE=7d

# Attendance Configuration
MAX_DISTANCE_METERS=30
LATE_THRESHOLD_MINUTES=10

# Default Admin
ADMIN_EMAIL=admin@atendify.com
ADMIN_PASSWORD=Admin@12345
```

### 4. Start Server

**Development mode:**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

Server will run on: `http://localhost:5000`

---

## 📡 API Endpoints

### **Authentication** (`/api/auth`)

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/register` | Public | Register new user |
| POST | `/login` | Public | User login |
| GET | `/me` | Private | Get current user |
| PUT | `/update-password` | Private | Change password |
| POST | `/logout` | Private | Logout user |

### **User Management** (`/api/users`) - Admin Only

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Get all users (with filters) |
| GET | `/:id` | Get user by ID |
| POST | `/` | Create new user |
| PUT | `/:id` | Update user |
| DELETE | `/:id` | Delete user |
| POST | `/:userId/assign-course/:courseId` | Assign student to course |
| DELETE | `/:userId/remove-course/:courseId` | Remove student from course |
| POST | `/:userId/assign-teaching/:courseId` | Assign teacher to course |

### **Courses & Timetable** (`/api/courses`)

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/` | Admin | Create course |
| GET | `/` | All | Get all courses |
| GET | `/:id` | All | Get course by ID |
| PUT | `/:id` | Admin | Update course |
| DELETE | `/:id` | Admin | Delete course |
| POST | `/rooms` | Admin | Create room |
| GET | `/rooms` | All | Get all rooms |
| POST | `/timetable` | Admin | Create timetable entry |
| GET | `/timetable/my-schedule` | All | Get personal schedule |
| GET | `/timetable/week` | All | Get week schedule |
| GET | `/timetable` | Admin | Get all timetable |
| PUT | `/timetable/:id` | Admin | Update timetable |
| DELETE | `/timetable/:id` | Admin | Delete timetable |

### **Attendance** (`/api/attendance`) ⭐ CORE

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/session/start` | Teacher | Start class session |
| PUT | `/session/:id/end` | Teacher | End session |
| GET | `/session/active` | Teacher | Get active sessions |
| GET | `/session/:id/details` | Teacher | Get session attendance |
| POST | `/mark` | Student | Mark attendance ⭐⭐ |
| GET | `/my-attendance` | Student | Get attendance history |
| GET | `/my-attendance/summary` | Student | Get attendance summary |

### **Dashboard** (`/api/dashboard`)

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/student` | Student | Student dashboard data |
| GET | `/teacher` | Teacher | Teacher dashboard data |
| GET | `/admin` | Admin | Admin dashboard statistics |

---

## 🎓 How Attendance Logic Works

### **Step 1: Teacher Starts Session**

**Endpoint:** `POST /api/attendance/session/start`

**Request:**
```json
{
  "timetableId": "65abc...",
  "latitude": 33.6844,
  "longitude": 73.0479,
  "accuracy": 15
}
```

**Validations:**
1. ✅ Teacher is assigned to this class
2. ✅ Today matches timetable day
3. ✅ Current time within class time
4. ✅ Teacher is within MAX_DISTANCE_METERS of room

**Response:**
```json
{
  "success": true,
  "message": "Session started successfully",
  "data": {
    "session": {
      "_id": "65def...",
      "status": "active",
      "teacherLocation": {...},
      "course": {...},
      "room": {...}
    }
  }
}
```

---

### **Step 2: Student Marks Attendance** ⭐⭐ CRITICAL

**Endpoint:** `POST /api/attendance/mark`

**Request:**
```json
{
  "sessionId": "65def...",
  "latitude": 33.6845,
  "longitude": 73.0480,
  "accuracy": 20
}
```

**Validation Flow (All Must Pass):**

```
1. VALIDATE COORDINATES
   ├─ Check latitude (-90 to 90)
   └─ Check longitude (-180 to 180)

2. VALIDATE SESSION
   ├─ Session exists?
   ├─ Session is active?
   └─ Student enrolled in course?

3. VALIDATE TIME
   ├─ Current time >= startTime?
   └─ Current time <= endTime?

4. VALIDATE LOCATION (Haversine Formula)
   ├─ Calculate distance from ROOM
   │  └─ Must be <= MAX_DISTANCE_METERS (default: 30m)
   └─ Calculate distance from TEACHER
      └─ Must be <= MAX_DISTANCE_METERS

5. DETERMINE STATUS
   ├─ If minutesLate <= LATE_THRESHOLD_MINUTES (10) → "present"
   └─ If minutesLate > LATE_THRESHOLD_MINUTES → "late"

6. MARK ATTENDANCE ✅
```

**Success Response:**
```json
{
  "success": true,
  "message": "Attendance marked as present",
  "data": {
    "attendance": {
      "_id": "65xyz...",
      "status": "present",
      "distanceFromRoom": 12,
      "distanceFromTeacher": 8,
      "minutesLate": 2,
      "markedAt": "2026-01-27T10:02:00.000Z"
    }
  }
}
```

**Error Response (Out of Range):**
```json
{
  "success": false,
  "message": "You are not within the required range. Distance from room: 45m (max: 30m). Distance from teacher: 38m (max: 30m)."
}
```

---

### **Step 3: Teacher Ends Session**

**Endpoint:** `PUT /api/attendance/session/:id/end`

**What Happens:**
1. Marks all non-attending students as **"absent"**
2. Updates session status to **"completed"**
3. Calculates final attendance summary

---

## 🧮 Haversine Formula Explanation

**Purpose:** Calculate distance between two GPS coordinates

**File:** `src/utils/locationUtils.js`

**Formula:**
```javascript
a = sin²(Δφ/2) + cos(φ1) × cos(φ2) × sin²(Δλ/2)
c = 2 × atan2(√a, √(1−a))
distance = R × c  // R = Earth's radius (6,371,000 meters)
```

**Where:**
- φ = latitude in radians
- λ = longitude in radians
- Δφ = difference in latitudes
- Δλ = difference in longitudes

**Implementation:**
```javascript
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371000; // meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  
  return R * c; // Distance in meters
};
```

---

## 🗄 Database Schemas

### **User Schema**
```javascript
{
  name: String,
  email: String (unique),
  password: String (hashed),
  role: ['student', 'teacher', 'admin'],
  rollNumber: String (students),
  employeeId: String (teachers),
  department: String,
  semester: Number,
  enrolledCourses: [ObjectId],
  assignedCourses: [ObjectId],
  isActive: Boolean
}
```

### **Course Schema**
```javascript
{
  courseCode: String (unique),
  courseName: String,
  department: String,
  semester: Number,
  creditHours: Number,
  teacher: ObjectId,
  students: [ObjectId],
  isActive: Boolean
}
```

### **Room Schema**
```javascript
{
  roomName: String (unique),
  location: {
    latitude: Number,
    longitude: Number
  },
  capacity: Number,
  type: String
}
```

### **Timetable Schema**
```javascript
{
  course: ObjectId,
  teacher: ObjectId,
  room: ObjectId,
  dayOfWeek: String,
  startTime: String ("HH:mm"),
  endTime: String ("HH:mm"),
  duration: Number (calculated),
  academicYear: String,
  semester: Number
}
```

### **TeacherSession Schema**
```javascript
{
  teacher: ObjectId,
  course: ObjectId,
  timetable: ObjectId,
  room: ObjectId,
  sessionDate: Date,
  startTime: Date,
  endTime: Date,
  teacherLocation: {
    latitude: Number,
    longitude: Number,
    accuracy: Number,
    timestamp: Date
  },
  status: ['scheduled', 'active', 'completed', 'cancelled'],
  totalStudents: Number,
  presentCount: Number,
  absentCount: Number,
  lateCount: Number
}
```

### **Attendance Schema** ⭐
```javascript
{
  student: ObjectId,
  course: ObjectId,
  teacher: ObjectId,
  teacherSession: ObjectId,
  timetable: ObjectId,
  room: ObjectId,
  attendanceDate: Date,
  markedAt: Date,
  status: ['present', 'late', 'absent'],
  studentLocation: {
    latitude: Number,
    longitude: Number,
    accuracy: Number,
    timestamp: Date
  },
  distanceFromRoom: Number,
  distanceFromTeacher: Number,
  markingMethod: ['auto', 'manual', 'system'],
  minutesLate: Number,
  isValid: Boolean,
  validationNotes: String
}
```

---

## 🔐 Authentication Flow

1. **Register/Login** → Server generates JWT
2. **Client stores token** (localStorage or secure storage)
3. **Every request** → Client sends token in header:
   ```
   Authorization: Bearer <token>
   ```
4. **Server verifies** → Extracts user from token → Attaches to `req.user`

**Middleware:** `protect`, `authorize`, `isStudent`, `isTeacher`, `isAdmin`

---

## 🎨 Sample API Usage

### **1. Register Student**
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Ali Ahmed",
    "email": "ali@example.com",
    "password": "securepass123",
    "role": "student",
    "rollNumber": "20F-CS-101",
    "department": "Computer Science",
    "semester": 6
  }'
```

### **2. Login**
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "ali@example.com",
    "password": "securepass123"
  }'
```

### **3. Start Session (Teacher)**
```bash
curl -X POST http://localhost:5000/api/attendance/session/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "timetableId": "65abc123...",
    "latitude": 33.6844,
    "longitude": 73.0479,
    "accuracy": 15
  }'
```

### **4. Mark Attendance (Student)**
```bash
curl -X POST http://localhost:5000/api/attendance/mark \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "sessionId": "65def456...",
    "latitude": 33.6845,
    "longitude": 73.0480,
    "accuracy": 20
  }'
```

---

## 🔧 Configuration Options

### **Environment Variables**

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 5000 | Server port |
| `MONGODB_URI` | localhost | Database connection |
| `JWT_SECRET` | - | Secret for JWT signing |
| `JWT_EXPIRE` | 7d | Token expiration |
| `MAX_DISTANCE_METERS` | 30 | Max distance for attendance |
| `LATE_THRESHOLD_MINUTES` | 10 | Minutes before marked late |

---

## 🛡 Security Features

1. **JWT Authentication** - Stateless, secure
2. **Password Hashing** - bcryptjs with salt
3. **Helmet** - HTTP headers security
4. **CORS** - Cross-origin control
5. **Rate Limiting** - Prevent abuse (100 req/15min)
6. **Input Validation** - express-validator
7. **Role-based Access Control** - Middleware guards
8. **Error Handling** - Custom error middleware

---

## 📱 Mobile Integration Notes

### **Background Location Submission**
- Use **geofencing** triggers near campus
- Submit location when near classroom
- Use **WorkManager** (Android) / **Background Tasks** (iOS)
- Batch requests to save battery

### **Optimization Tips**
1. **Cache timetable** locally
2. **Check day/time** before API call
3. **Queue failed requests** for retry
4. **Use low-power location** updates

---

## 🧪 Testing

### **Manual Testing with Postman**
1. Import endpoints into Postman
2. Set environment variables (token, baseURL)
3. Test each role (student, teacher, admin)

### **Test Scenarios**
- ✅ Student marks attendance within range
- ❌ Student too far from room
- ❌ Student too far from teacher
- ❌ Attendance outside class time
- ❌ Duplicate attendance attempt
- ✅ Late arrival marking
- ✅ Absent marking when session ends

---

## 🎯 FYP Defense Points

### **Why This Approach?**
1. **No continuous tracking** - Privacy-friendly
2. **Dual validation** - Room + Teacher location
3. **Haversine formula** - Industry-standard for GPS
4. **Time-bound** - Prevents manipulation
5. **Scalable** - Can handle multiple concurrent sessions

### **Limitations & Solutions**
| Limitation | Solution |
|------------|----------|
| GPS spoofing | Add device fingerprinting, IP checks |
| Battery drain | Geofencing, scheduled tasks |
| Network issues | Offline queue with retry logic |
| Indoor GPS accuracy | Use WiFi triangulation as fallback |

### **Future Enhancements**
- Face recognition integration
- QR code backup method
- Analytics dashboard
- Parent notifications
- Biometric verification

---

## 📞 Support

For issues or questions:
- Check logs: `console.log` outputs
- Verify MongoDB connection
- Ensure JWT_SECRET is set
- Check firewall/port settings

---

## 📄 License

MIT License - Free for educational and commercial use

---

## 👨‍💻 Author

Atendify Team - Final Year Project 2026

---

**🎉 Your Atendify backend is ready for deployment and defense!**
