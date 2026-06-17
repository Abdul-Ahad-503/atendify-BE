const User = require('../models/User');
const Department = require('../models/Department');
const Program = require('../models/Program');
const mongoose = require('mongoose');
const { generateToken } = require('../utils/jwtUtils');
const { sendSuccess, sendError } = require('../utils/responseUtils');

const escapeRegex = (text = '') => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const resolveDepartmentRef = async (value) => {
  if (!value) return null;

  if (mongoose.Types.ObjectId.isValid(value)) {
    const byId = await Department.findById(value).select('_id');
    return byId?._id || null;
  }

  const input = String(value).trim();
  const byCodeOrName = await Department.findOne({
    $or: [
      { code: input.toUpperCase() },
      { name: new RegExp(`^${escapeRegex(input)}$`, 'i') }
    ]
  }).select('_id');

  return byCodeOrName?._id || null;
};

const resolveProgramRef = async (value, departmentObjectId = null) => {
  if (!value) return null;

  const baseQuery = {};
  if (departmentObjectId) {
    baseQuery.departmentId = departmentObjectId;
  }

  if (mongoose.Types.ObjectId.isValid(value)) {
    const byId = await Program.findOne({ _id: value, ...baseQuery }).select('_id departmentId');
    return byId || null;
  }

  const input = String(value).trim();

  // Strict match first
  let program = await Program.findOne({
    ...baseQuery,
    $or: [
      { code: input.toUpperCase() },
      { name: new RegExp(`^${escapeRegex(input)}$`, 'i') }
    ]
  }).select('_id departmentId');

  // Fuzzy fallback to support values like "CS" matching "BSCS"
  if (!program) {
    program = await Program.findOne({
      ...baseQuery,
      $or: [
        { code: new RegExp(escapeRegex(input), 'i') },
        { name: new RegExp(escapeRegex(input), 'i') }
      ]
    }).select('_id departmentId');
  }

  return program || null;
};

/**
 * @desc    Register a new user (Student/Teacher)
 * @route   POST /api/auth/register
 * @access  Public
 */
const register = async (req, res) => {
  console.log('📝 [AUTH] Register API called - Role:', req.body.role || 'student', '| Email:', req.body.email);
  try {
    const {
      name,
      email,
      password,
      role,
      studentId,
      rollNumber,
      employeeId,
      departmentId,
      programId,
      department,
      program,
      semester,
      section,
      shift
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return sendError(res, 400, 'User already exists with this email');
    }

    // Prepare user data
    const userData = {
      name,
      email,
      password,
      role: role || 'student'
    };

    // Add role-specific fields
    if (userData.role === 'student') {
      const normalizedStudentId = studentId || rollNumber;

      if (!normalizedStudentId) {
        return sendError(res, 400, 'studentId (or rollNumber) is required for student registration');
      }
      if (!programId) {
        return sendError(res, 400, 'programId is required for student registration');
      }
      if (!semester) {
        return sendError(res, 400, 'semester is required for student registration');
      }
      if (!section) {
        return sendError(res, 400, 'section is required for student registration');
      }

      // Check if studentId already exists
      const existingStudent = await User.findOne({ studentId: normalizedStudentId });
      if (existingStudent) {
        return sendError(res, 400, 'Student ID already exists');
      }

      if (rollNumber) {
        const existingRollNumber = await User.findOne({ rollNumber });
        if (existingRollNumber) {
          return sendError(res, 400, 'Roll number already exists');
        }
      }

      const resolvedDepartmentId = await resolveDepartmentRef(departmentId);
      const resolvedProgram = await resolveProgramRef(programId, resolvedDepartmentId);

      if (!resolvedProgram) {
        return sendError(res, 400, 'programId is invalid. Send a valid Program ObjectId, code (e.g., BSCS), or name.');
      }

      if (departmentId && !resolvedDepartmentId) {
        return sendError(res, 400, 'departmentId is invalid. Send a valid Department ObjectId, code (e.g., DCS), or name.');
      }

      userData.studentId = normalizedStudentId;
      userData.rollNumber = rollNumber || normalizedStudentId;
      userData.departmentId = resolvedDepartmentId || resolvedProgram.departmentId;
      userData.programId = resolvedProgram._id;
      userData.department = department;
      userData.program = program;
      userData.semester = semester;
      userData.section = section.toUpperCase();
      userData.shift = shift || 'MORNING';
    } else if (userData.role === 'teacher') {
      if (!employeeId) {
        return sendError(res, 400, 'Employee ID is required for teacher registration');
      }
      if (!departmentId) {
        return sendError(res, 400, 'departmentId is required for teacher registration');
      }

      // Check if employeeId already exists
      const existingTeacher = await User.findOne({ employeeId });
      if (existingTeacher) {
        return sendError(res, 400, 'Employee ID already exists');
      }

      const resolvedDepartmentId = await resolveDepartmentRef(departmentId);
      if (!resolvedDepartmentId) {
        return sendError(res, 400, 'departmentId is invalid. Send a valid Department ObjectId, code (e.g., DCS), or name.');
      }

      userData.employeeId = employeeId;
      userData.departmentId = resolvedDepartmentId;
      userData.department = department;
    }

    // Prevent direct admin registration
    if (userData.role === 'admin') {
      return sendError(res, 403, 'Cannot register as admin through this endpoint');
    }

    // Create user
    const user = await User.create(userData);

    // Generate token
    const token = generateToken(user._id, user.role);

    return sendSuccess(res, 201, 'User registered successfully', {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        studentId: user.studentId,
        rollNumber: user.rollNumber,
        employeeId: user.employeeId,
        departmentId: user.departmentId,
        programId: user.programId,
        semester: user.semester,
        section: user.section,
        shift: user.shift
      },
      token
    });

  } catch (error) {
    console.error('Register error:', error);
    if (error.name === 'ValidationError') {
      return sendError(res, 400, 'Validation failed', Object.values(error.errors).map(e => e.message));
    }
    return sendError(res, 500, 'Server error during registration', [error.message]);
  }
};

/**
 * @desc    Login user
 * @route   POST /api/auth/login
 * @access  Public
 */
const login = async (req, res) => {
  console.log('🔐 [AUTH] Login API called - Email:', req.body.email);
  try {
    const { email, password } = req.body;

    // Check if user exists (include password for comparison)
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return sendError(res, 401, 'Invalid credentials');
    }

    // Check if account is active
    if (!user.isActive) {
      return sendError(res, 403, 'Account is disabled. Contact admin.');
    }

    // Verify password
    const isPasswordMatch = await user.comparePassword(password);

    if (!isPasswordMatch) {
      return sendError(res, 401, 'Invalid credentials');
    }

    // Generate token
    const token = generateToken(user._id, user.role);

    return sendSuccess(res, 200, 'Login successful', {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        studentId: user.studentId,
        rollNumber: user.rollNumber,
        employeeId: user.employeeId,
        departmentId: user.departmentId,
        programId: user.programId,
        section: user.section,
        shift: user.shift,
        department: user.department,
        semester: user.semester,
        course: user.course,
        isActive: user.isActive
      },
      token
    });

  } catch (error) {
    console.error('Login error:', error);
    return sendError(res, 500, 'Server error during login', [error.message]);
  }
};

/**
 * @desc    Get current logged in user
 * @route   GET /api/auth/me
 * @access  Private
 */
const getMe = async (req, res) => {
  console.log('👤 [AUTH] Get Me API called - User ID:', req.user._id);
  try {
    const user = await User.findById(req.user._id);
    return sendSuccess(res, 200, 'User profile fetched successfully', { user });

  } catch (error) {
    console.error('GetMe error:', error);
    return sendError(res, 500, 'Server error', [error.message]);
  }
};

/**
 * @desc    Update user password
 * @route   PUT /api/auth/update-password
 * @access  Private
 */
const updatePassword = async (req, res) => {
  console.log('🔑 [AUTH] Update Password API called - User ID:', req.user._id);
  try {
    const { currentPassword, newPassword } = req.body;

    // Get user with password
    const user = await User.findById(req.user._id).select('+password');

    // Verify current password
    const isPasswordMatch = await user.comparePassword(currentPassword);

    if (!isPasswordMatch) {
      return sendError(res, 401, 'Current password is incorrect');
    }

    // Update password
    user.password = newPassword;
    await user.save();

    return sendSuccess(res, 200, 'Password updated successfully');

  } catch (error) {
    console.error('UpdatePassword error:', error);
    return sendError(res, 500, 'Server error', [error.message]);
  }
};

/**
 * @desc    Logout user (client-side token removal)
 * @route   POST /api/auth/logout
 * @access  Private
 */
const logout = async (req, res) => {
  const userId = req.user?._id;
  const userRole = req.user?.role;
  console.log('🚪 [AUTH] Logout API called - User ID:', userId);

  // If a teacher logs out, end all their active attendance sessions
  if (userRole === 'teacher') {
    try {
      const AttendancePayload = require('../models/AttendancePayload');
      const result = await AttendancePayload.updateMany(
        {
          teacherId: userId,
          'payload.status': { $ne: 'ended' }
        },
        {
          $set: {
            'payload.status': 'ended',
            'payload.endedAt': new Date()
          }
        }
      );
      if (result.modifiedCount > 0) {
        console.log(`✅ Ended ${result.modifiedCount} active session(s) for teacher ${userId}`);
      }
    } catch (err) {
      console.error('❌ Failed to end sessions on logout:', err.message);
    }
  }

  return sendSuccess(res, 200, 'Logged out successfully');
};

module.exports = {
  register,
  login,
  getMe,
  updatePassword,
  logout
};
