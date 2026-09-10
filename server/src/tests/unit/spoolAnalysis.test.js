const { parseGcodeSpoolInfo, computeSlotMismatches } = require('../../utils/spoolAnalysis');

describe('parseGcodeSpoolInfo', () => {
  it('returns mode single when no Tx line is present', () => {
    const gcode = 'G28\nG1 X10 Y10\nM104 S200\n';
    expect(parseGcodeSpoolInfo(gcode)).toEqual({ mode: 'single', expectedTools: [] });
  });

  it('returns mode multi-material on a single standalone T0 line, with no slicer metadata', () => {
    const gcode = 'G28\nT0\nG1 X10 Y10\n';
    const result = parseGcodeSpoolInfo(gcode);
    expect(result.mode).toBe('multi-material');
    expect(result.expectedTools).toEqual([{ tool: 'T0', material: null, color: null }]);
  });

  it('extracts filament_type and filament_colour header comments for each used tool', () => {
    const gcode = [
      '; filament_colour = #FF6A14;#FED141;#F40031;#212721',
      '; filament_type = PLA;PLA;PETG;PLA',
      'G28',
      'T0',
      'G1 X10',
      'T2',
      'G1 X20',
    ].join('\n');
    const result = parseGcodeSpoolInfo(gcode);
    expect(result.mode).toBe('multi-material');
    expect(result.expectedTools).toEqual([
      { tool: 'T0', material: 'PLA', color: '#FF6A14' },
      { tool: 'T2', material: 'PETG', color: '#F40031' },
    ]);
  });

  it('does not treat a T0 that is part of a longer token (e.g. a comment) as a tool change', () => {
    const gcode = 'G28\n; T0 is the default tool per the slicer profile\nG1 X10\n';
    expect(parseGcodeSpoolInfo(gcode)).toEqual({ mode: 'single', expectedTools: [] });
  });

  it('ignores Tx values outside 0-3', () => {
    // Un gcode généré pour une autre config MMU pourrait référencer T4+ — hors périmètre ACE 4 slots.
    const gcode = 'G28\nT4\nG1 X10\n';
    expect(parseGcodeSpoolInfo(gcode)).toEqual({ mode: 'single', expectedTools: [] });
  });
});

describe('computeSlotMismatches', () => {
  const spoolSlots = [
    { gate: 0, material: 'PLA', color: '212721FF', empty: false },
    { gate: 1, material: '', color: '', empty: true },
    { gate: 2, material: 'PLA', color: 'F40031FF', empty: false },
    { gate: 3, material: 'PLA', color: 'FED141FF', empty: false },
  ];

  it('returns no mismatch when material and color match (case/format-insensitive)', () => {
    const expectedTools = [{ tool: 'T0', material: 'pla', color: '#212721' }];
    expect(computeSlotMismatches(expectedTools, spoolSlots)).toEqual([]);
  });

  it('flags a material mismatch', () => {
    const expectedTools = [{ tool: 'T2', material: 'PETG', color: '#F40031' }];
    const result = computeSlotMismatches(expectedTools, spoolSlots);
    expect(result).toEqual([
      { tool: 'T2', expectedMaterial: 'PETG', expectedColor: '#F40031', actualGate: 2, actualMaterial: 'PLA', actualColor: 'F40031FF' },
    ]);
  });

  it('flags a color mismatch even when material matches', () => {
    const expectedTools = [{ tool: 'T3', material: 'PLA', color: '#000000' }];
    const result = computeSlotMismatches(expectedTools, spoolSlots);
    expect(result).toHaveLength(1);
    expect(result[0].tool).toBe('T3');
  });

  it('flags a gate that is empty', () => {
    const expectedTools = [{ tool: 'T1', material: 'PLA', color: '#212721' }];
    const result = computeSlotMismatches(expectedTools, spoolSlots);
    expect(result).toHaveLength(1);
    expect(result[0].actualMaterial).toBeNull();
  });

  it('flags a gate with no known material/color as unable to verify, without crashing', () => {
    const expectedTools = [{ tool: 'T0', material: null, color: null }];
    expect(computeSlotMismatches(expectedTools, spoolSlots)).toEqual([]);
  });

  it('flags a tool referencing a gate not present in spoolSlots', () => {
    const expectedTools = [{ tool: 'T2', material: 'PLA', color: '#212721' }];
    const result = computeSlotMismatches(expectedTools, []);
    expect(result).toEqual([
      { tool: 'T2', expectedMaterial: 'PLA', expectedColor: '#212721', actualGate: 2, actualMaterial: null, actualColor: null },
    ]);
  });
});
