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

  it('defaults spoolSlots to an empty array and spoolSlotsUpdatedAt to null', async () => {
    const printer = await Printer.create({ name: 'P1', model: 'kobra3', apiKeyHash: 'x'.repeat(64) });
    expect(printer.spoolSlots).toEqual([]);
    expect(printer.spoolSlotsUpdatedAt).toBeNull();
  });

  it('accepts a populated spoolSlots array', async () => {
    const printer = await Printer.create({
      name: 'P1',
      model: 'kobra3',
      apiKeyHash: 'x'.repeat(64),
      spoolSlots: [
        { gate: 0, material: 'PLA', color: '212721FF', empty: false },
        { gate: 1, material: '', color: '', empty: true },
        { gate: 2, material: 'PETG', color: 'F40031FF', empty: false },
        { gate: 3, material: 'PLA', color: 'FED141FF', empty: false },
      ],
      spoolSlotsUpdatedAt: new Date(),
    });
    expect(printer.spoolSlots).toHaveLength(4);
    expect(printer.spoolSlots[1].empty).toBe(true);
  });

  it('defaults spoolSlots manual-declaration fields to auto/null', async () => {
    const printer = await Printer.create({
      name: 'P1',
      model: 'kobra3',
      apiKeyHash: 'x'.repeat(64),
      spoolSlots: [{ gate: 0, material: 'PLA', color: '212721FF', empty: false }],
    });
    expect(printer.spoolSlots[0].source).toBe('auto');
    expect(printer.spoolSlots[0].manualSetBy).toBeNull();
    expect(printer.spoolSlots[0].manualSetAt).toBeNull();
    expect(printer.spoolSlots[0].autoMaterialAtSet).toBeNull();
    expect(printer.spoolSlots[0].autoColorAtSet).toBeNull();
    expect(printer.spoolSlots[0].autoEmptyAtSet).toBeNull();
  });

  it('accepts a manually-declared spoolSlot with its drift-detection snapshot', async () => {
    const printer = await Printer.create({
      name: 'P1',
      model: 'kobra3',
      apiKeyHash: 'x'.repeat(64),
      spoolSlots: [
        {
          gate: 0,
          material: 'PLA',
          color: 'FFFFFF',
          empty: false,
          source: 'manual',
          manualSetBy: { email: 's@epitech.eu', name: 'Student' },
          manualSetAt: new Date(),
          autoMaterialAtSet: '',
          autoColorAtSet: '',
          autoEmptyAtSet: false,
        },
      ],
    });
    expect(printer.spoolSlots[0].source).toBe('manual');
    expect(printer.spoolSlots[0].manualSetBy.email).toBe('s@epitech.eu');
    expect(printer.spoolSlots[0].autoEmptyAtSet).toBe(false);
  });
});
