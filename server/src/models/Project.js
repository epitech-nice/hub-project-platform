// models/Project.js
const mongoose = require("mongoose");

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
    github: String,
    docs: String,
    other: [String],
  },
  status: {
    type: String,
    enum: ["pending", "pending_changes", "approved", "rejected"],
    default: "pending",
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
          enum: ["pending", "pending_changes", "approved", "rejected"],
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
