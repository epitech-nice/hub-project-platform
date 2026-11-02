const mongoose = require("mongoose");

// Une version d'un fichier (logo ou deck), stockée hors /uploads
const FileVersionSchema = new mongoose.Schema(
  {
    number: { type: Number, required: true },
    storedName: { type: String, required: true },
    originalName: { type: String, required: true },
    size: { type: Number, required: true },
    author: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      name: String,
    },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const IdeaSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, required: true },
    hashtags: [String],

    creator: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      name: { type: String, required: true },
      email: { type: String, required: true },
    },

    // Membres du groupe (créateur inclus côté contrôleur), invités en attente compris
    members: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        name: String,
        email: String,
        status: {
          type: String,
          enum: ["pending", "accepted"],
          default: "pending",
        },
        invitedAt: { type: Date, default: Date.now },
      },
    ],

    logo: { versions: [FileVersionSchema] },
    deck: { versions: [FileVersionSchema] },

    // Liens du jour 2
    day2Links: [
      {
        label: { type: String, required: true },
        url: { type: String, required: true },
        author: {
          userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          name: String,
        },
        createdAt: { type: Date, default: Date.now },
      },
    ],

    hidden: { type: Boolean, default: false },
    unlockedUntil: { type: Date },
    lastActivityAt: { type: Date },
  },
  { timestamps: true }
);

IdeaSchema.index({ "members.userId": 1 });
IdeaSchema.index({ hashtags: 1 });
IdeaSchema.index({ title: "text" });

// Membres ayant accepté
IdeaSchema.methods.acceptedCount = function () {
  return this.members.filter((m) => m.status === "accepted").length;
};

// Places occupées : acceptés + invités en attente
IdeaSchema.methods.slotCount = function () {
  return this.members.filter(
    (m) => m.status === "accepted" || m.status === "pending"
  ).length;
};

// Groupe incomplet : moins de 3 acceptés
IdeaSchema.methods.isIncomplete = function () {
  return this.acceptedCount() < 3;
};

// Dernière version d'un fichier ('logo' | 'deck'), ou null
IdeaSchema.methods.currentVersion = function (kind) {
  const versions = this[kind] && this[kind].versions;
  if (!versions || versions.length === 0) return null;
  return versions.reduce((best, v) => (v.number > best.number ? v : best));
};

module.exports = mongoose.model("Idea", IdeaSchema);
