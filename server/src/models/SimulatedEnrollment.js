const mongoose = require("mongoose");
const { SIMULATED_STATUSES } = require("../utils/constants");

// Crédits valides selon le type de cycle
// Cycle normal  : 0, 0.5, 1, 1.5
// Double cycle  : 0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4
const VALID_CREDITS_NORMAL = [0, 0.5, 1, 1.5];
const VALID_CREDITS_DOUBLE = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4];

const SimulatedEnrollmentSchema = new mongoose.Schema({
  // --- Étudiant ---
  student: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: { type: String, required: true },
    email: { type: String, required: true },
  },

  // --- Projet sélectionné ---
  simulatedProject: {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SimulatedProject",
      required: true,
    },
    title: { type: String, required: true },
  },

  // --- Numéro de cycle global (1, 2, 3...) ---
  cycleNumber: {
    type: Number,
    required: true,
    min: 1,
  },

  // --- Phase courante du cycle : 1 ou 2 (sur le même enrollment) ---
  // Phase 1 : soumission initiale jusqu'à la 1ère défense
  // Phase 2 : après approbation phase 1, l'étudiant met à jour son GitHub jusqu'à la 2ème défense
  phase: {
    type: Number,
    enum: [1, 2],
    default: 1,
  },

  // --- Double cycle (ex: vacances de Noël) ---
  // Si true : équivaut à 2 cycles fusionnés, crédits max = 4
  isDoubleCycle: {
    type: Boolean,
    default: false,
  },

  // --- Dates de la phase (injectées depuis SimulatedCycle) ---
  // Phase 1 : startDate=W0Ven, submissionDeadline=W1Mer, defenseDate=W2Ven
  // Phase 2 : startDate=W2Ven, submissionDeadline=W3Mer, defenseDate=W4Ven
  startDate: {
    type: Date,
    default: null,
  },
  defenseDate: {
    type: Date,
    default: null,
  },
  submissionDeadline: {
    type: Date,
    default: null,
  },

  // --- Soumission de l'étudiant ---
  githubProjectLink: {
    type: String,
    default: null,
  },

  // --- Statut (même logique que Project existant) ---
  status: {
    type: String,
    enum: Object.values(SIMULATED_STATUSES),
    default: SIMULATED_STATUSES.PENDING,
  },

  // --- Crédits de la phase 1 (attribués quand l'admin valide la phase 1) ---
  phase1Credits: {
    type: Number,
    default: null,
  },

  // --- Crédits de la phase 2 du cycle courant (attribués lors de la défense 2) ---
  credits: {
    type: Number,
    default: null,
    validate: {
      validator: function (value) {
        if (value === null) return true;
        const validValues = this.isDoubleCycle
          ? VALID_CREDITS_DOUBLE
          : VALID_CREDITS_NORMAL;
        return validValues.includes(value);
      },
      message: (props) =>
        `${props.value} n'est pas une valeur de crédit valide pour ce type de cycle`,
    },
  },

  // --- Historique de toutes les défenses (persiste à travers les relancemens) ---
  defenseHistory: {
    type: [
      {
        defenseNumber: { type: Number }, // numéro global de défense sur ce projet
        cycleNumber: { type: Number },
        phase: { type: Number },
        credits: { type: Number },
        comments: { type: String, default: "" },
        reviewer: {
          userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          name: String,
        },
        date: { type: Date, default: Date.now },
      },
    ],
    default: [],
  },

  // --- Total des crédits sur tout le projet (somme de toutes les défenses, persiste) ---
  totalCredits: {
    type: Number,
    default: 0,
  },

  // --- Verrou admin : true une fois approuvé ou après défense, l'étudiant ne peut plus modifier ---
  lockedByAdmin: {
    type: Boolean,
    default: false,
  },

  // --- Historique des modifications (identique à Project.changeHistory) ---
  changeHistory: {
    type: [
      {
        status: {
          type: String,
          enum: Object.values(SIMULATED_STATUSES),
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
    default: [],
  },

  // --- Évaluateur (admin ayant traité en dernier) ---
  reviewedBy: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    name: String,
    comments: String,
  },

  submittedAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Index pour les requêtes fréquentes
SimulatedEnrollmentSchema.index({ "student.userId": 1, status: 1 });
SimulatedEnrollmentSchema.index({ "simulatedProject.projectId": 1 });
SimulatedEnrollmentSchema.index({ status: 1, submittedAt: -1 });

// Export des constantes pour les réutiliser dans le controller
SimulatedEnrollmentSchema.statics.VALID_CREDITS_NORMAL = VALID_CREDITS_NORMAL;
SimulatedEnrollmentSchema.statics.VALID_CREDITS_DOUBLE = VALID_CREDITS_DOUBLE;

module.exports = mongoose.model(
  "SimulatedEnrollment",
  SimulatedEnrollmentSchema
);
