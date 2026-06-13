/**
 * Visual Comparator Tests
 * Tests for visual comparison, diff detection, and heatmap generation
 */

import { VisualComparator, IgnoreRegion, DiffResult } from '../src/services/visual-comparator';

// Helper to create a simple PNG buffer (minimal format)
function createSimplePNG(width: number, height: number, color: [number, number, number]): Buffer {
  // Create a minimal valid PNG with IHDR and IDAT chunks
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk: width (4), height (4), bit depth (1), color type (1), compression (1), filter (1), interlace (1) = 13 bytes
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8);   // bit depth
  ihdrData.writeUInt8(2, 9);   // color type (RGB)
  ihdrData.writeUInt8(0, 10);  // compression
  ihdrData.writeUInt8(0, 11);  // filter
  ihdrData.writeUInt8(0, 12);  // interlace

  const ihdrLength = Buffer.alloc(4);
  ihdrLength.writeUInt32BE(13, 0);
  const ihdrType = Buffer.from('IHDR');
  const ihdrCrc = calculateCRC(Buffer.concat([ihdrType, ihdrData]));

  // Create pixel data (simplified - no compression for testing)
  const pixelData = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    pixelData[i * 3] = color[0];     // R
    pixelData[i * 3 + 1] = color[1]; // G
    pixelData[i * 3 + 2] = color[2]; // B
  }

  const idatLength = Buffer.alloc(4);
  idatLength.writeUInt32BE(pixelData.length, 0);
  const idatType = Buffer.from('IDAT');
  const idatCrc = calculateCRC(Buffer.concat([idatType, pixelData]));

  const iendChunk = Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);

  return Buffer.concat([
    signature,
    ihdrLength, ihdrType, ihdrData, ihdrCrc,
    idatLength, idatType, pixelData, idatCrc,
    iendChunk
  ]);
}

// Simple CRC-32 calculation
function calculateCRC(data: Buffer): Buffer {
  let crc = 0xffffffff >>> 0;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ ((crc & 1) * 0xedb88320);
    }
  }
  crc = (crc ^ 0xffffffff) >>> 0;

  const result = Buffer.alloc(4);
  result.writeUInt32BE(crc, 0);
  return result;
}

describe('VisualComparator', () => {
  let comparator: VisualComparator;

  beforeEach(() => {
    comparator = new VisualComparator();
  });

  describe('setIgnoreRegions / getIgnoreRegions', () => {
    test('set and get ignore regions', () => {
      const regions: IgnoreRegion[] = [
        { x: 10, y: 20, width: 100, height: 50, label: 'header' },
        { selector: '.dynamic-content', label: 'dynamic' }
      ];

      comparator.setIgnoreRegions('test-site', regions);
      const retrieved = comparator.getIgnoreRegions('test-site');

      expect(retrieved).toEqual(regions);
      expect(retrieved).toHaveLength(2);
    });

    test('returns empty array for site with no regions', () => {
      const retrieved = comparator.getIgnoreRegions('non-existent-site');
      expect(retrieved).toEqual([]);
    });

    test('overwrites existing regions', () => {
      comparator.setIgnoreRegions('test-site', [{ x: 0, y: 0, width: 10, height: 10 }]);
      comparator.setIgnoreRegions('test-site', [{ x: 5, y: 5, width: 20, height: 20 }]);

      const retrieved = comparator.getIgnoreRegions('test-site');
      expect(retrieved).toHaveLength(1);
      expect(retrieved[0].x).toBe(5);
    });

    test('handles empty regions array', () => {
      comparator.setIgnoreRegions('test-site', []);
      const retrieved = comparator.getIgnoreRegions('test-site');
      expect(retrieved).toEqual([]);
    });

    test('stores regions independently for different sites', () => {
      comparator.setIgnoreRegions('site-a', [{ x: 0, y: 0, width: 10, height: 10 }]);
      comparator.setIgnoreRegions('site-b', [{ x: 20, y: 20, width: 30, height: 30 }]);

      expect(comparator.getIgnoreRegions('site-a')).toHaveLength(1);
      expect(comparator.getIgnoreRegions('site-b')).toHaveLength(1);
      expect(comparator.getIgnoreRegions('site-a')[0].x).toBe(0);
      expect(comparator.getIgnoreRegions('site-b')[0].x).toBe(20);
    });
  });

  describe('compare', () => {
    test('identical images have zero diff', () => {
      const image = createSimplePNG(100, 100, [255, 0, 0]); // Red image

      const result: DiffResult = comparator.compare(image, image);

      expect(result.diffPixels).toBe(0);
      expect(result.diffPercentage).toBe(0);
      expect(result.regions).toHaveLength(0);
    });

    test('different images have non-zero diff', () => {
      const redImage = createSimplePNG(50, 50, [255, 0, 0]);
      const blueImage = createSimplePNG(50, 50, [0, 0, 255]);

      const result: DiffResult = comparator.compare(redImage, blueImage);

      expect(result.diffPixels).toBeGreaterThan(0);
      expect(result.diffPercentage).toBeGreaterThan(0);
      expect(result.totalPixels).toBe(2500); // 50 * 50
    });

    test('respects threshold parameter', () => {
      const redImage = createSimplePNG(50, 50, [255, 0, 0]);
      const slightlyDifferentRed = createSimplePNG(50, 50, [254, 0, 0]);

      const strictThreshold = 0;
      const looseThreshold = 10;

      const strictResult = comparator.compare(redImage, slightlyDifferentRed, { threshold: strictThreshold });
      const looseResult = comparator.compare(redImage, slightlyDifferentRed, { threshold: looseThreshold });

      expect(strictResult.diffPixels).toBeGreaterThan(looseResult.diffPixels);
    });

    test('generates heatmap when requested', () => {
      const redImage = createSimplePNG(50, 50, [255, 0, 0]);
      const blueImage = createSimplePNG(50, 50, [0, 0, 255]);

      const result: DiffResult = comparator.compare(redImage, blueImage, { generateHeatmap: true });

      expect(result.heatmapBase64).toBeDefined();
      expect(result.heatmapBase64).toBeTruthy();
      expect(typeof result.heatmapBase64).toBe('string');
    });

    test('skips heatmap generation when disabled', () => {
      const redImage = createSimplePNG(50, 50, [255, 0, 0]);
      const blueImage = createSimplePNG(50, 50, [0, 0, 255]);

      const result: DiffResult = comparator.compare(redImage, blueImage, { generateHeatmap: false });

      expect(result.heatmapBase64).toBeUndefined();
    });

    test('throws error for different image dimensions', () => {
      const smallImage = createSimplePNG(10, 10, [255, 0, 0]);
      const largeImage = createSimplePNG(100, 100, [0, 0, 255]);

      expect(() => {
        comparator.compare(smallImage, largeImage);
      }).toThrow('Image dimensions differ');
    });

    test('region size affects detection granularity', () => {
      const redImage = createSimplePNG(100, 100, [255, 0, 0]);
      const blueImage = createSimplePNG(100, 100, [0, 0, 255]);

      const smallRegion = comparator.compare(redImage, blueImage, { regionSize: 8 });
      const largeRegion = comparator.compare(redImage, blueImage, { regionSize: 32 });

      // Smaller regions should generally result in more detected regions
      expect(smallRegion.regions.length).toBeGreaterThanOrEqual(largeRegion.regions.length);
    });
  });

  describe('generateHeatmap from diff regions', () => {
    test('generates heatmap from diff regions', () => {
      const baseline = createSimplePNG(100, 100, [255, 0, 0]);

      const diffRegions = [
        { x: 10, y: 10, width: 20, height: 20, severity: 1, label: 'diff1' },
        { x: 50, y: 50, width: 30, height: 30, severity: 0.5, label: 'diff2' }
      ];

      const heatmap = comparator.generateHeatmap(baseline, diffRegions);

      expect(heatmap).toBeInstanceOf(Buffer);
      expect(heatmap.length).toBeGreaterThan(0);
    });

    test('handles empty diff regions', () => {
      const baseline = createSimplePNG(100, 100, [255, 0, 0]);

      const heatmap = comparator.generateHeatmap(baseline, []);

      expect(heatmap).toBeInstanceOf(Buffer);
      expect(heatmap.length).toBeGreaterThan(0);
    });
  });

  describe('isPointIgnored', () => {
    test('correctly identifies points in ignore regions', () => {
      const regions: IgnoreRegion[] = [
        { x: 10, y: 10, width: 50, height: 50 },
        { x: 100, y: 100, width: 20, height: 20 }
      ];

      comparator.setIgnoreRegions('test', regions);

      // Test using the internal method (access via bracket notation for testing)
      const isPointInRegion = (comparator as any).isPointIgnored.bind(comparator);

      expect(isPointInRegion(15, 15, regions)).toBe(true);  // Inside first region
      expect(isPointInRegion(110, 110, regions)).toBe(true); // Inside second region
      expect(isPointInRegion(0, 0, regions)).toBe(false);    // Outside all regions
      expect(isPointInRegion(70, 70, regions)).toBe(false);  // Outside all regions
    });

    test('handles boundary conditions', () => {
      const regions: IgnoreRegion[] = [
        { x: 0, y: 0, width: 10, height: 10 }
      ];

      const isPointInRegion = (comparator as any).isPointIgnored.bind(comparator);

      expect(isPointInRegion(0, 0, regions)).toBe(true);   // Top-left corner
      expect(isPointInRegion(9, 9, regions)).toBe(true);   // Bottom-right corner
      expect(isPointInRegion(10, 10, regions)).toBe(false); // Just outside
      expect(isPointInRegion(-1, -1, regions)).toBe(false); // Negative coordinates
    });
  });

  describe('edge cases', () => {
    test('handles very small images', () => {
      const tinyImage = createSimplePNG(1, 1, [255, 0, 0]);
      const result = comparator.compare(tinyImage, tinyImage);

      expect(result.totalPixels).toBe(1);
      expect(result.diffPercentage).toBe(0);
    });

    test('handles partial region parameters', () => {
      const partialRegions: IgnoreRegion[] = [
        { x: 10, y: 10 }, // Missing width and height
        { selector: '#test' } // Selector only
      ];

      comparator.setIgnoreRegions('test', partialRegions);

      const retrieved = comparator.getIgnoreRegions('test');
      expect(retrieved).toEqual(partialRegions);
    });
  });
});
