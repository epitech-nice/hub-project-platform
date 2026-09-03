const PrintJob = require('../../models/PrintJob');
const asyncHandler = require('../../middleware/asyncHandler');

// GET /api/print/agent/next-job
// req.printer est posé par authenticatePrinter
exports.getNextJob = asyncHandler(async (req, res) => {
  if (!req.printer.currentJob) {
    return res.status(200).json({ success: true, data: null });
  }

  // La condition status: 'queued' rend l'écriture atomique : si deux polls se chevauchent,
  // un seul obtiendra un document en retour.
  const job = await PrintJob.findOneAndUpdate(
    { _id: req.printer.currentJob, status: 'queued' },
    {
      status: 'sent',
      $push: { history: { status: 'sent', date: new Date(), detail: `Dispatché à l'imprimante ${req.printer.name}` } },
    }
  );

  if (!job) {
    return res.status(200).json({ success: true, data: null });
  }

  res.status(200).json({
    success: true,
    data: {
      jobId: job._id.toString(),
      fileName: job.fileName,
      downloadUrl: `/api/print/agent/jobs/${job._id}/file`,
    },
  });
});
