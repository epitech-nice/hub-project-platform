const Idea = require('../../models/Idea');
const IdeationSettings = require('../../models/IdeationSettings');

// Idée valide : créateur membre accepté, un deck factice déjà versionné
const createIdea = async (creator, overrides = {}) => {
  const base = {
    title: 'Idée de test',
    description: 'Une courte description',
    hashtags: ['ia', 'web', 'data'],
    creator: { userId: creator._id, name: creator.name, email: creator.email },
    members: [
      { userId: creator._id, name: creator.name, email: creator.email, status: 'accepted' },
    ],
    deck: {
      versions: [
        {
          number: 1,
          storedName: 'deck-1.pdf',
          originalName: 'deck.pdf',
          size: 1234,
          author: { userId: creator._id, name: creator.name },
        },
      ],
    },
  };
  return Idea.create({ ...base, ...overrides });
};

// Fixe la date limite (YYYY-MM-DD) ou la supprime avec null
const setDeadline = (deadlineDate) =>
  IdeationSettings.findOneAndUpdate(
    { key: 'singleton' },
    { $set: { deadlineDate }, $setOnInsert: { key: 'singleton' } },
    { upsert: true, new: true, runValidators: true }
  );

module.exports = { createIdea, setDeadline };
