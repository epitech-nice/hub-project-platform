const express = require('express');
const router = express.Router();
const { authenticateToken, isAdmin } = require('../middleware/auth');
const { printJobUpload, pendingPrintUpload } = require('../middleware/printJobUpload');
const jobController = require('../controllers/print/jobController');
const ErrorResponse = require('../utils/errorResponse');

// multer (fileFilter / limits) errors arrive via the upload middleware's own callback rather
// than through next(err) automatically — wrap it so a bad extension surfaces as a normal 400.
const handleUpload = (req, res, next) => {
  printJobUpload.single('file')(req, res, (err) => {
    if (err) return next(new ErrorResponse(err.message, 400));
    next();
  });
};

const handleAnalyzeUpload = (req, res, next) => {
  pendingPrintUpload.single('file')(req, res, (err) => {
    if (err) return next(new ErrorResponse(err.message, 400));
    next();
  });
};

router.post('/', authenticateToken, handleUpload, jobController.submitJob);
router.post('/analyze', authenticateToken, handleAnalyzeUpload, jobController.analyzeJob);
router.get('/me', authenticateToken, jobController.getMyJobs);
router.post('/:id/cancel', authenticateToken, jobController.cancelJob);
router.post('/:pendingUploadId/confirm', authenticateToken, jobController.confirmJob);
router.get('/', authenticateToken, isAdmin, jobController.getAllJobs);
router.get('/:id', authenticateToken, isAdmin, jobController.getJobById);

module.exports = router;
