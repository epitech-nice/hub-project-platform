const { mergeSpoolSlots } = require('../../utils/spoolSlotMerge');

describe('mergeSpoolSlots', () => {
  it('adopts a reported gate with no prior slot as auto', () => {
    const result = mergeSpoolSlots([], [{ gate: 0, material: 'PLA', color: '212721FF', empty: false }]);
    expect(result).toEqual([
      {
        gate: 0,
        material: 'PLA',
        color: '212721FF',
        empty: false,
        source: 'auto',
        manualSetBy: { email: null, name: null },
        manualSetAt: null,
        autoMaterialAtSet: null,
        autoColorAtSet: null,
        autoEmptyAtSet: null,
      },
    ]);
  });

  it('adopts a new reported value when the existing slot was already auto, regardless of change', () => {
    const existing = [
      {
        gate: 0,
        material: 'PLA',
        color: '212721FF',
        empty: false,
        source: 'auto',
        manualSetBy: { email: null, name: null },
        manualSetAt: null,
        autoMaterialAtSet: null,
        autoColorAtSet: null,
        autoEmptyAtSet: null,
      },
    ];
    const result = mergeSpoolSlots(existing, [{ gate: 0, material: 'PETG', color: 'F40031FF', empty: false }]);
    expect(result[0].material).toBe('PETG');
    expect(result[0].source).toBe('auto');
  });

  it('preserves a manual declaration when the auto-reported value has not changed', () => {
    const existing = [
      {
        gate: 0,
        material: 'Blanc générique',
        color: 'ffffff',
        empty: false,
        source: 'manual',
        manualSetBy: { email: 's@epitech.eu', name: 'Student' },
        manualSetAt: new Date('2026-09-10T10:00:00Z'),
        autoMaterialAtSet: 'PLA',
        autoColorAtSet: '212721FF',
        autoEmptyAtSet: false,
      },
    ];
    // Le rapport entrant est identique à ce qui était vrai au moment de la déclaration manuelle.
    const result = mergeSpoolSlots(existing, [{ gate: 0, material: 'PLA', color: '212721FF', empty: false }]);
    expect(result[0].source).toBe('manual');
    expect(result[0].material).toBe('Blanc générique');
    expect(result[0].color).toBe('ffffff');
    expect(result[0].manualSetBy).toEqual({ email: 's@epitech.eu', name: 'Student' });
  });

  it('clears a manual declaration and adopts the fresh value when the auto-reported value has changed', () => {
    const existing = [
      {
        gate: 0,
        material: 'Blanc générique',
        color: 'ffffff',
        empty: false,
        source: 'manual',
        manualSetBy: { email: 's@epitech.eu', name: 'Student' },
        manualSetAt: new Date('2026-09-10T10:00:00Z'),
        autoMaterialAtSet: 'PLA',
        autoColorAtSet: '212721FF',
        autoEmptyAtSet: false,
      },
    ];
    // Une vraie puce RFID vient d'être lue : la valeur auto a changé par rapport à autoXAtSet.
    const result = mergeSpoolSlots(existing, [{ gate: 0, material: 'PETG', color: 'AABBCCFF', empty: false }]);
    expect(result[0]).toEqual({
      gate: 0,
      material: 'PETG',
      color: 'AABBCCFF',
      empty: false,
      source: 'auto',
      manualSetBy: { email: null, name: null },
      manualSetAt: null,
      autoMaterialAtSet: null,
      autoColorAtSet: null,
      autoEmptyAtSet: null,
    });
  });

  it('treats a gate becoming empty as a drift, clearing the manual declaration', () => {
    const existing = [
      {
        gate: 0,
        material: 'Blanc générique',
        color: 'ffffff',
        empty: false,
        source: 'manual',
        manualSetBy: { email: 's@epitech.eu', name: 'Student' },
        manualSetAt: new Date('2026-09-10T10:00:00Z'),
        autoMaterialAtSet: 'PLA',
        autoColorAtSet: '212721FF',
        autoEmptyAtSet: false,
      },
    ];
    const result = mergeSpoolSlots(existing, [{ gate: 0, material: 'PLA', color: '212721FF', empty: true }]);
    expect(result[0].source).toBe('auto');
    expect(result[0].empty).toBe(true);
  });

  it('handles a reported gate missing material/color/empty by defaulting them', () => {
    const result = mergeSpoolSlots([], [{ gate: 1 }]);
    expect(result[0].material).toBe('');
    expect(result[0].color).toBe('');
    expect(result[0].empty).toBe(false);
  });

  it('preserves a gate absent from the current report instead of dropping it', () => {
    const existing = [
      {
        gate: 0,
        material: 'Blanc générique',
        color: 'ffffff',
        empty: false,
        source: 'manual',
        manualSetBy: { email: 's@epitech.eu', name: 'Student' },
        manualSetAt: new Date('2026-09-10T10:00:00Z'),
        autoMaterialAtSet: 'PLA',
        autoColorAtSet: '212721FF',
        autoEmptyAtSet: false,
      },
      {
        gate: 1,
        material: 'PETG',
        color: 'F40031FF',
        empty: false,
        source: 'auto',
        manualSetBy: { email: null, name: null },
        manualSetAt: null,
        autoMaterialAtSet: null,
        autoColorAtSet: null,
        autoEmptyAtSet: null,
      },
    ];
    // Ce tick ne rapporte que le gate 1 (glitch de requête MMU côté agent, ou num_gates mal
    // rapporté) — le gate 0 doit rester tel quel, pas disparaître de la liste.
    const result = mergeSpoolSlots(existing, [{ gate: 1, material: 'PETG', color: 'F40031FF', empty: false }]);

    expect(result).toHaveLength(2);
    const gate0 = result.find((s) => s.gate === 0);
    expect(gate0.source).toBe('manual');
    expect(gate0.material).toBe('Blanc générique');
  });

  it('preserves a manual declaration when the auto-reported color only differs by case/alpha channel', () => {
    const existing = [
      {
        gate: 0,
        material: 'Blanc générique',
        color: 'ffffff',
        empty: false,
        source: 'manual',
        manualSetBy: { email: 's@epitech.eu', name: 'Student' },
        manualSetAt: new Date('2026-09-10T10:00:00Z'),
        autoMaterialAtSet: 'PLA',
        autoColorAtSet: '212721FF',
        autoEmptyAtSet: false,
      },
    ];
    // Même couleur physique, casse différente + canal alpha différent : ne doit PAS être traité
    // comme une dérive (une comparaison stricte de chaînes le traiterait à tort comme un
    // changement).
    const result = mergeSpoolSlots(existing, [{ gate: 0, material: 'PLA', color: '212721ab', empty: false }]);
    expect(result[0].source).toBe('manual');
    expect(result[0].material).toBe('Blanc générique');
  });
});
