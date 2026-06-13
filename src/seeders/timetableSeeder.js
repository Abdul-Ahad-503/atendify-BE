/**
 * Database Seeder for Timetable System
 * 
 * Run with: node src/seeders/timetableSeeder.js
 * 
 * This will populate:
 * - Departments
 * - Programs
 * - Terms
 * - Sample Courses
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Department = require('../models/Department');
const Program = require('../models/Program');
const Term = require('../models/Term');
const Course = require('../models/Course');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected for seeding');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

const seedData = async () => {
  try {
    console.log('\n🌱 Starting database seeding...\n');

    // Clear existing data (CAUTION: This deletes all data!)
    console.log('🗑️  Clearing existing data...');
    await Department.deleteMany({});
    await Program.deleteMany({});
    await Term.deleteMany({});
    await Course.deleteMany({});
    console.log('✅ Existing data cleared\n');

    // 1. Create Departments
    console.log('📁 Creating departments...');
    const departments = await Department.insertMany([
      // { name: 'Computer Science', code: 'DCS' },
      { name: 'Computer Science', code: 'CS' },
      { name: 'Software Engineering', code: 'DSE' },
      { name: 'Information Technology', code: 'DIT' },
      { name: 'Mathematics', code: 'MATH' },
      { name: 'Physics', code: 'PHY' }
    ]);
    console.log(`✅ Created ${departments.length} departments\n`);

    // 2. Create Programs
    console.log('🎓 Creating programs...');
    const programs = await Program.insertMany([
      {
        name: 'Bachelor of Science in Computer Science',
        code: 'BSCS',
        departmentId: departments[0]._id,
        totalSemesters: 8
      },
      {
        name: 'Bachelor of Science in Software Engineering',
        code: 'BSSE',
        departmentId: departments[1]._id,
        totalSemesters: 8
      },
      {
        name: 'Bachelor of Science in Information Technology',
        code: 'BSIT',
        departmentId: departments[2]._id,
        totalSemesters: 8
      },
      {
        name: 'Master of Science in Computer Science',
        code: 'MSCS',
        departmentId: departments[0]._id,
        totalSemesters: 4
      }
    ]);
    console.log(`✅ Created ${programs.length} programs\n`);

    // 3. Create Terms
    console.log('📅 Creating terms...');
    const terms = await Term.insertMany([
      {
        name: 'Spring-2026',
        startDate: new Date('2026-02-01'),
        endDate: new Date('2026-06-30'),
        isActive: true
      },
      {
        name: 'Fall-2025',
        startDate: new Date('2025-09-01'),
        endDate: new Date('2026-01-31'),
        isActive: false
      },
      {
        name: 'Summer-2026',
        startDate: new Date('2026-07-01'),
        endDate: new Date('2026-08-31'),
        isActive: false
      },
      {
        name: 'spring-2026',
        startDate: new Date('2026-02-01'),
        endDate: new Date('2026-06-30'),
        isActive: true
      },
      {
        name: 'fall-2025',
        startDate: new Date('2025-09-01'),
        endDate: new Date('2026-01-31'),
        isActive: false
      },
      {
        name: 'summer-2026',
        startDate: new Date('2026-07-01'),
        endDate: new Date('2026-08-31'),
        isActive: false
      }
    ]);
    console.log(`✅ Created ${terms.length} terms\n`);

    // 4. Create Sample Courses
    console.log('📚 Creating courses...');
    const courses = await Course.insertMany([
      // Computer Science Courses
      {
        code: 'DCS-1001',
        name: 'Introduction to Programming',
        creditHours: 3,
        programId: programs[0]._id,
        departmentId: departments[0]._id,
        description: 'Fundamentals of programming using C++'
      },
      {
        code: 'DCS-2001',
        name: 'Data Structures',
        creditHours: 3,
        programId: programs[0]._id,
        departmentId: departments[0]._id,
        description: 'Arrays, linked lists, stacks, queues, trees, graphs'
      },
      {
        code: 'DCS-2002',
        name: 'Object Oriented Programming',
        creditHours: 3,
        programId: programs[0]._id,
        departmentId: departments[0]._id,
        description: 'OOP concepts using Java'
      },
      {
        code: 'DCS-2004',
        name: 'Database Systems',
        creditHours: 3,
        programId: programs[0]._id,
        departmentId: departments[0]._id,
        description: 'Database design, SQL, normalization'
      },
      {
        code: 'DCS-3001',
        name: 'Algorithms',
        creditHours: 3,
        programId: programs[0]._id,
        departmentId: departments[0]._id,
        description: 'Algorithm design and analysis'
      },
      {
        code: 'DCS-3002',
        name: 'Computer Networks',
        creditHours: 3,
        programId: programs[0]._id,
        departmentId: departments[0]._id,
        description: 'Network protocols, TCP/IP, OSI model'
      },
      {
        code: 'DCS-4001',
        name: 'Artificial Intelligence',
        creditHours: 3,
        programId: programs[0]._id,
        departmentId: departments[0]._id,
        description: 'AI fundamentals, search algorithms, machine learning'
      },

      // Software Engineering Courses
      {
        code: 'DSE-2001',
        name: 'Software Engineering Principles',
        creditHours: 3,
        programId: programs[1]._id,
        departmentId: departments[1]._id,
        description: 'SDLC, requirements engineering, design patterns'
      },
      {
        code: 'DSE-3001',
        name: 'Web Development',
        creditHours: 3,
        programId: programs[1]._id,
        departmentId: departments[1]._id,
        description: 'HTML, CSS, JavaScript, React, Node.js'
      },
      {
        code: 'DSE-3002',
        name: 'Mobile Application Development',
        creditHours: 3,
        programId: programs[1]._id,
        departmentId: departments[1]._id,
        description: 'Android and iOS development'
      },

      // Common Courses (no programId - available to all)
      {
        code: 'MATH-1001',
        name: 'Calculus I',
        creditHours: 3,
        departmentId: departments[3]._id,
        description: 'Limits, derivatives, integrals'
      },
      {
        code: 'MATH-2001',
        name: 'Linear Algebra',
        creditHours: 3,
        departmentId: departments[3]._id,
        description: 'Matrices, vector spaces, eigenvalues'
      },
      {
        code: 'PHY-1001',
        name: 'Physics I',
        creditHours: 3,
        departmentId: departments[4]._id,
        description: 'Mechanics, heat, waves'
      },
      {
        code: 'ENG-1001',
        name: 'English Composition',
        creditHours: 2,
        description: 'Academic writing and communication'
      },
      {
        code: 'ISL-1001',
        name: 'Islamic Studies',
        creditHours: 2,
        description: 'Introduction to Islamic teachings'
      }
    ]);
    console.log(`✅ Created ${courses.length} courses\n`);

    // Summary
    console.log('📊 Seeding Summary:');
    console.log(`   Departments: ${departments.length}`);
    console.log(`   Programs: ${programs.length}`);
    console.log(`   Terms: ${terms.length}`);
    console.log(`   Courses: ${courses.length}`);
    console.log('\n✅ Database seeding completed successfully!');
    console.log('\n💡 Next Steps:');
    console.log('   1. Create teacher accounts');
    console.log('   2. Teachers can now create course offerings');
    console.log('   3. Teachers add meeting schedules');
    console.log('   4. Students view their timetables\n');

  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    throw error;
  }
};

const runSeeder = async () => {
  await connectDB();
  await seedData();
  await mongoose.connection.close();
  console.log('🔌 Database connection closed');
  process.exit(0);
};

// Run seeder
runSeeder().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
