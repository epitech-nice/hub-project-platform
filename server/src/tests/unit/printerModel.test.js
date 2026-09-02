const Printer = require('../../models/Printer');
const { PRINTER_STATUSES } = require('../../utils/constants');

describe('Printer model', () => {
  it('defaults to idle status and empty history arrays', async () => {
    const printer = await Printer.create({
      name: 'Kobra 3 - Atelier A',
      model: 'kobra3',
      apiKeyHash: 'x'.repeat(64),
    });

    expect(printer.status).toBe(PRINTER_STATUSES.IDLE);
    expect(printer.currentJob).toBeNull();
    expect(printer.clearanceHistory).toEqual([]);
    expect(printer.statusHistory).toEqual([]);
  });

  it('rejects an invalid model value', async () => {
    await expect(
      Printer.create({ name: 'X', model: 'not-a-real-model', apiKeyHash: 'x'.repeat(64) })
    ).rejects.toThrow();
  });

  it('rejects an invalid status value', async () => {
    await expect(
      Printer.create({ name: 'X', model: 'kobra3', apiKeyHash: 'x'.repeat(64), status: 'nonsense' })
    ).rejects.toThrow();
  });
});
