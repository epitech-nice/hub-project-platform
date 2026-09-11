const { parseGcodeSpoolInfo, computeConfirmedSlotMismatches } = require('../../utils/spoolAnalysis');

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

describe('computeConfirmedSlotMismatches', () => {
  const expectedTools = [{ tool: 'T0', material: 'PLA', color: '#FF6A14' }];

  it('returns no mismatch when material and color match, ignoring color format differences', () => {
    const slots = [{ gate: 0, material: 'PLA', color: 'FF6A14FF', empty: false }];
    expect(computeConfirmedSlotMismatches(expectedTools, slots, [{ tool: 'T0', gate: 0 }])).toEqual([]);
  });

  it('reports a mismatch when the assigned slot has a different material', () => {
    const slots = [{ gate: 0, material: 'PETG', color: 'FF6A14FF', empty: false }];
    expect(computeConfirmedSlotMismatches(expectedTools, slots, [{ tool: 'T0', gate: 0 }])).toEqual([
      { tool: 'T0', gate: 0, expectedMaterial: 'PLA', expectedColor: '#FF6A14', actualMaterial: 'PETG', actualColor: 'FF6A14FF' },
    ]);
  });

  it('reports a mismatch when the assigned slot is empty', () => {
    const slots = [{ gate: 0, material: '', color: '', empty: true }];
    expect(computeConfirmedSlotMismatches(expectedTools, slots, [{ tool: 'T0', gate: 0 }])).toEqual([
      { tool: 'T0', gate: 0, expectedMaterial: 'PLA', expectedColor: '#FF6A14', actualMaterial: null, actualColor: null },
    ]);
  });

  it('skips a tool with no slicer metadata to compare against', () => {
    const slots = [{ gate: 0, material: 'PETG', color: 'AABBCCFF', empty: false }];
    const noMetadataTool = [{ tool: 'T0', material: null, color: null }];
    expect(computeConfirmedSlotMismatches(noMetadataTool, slots, [{ tool: 'T0', gate: 0 }])).toEqual([]);
  });
});
