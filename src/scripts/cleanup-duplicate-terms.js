/**
 * Remove duplicate terms — keeps only one entry per (lowercased) name.
 * Prefers the active term when duplicates exist.
 * Run: node src/scripts/cleanup-duplicate-terms.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected\n');

  const Term = require('../models/Term');
  const CourseOffering = require('../models/CourseOffering');
  const Meeting = require('../models/Meeting');

  const all = await Term.find({}).sort({ createdAt: -1 });
  console.log(`Total terms in DB: ${all.length}\n`);

  // Group by lowercase name
  const groups = new Map();
  for (const t of all) {
    const key = t.name.toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }

  let deleted = 0;
  for (const [key, terms] of groups) {
    if (terms.length <= 1) continue;

    console.log(`"${terms[0].name}" — ${terms.length} duplicates`);

    // Sort: active first, then by creation date
    terms.sort((a, b) => {
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;
      return b.createdAt - a.createdAt;
    });

    const keep = terms[0];
    const remove = terms.slice(1);

    for (const t of remove) {
      // Update any offerings/meetings referencing the duplicate to use the kept one
      await CourseOffering.updateMany({ termId: t._id }, { termId: keep._id });
      await Meeting.updateMany({ termId: t._id }, { termId: keep._id });
      await Term.deleteOne({ _id: t._id });
      deleted++;
      console.log(`   🗑️  Deleted: "${t.name}" (${t._id}) → merged into "${keep.name}" (${keep._id})`);
    }
  }

  // Ensure only ONE active term
  const activeTerms = await Term.find({ isActive: true });
  if (activeTerms.length > 1) {
    for (let i = 1; i < activeTerms.length; i++) {
      await Term.findByIdAndUpdate(activeTerms[i]._id, { isActive: false });
      console.log(`\n⏹️  Deactivated duplicate active: "${activeTerms[i].name}"`);
    }
  }

  const remaining = await Term.find({});
  console.log(`\n📋 Remaining terms (${remaining.length}):`);
  remaining.forEach(t => console.log(`   "${t.name}" — active=${t.isActive}`));

  await mongoose.connection.close();
  console.log('\n✅ Done');
  process.exit(0);
};

run().catch(err => { console.error(err); process.exit(1); });
