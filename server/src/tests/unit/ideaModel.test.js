const mongoose = require('mongoose');
const Idea = require('../../models/Idea');
const IdeationSettings = require('../../models/IdeationSettings');

const member = (status) => ({
  userId: new mongoose.Types.ObjectId(),
  name: 'M',
  email: `${Math.random()}@epitech.eu`,
  status,
});

const baseIdea = (overrides = {}) => ({
  title: 'Mon idee',
  description: 'Une description',
  hashtags: ['a', 'b', 'c'],
  creator: { userId: new mongoose.Types.ObjectId(), name: 'C', email: 'c@epitech.eu' },
  ...overrides,
});

describe('Idea model', () => {
  it('rejects a title longer than 80 characters', async () => {
    await expect(Idea.create(baseIdea({ title: 'x'.repeat(81) }))).rejects.toThrow();
  });

  it('accepts a title of 80 characters and defaults hidden to false', async () => {
    const idea = await Idea.create(baseIdea({ title: 'x'.repeat(80) }));
    expect(idea.hidden).toBe(false);
  });

  it('defaults logo.versions to an empty array', () => {
    expect(new Idea(baseIdea()).logo.versions).toHaveLength(0);
  });

  it('rejects an invalid member status', async () => {
    await expect(Idea.create(baseIdea({ members: [member('bogus')] }))).rejects.toThrow();
  });

  it('slotCount counts pending members, acceptedCount does not', () => {
    const idea = new Idea(baseIdea({
      members: [member('accepted'), member('accepted'), member('pending')],
    }));
    expect(idea.acceptedCount()).toBe(2);
    expect(idea.slotCount()).toBe(3);
  });

  it('isIncomplete is true at 2 accepted and false at 3', () => {
    const two = new Idea(baseIdea({ members: [member('accepted'), member('accepted'), member('pending')] }));
    const three = new Idea(baseIdea({ members: [member('accepted'), member('accepted'), member('accepted')] }));
    expect(two.isIncomplete()).toBe(true);
    expect(three.isIncomplete()).toBe(false);
  });

  it('currentVersion returns the highest version number, null when none', () => {
    const v = (number) => ({
      number, storedName: `s${number}`, originalName: 'o.pdf', size: 1,
      author: { userId: new mongoose.Types.ObjectId(), name: 'A' },
    });
    const idea = new Idea(baseIdea({ deck: { versions: [v(1), v(3), v(2)] } }));
    expect(idea.currentVersion('deck').number).toBe(3);
    expect(idea.currentVersion('logo')).toBeNull();
  });
});

describe('IdeationSettings model', () => {
  it('getSingleton returns the same document twice', async () => {
    const a = await IdeationSettings.getSingleton();
    const b = await IdeationSettings.getSingleton();
    expect(String(a._id)).toBe(String(b._id));
    expect(await IdeationSettings.countDocuments()).toBe(1);
  });

  it('rejects a malformed deadlineDate', async () => {
    await expect(IdeationSettings.create({ deadlineDate: '31/03/2027' })).rejects.toThrow();
  });

  it('rejects impossible calendar dates', async () => {
    await expect(IdeationSettings.create({ deadlineDate: '2027-13-45' })).rejects.toThrow();
    await expect(IdeationSettings.create({ deadlineDate: '2027-02-30' })).rejects.toThrow();
  });

  it('accepts a leap day', async () => {
    const s = await IdeationSettings.create({ deadlineDate: '2028-02-29' });
    expect(s.deadlineDate).toBe('2028-02-29');
  });

  it('concurrent getSingleton calls yield one document and one _id', async () => {
    await IdeationSettings.deleteMany({});
    await IdeationSettings.init();
    const docs = await Promise.all(Array.from({ length: 5 }, () => IdeationSettings.getSingleton()));
    expect(new Set(docs.map((d) => String(d._id))).size).toBe(1);
    expect(await IdeationSettings.countDocuments()).toBe(1);
  });

  it('accepts a valid or absent deadlineDate', async () => {
    const s = await IdeationSettings.create({ deadlineDate: '2027-03-31' });
    expect(s.deadlineDate).toBe('2027-03-31');
    await IdeationSettings.deleteMany({});
    const empty = await IdeationSettings.create({});
    expect(empty.deadlineDate == null).toBe(true);
  });
});
