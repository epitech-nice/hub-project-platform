const mongoose = require("mongoose");
const { PROJECT_STATUSES } = require("../utils/constants");

const ProjectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  objectives: {
    type: String,
    required: true,
  },
  technologies: {
    type: [String],
    required: true,
  },
  studentCount: {
    type: Number,
    required: true,
  },
  studentEmails: {
    type: [String],
    default: [],
  },
  links: {
    github: {
      type: String,
      required: true
    },
    projectGithub: {
      type: String,
      required: true
    },
    other: [String]
  },
  status: {
    type: String,
    enum: Object.values(PROJECT_STATUSES),
    default: PROJECT_STATUSES.PENDING
  },
  credits: {
    type: Number,
    default: null
  },
  members: [
    {
      email: {
        type: String,
        required: true,
      },
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      isCreator: {
        type: Boolean,
        default: false,
      },
    },
  ],
  submittedBy: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: String,
    email: String,
  },
  reviewedBy: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    name: String,
    comments: String,
  },
  additionalInfo: {
    personalGithub: String,
    projectGithub: String,
    documents: [String],
  },
  externalRequestStatus: {
    sent: {
      type: Boolean,
      default: false,
    },
    sentAt: Date,
    response: Object,
  },
  changeHistory: {
    type: [
      {
        status: {
          type: String,
          enum: Object.values(PROJECT_STATUSES),
        },
        comments: String,
        reviewer: {
          userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },
          name: String,
        },
        date: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    default: [], // Tableau vide par défaut
  },
  defenseDate: Date,
  mySync: {
    activityId: Number,
    eventId: Number,
    status: {
      type: String,
      enum: ['idle', 'partial', 'done'],
      default: 'idle',
    },
    lastAttemptAt: Date,
    lastError: String,
    inProgressUntil: Date,
    students: {
      type: [
        {
          _id: false,
          email: String,
          registered: { type: Boolean, default: false },
          present: { type: Boolean, default: false },
          markBefore: { type: Number, default: null },
          markTarget: { type: Number, default: null },
          pointsApplied: { type: Number, default: null },
          error: { type: String, default: null },
        },
      ],
      default: [],
    },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Index pour les requêtes fréquentes
ProjectSchema.index({ status: 1, createdAt: -1 });
ProjectSchema.index({ "members.email": 1 });
ProjectSchema.index({ "submittedBy.userId": 1 });

module.exports = mongoose.model("Project", ProjectSchema);
