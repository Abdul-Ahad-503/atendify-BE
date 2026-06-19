const express = require('express');
const router = express.Router();
const Department = require('../models/Department');
const Program = require('../models/Program');
const Term = require('../models/Term');
const { sendSuccess, sendError } = require('../utils/responseUtils');

// GET /api/departments
router.get('/departments', async (req, res) => {
  try {
    const departments = await Department.find({ isActive: true })
      .select('_id name code')
      .sort({ name: 1 });
    return sendSuccess(res, 200, 'Departments retrieved', { departments });
  } catch (error) {
    return sendError(res, 500, 'Failed to fetch departments', [error.message]);
  }
});

// GET /api/programs
router.get('/programs', async (req, res) => {
  try {
    const { departmentId } = req.query;
    const query = { isActive: true };
    if (departmentId) query.departmentId = departmentId;

    const programs = await Program.find(query)
      .select('_id name code departmentId')
      .populate('departmentId', 'name code')
      .sort({ name: 1 });

    return sendSuccess(res, 200, 'Programs retrieved', { programs });
  } catch (error) {
    return sendError(res, 500, 'Failed to fetch programs', [error.message]);
  }
});

// GET /api/terms
router.get('/terms', async (req, res) => {
  try {
    const terms = await Term.find()
      .select('_id name startDate endDate isActive')
      .sort({ startDate: -1 });
    return sendSuccess(res, 200, 'Terms retrieved', { terms });
  } catch (error) {
    return sendError(res, 500, 'Failed to fetch terms', [error.message]);
  }
});

module.exports = router;
