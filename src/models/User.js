const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    // Basic Information
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        "Please enter a valid email",
      ],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 6,
      select: false, // Don't return password by default
    },

    // Role-based access
    role: {
      type: String,
      enum: ["student", "teacher", "admin"],
      default: "student",
      index: true,
    },

    // References (preferred over legacy string fields)
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null,
      index: true,
    },
    programId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Program",
      default: null,
      index: true,
      // required for students (enforced via validation below)
    },

    // Student-specific fields (cohort identity)
    studentId: {
      type: String,
      trim: true,
      sparse: true,
      unique: true,
    },
    rollNumber: {
      type: String,
      trim: true,
      sparse: true,
      unique: true,
    },
    semester: {
      type: Number,
      min: 1,
      max: 8,
      default: null,
    },
    section: {
      // Keep this as A/B/C... (SECTION), not "Evening"
      type: String,
      trim: true,
      uppercase: true,
      match: [/^[A-Z]$/, "Section must be a single uppercase letter (A-Z)"],
      default: null,
    },
    shift: {
      // Use this for Morning/Evening instead of putting it into section
      type: String,
      enum: ["MORNING", "EVENING"],
      default: "MORNING",
    },

    // Teacher-specific fields
    employeeId: {
      type: String,
      trim: true,
      sparse: true,
      unique: true,
    },

    // Legacy fields (optional: keep temporarily for backward compatibility)
    // Do not use these in new code. Prefer departmentId/programId.
    department: {
      type: String,
      trim: true,
      default: null,
    },
    course: {
      type: String,
      trim: true,
      default: null,
    },

    // Account status
    isActive: {
      type: Boolean,
      default: true,
    },
    // In your User model, add:
    pushToken: { type: String, default: null },
  },
  {
    timestamps: true, // creates createdAt/updatedAt automatically
  },
);

// Compound index for fast student cohort lookups
// (You can also include termId in other collections like Offering; user doesn't need termId.)
userSchema.index({ programId: 1, semester: 1, section: 1, shift: 1 });

// ---- Role-based validation ----
userSchema.pre("validate", function (next) {
  // Student requirements
  if (this.role === "student") {
    if (!this.programId) {
      this.invalidate("programId", "programId is required for students");
    }
    if (!this.semester) {
      this.invalidate("semester", "semester is required for students");
    }
    if (!this.section) {
      this.invalidate("section", "section is required for students");
    }
  }

  // Teacher requirements (adjust if you want to require departmentId)
  if (this.role === "teacher") {
    if (!this.departmentId) {
      this.invalidate("departmentId", "departmentId is required for teachers");
    }
    // if you want employeeId required, uncomment:
    // if (!this.employeeId) this.invalidate("employeeId", "employeeId is required for teachers");
  }

  next();
});

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method to compare passwords
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Remove sensitive data when converting to JSON
userSchema.methods.toJSON = function () {
  const user = this.toObject();
  delete user.password;
  return user;
};

module.exports = mongoose.model("User", userSchema);