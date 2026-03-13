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
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Project", ProjectSchema);
