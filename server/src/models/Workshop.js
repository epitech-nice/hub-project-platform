// models/Workshop.js
const mongoose = require("mongoose");

const WorkshopSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  details: {
    type: String,
    required: true,
  },
  instructorCount: {
    type: Number,
    required: true,
  },
  instructorEmails: {
    type: [String],
    default: [],
  },
  links: {
    github: {
      type: String,
      required: true
    },
    presentation: {
      type: String,
      required: true
    },
    other: [String]
  },
  status: {
    type: String,
    enum: ['pending', 'pending_changes', 'approved', 'rejected', 'completed'],
    default: 'pending'
  },
  instructors: [
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
      isMain: {
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
  changeHistory: {
    type: [
      {
        status: {
          type: String,
          enum: ["pending", "pending_changes", "approved", "rejected", "completed"],
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

module.exports = mongoose.model("Workshop", WorkshopSchema);