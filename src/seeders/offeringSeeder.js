/**
 * Offering & Meeting Seeder
 * 
 * Creates sample CourseOfferings and Meetings so dashboard/timetable shows data.
 * Run AFTER timetableSeeder.js:
 *   1. node src/seeders/timetableSeeder.js
 *   2. node src/seeders/offeringSeeder.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Department = require('../models/Department');
const Program = require('../models/Program');
const Term = require('../models/Term');
const Course = require('../models/Course');
const CourseOffering = require('../models/CourseOffering');
const Meeting = require('../models/Meeting');
const User = require('../models/User');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

const timeToMinutes = (timeStr) => {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
};

const seedOfferings = async () => {
  try {
    console.log('\n🌱 Starting offering + meeting seeding...\n');

    // 1. Verify base data exists
    const department = await Department.findOne({ code: 'CS' });
    if (!department) {
      console.error('❌ No departments found. Run timetableSeeder.js first.');
      process.exit(1);
    }

    const program = await Program.findOne({ code: 'BSCS' });
    if (!program) {
      console.error('❌ No programs found. Run timetableSeeder.js first.');
      process.exit(1);
    }

    const term = await Term.findOne({ isActive: true });
    if (!term) {
      console.error('❌ No active term found. Run timetableSeeder.js first.');
      process.exit(1);
    }

    console.log(`📋 Using department: ${department.name} (${department.code})`);
    console.log(`📋 Using program: ${program.name} (${program.code})`);
    console.log(`📋 Using term: ${term.name}`);

    // 2. Create a sample teacher if none exists
    let teacher = await User.findOne({ email: 'teacher@test.com' });
    if (!teacher) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('123456', salt);
      teacher = await User.create({
        name: 'Dr. John Smith',
        email: 'teacher@test.com',
        password: hashedPassword,
        role: 'teacher',
        departmentId: department._id,
        employeeId: 'T-001',
        isActive: true,
      });
      console.log('✅ Created teacher: teacher@test.com / 123456');
    } else {
      console.log('✅ Teacher already exists: teacher@test.com');
    }

    // 3. Create a sample student if none exists
    let student = await User.findOne({ email: 'student@test.com' });
    if (!student) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('123456', salt);
      student = await User.create({
        name: 'Ali Khan',
        email: 'student@test.com',
        password: hashedPassword,
        role: 'student',
        programId: program._id,
        departmentId: department._id,
        rollNumber: 'BSCS-001',
        studentId: 'BSCS-001',
        semester: 1,
        section: 'A',
        shift: 'MORNING',
        isActive: true,
      });
      console.log('✅ Created student: student@test.com / 123456');
    } else {
      console.log('✅ Student already exists: student@test.com');
    }

    // 4. Find courses to use
    const courses = await Course.find({ programId: program._id }).limit(4);
    if (courses.length === 0) {
      // Fallback to any course
      const anyCourse = await Course.findOne();
      if (!anyCourse) {
        console.error('❌ No courses found. Run timetableSeeder.js first.');
        process.exit(1);
      }
      courses.push(anyCourse);
    }

    console.log(`📚 Found ${courses.length} courses for offerings`);

    // 5. Define time slots
    const slots = [
      { timeStart: '08:30', timeEnd: '09:20' },
      { timeStart: '09:30', timeEnd: '10:20' },
      { timeStart: '10:30', timeEnd: '11:20' },
      { timeStart: '11:30', timeEnd: '12:20' },
    ];

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const today = days[new Date().getDay() === 0 ? 0 : new Date().getDay() - 1] || 'Monday';

    // 6. Create CourseOfferings + Meetings
    let offeringCount = 0;
    let meetingCount = 0;

    for (let i = 0; i < courses.length; i++) {
      const course = courses[i];
      const slot = slots[i % slots.length];

      // Check if offering already exists
      const existing = await CourseOffering.findOne({
        termId: term._id,
        programId: program._id,
        courseId: course._id,
        semester: 1,
        section: 'A',
        teacherId: teacher._id,
      });

      if (existing) {
        console.log(`⏭️  Offering already exists for ${course.code}`);
        continue;
      }

      // Create offering
      const offering = await CourseOffering.create({
        termId: term._id,
        departmentId: department._id,
        programId: program._id,
        semester: 1,
        section: 'A',
        courseId: course._id,
        teacherId: teacher._id,
        group: 'MAIN',
        status: 'published',
      });
      offeringCount++;

      // Create meeting on today's day
      const meeting = await Meeting.create({
        offeringId: offering._id,
        termId: term._id,
        teacherId: teacher._id,
        day: today,
        slot: i + 1,
        roomNo: `LAB-${100 + i}`,
        timeStart: slot.timeStart,
        timeEnd: slot.timeEnd,
        startMinutes: timeToMinutes(slot.timeStart),
        endMinutes: timeToMinutes(slot.timeEnd),
      });
      meetingCount++;

      console.log(`   ✅ ${course.code} - ${today} ${slot.timeStart}-${slot.timeEnd} (Room LAB-${100 + i})`);
    }

    console.log(`\n📊 Summary:`);
    console.log(`   CourseOfferings created: ${offeringCount}`);
    console.log(`   Meetings created: ${meetingCount}`);
    console.log(`   Day: ${today}`);
    console.log(`\n✅ Seeding completed!`);
    console.log(`\n💡 Login credentials:`);
    console.log(`   Teacher: teacher@test.com / 123456`);
    console.log(`   Student: student@test.com / 123456`);

  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    throw error;
  }
};

const run = async () => {
  await connectDB();
  await seedOfferings();
  await mongoose.connection.close();
  console.log('🔌 Database connection closed');
  process.exit(0);
};

run().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
