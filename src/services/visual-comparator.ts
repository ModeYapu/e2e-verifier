/**
 * Visual Comparator Service
 * Handles pixel-level image comparison with region-aware diff detection and heatmap generation
 */

import * as zlib from 'zlib';

/**
 * Region to ignore during comparison
 */
export interface IgnoreRegion {
  selector?: string;   // CSS selector (for future use with element-based regions)
  x?: number;          // X coordinate or top-left corner
  y?: number;          // Y coordinate or top-left corner
  width?: number;      // Width of region
  height?: number;     // Height of region
  label?: string;      // Optional label for the region
}

/**
 * Detected difference region
 */
export interface DiffRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  severity: number;    // 0-1 difference severity (0 = identical, 1 = completely different)
  label?: string;
}

/**
 * Result of visual comparison
 */
export interface DiffResult {
  totalPixels: number;
  diffPixels: number;
  diffPercentage: number;
  regions: DiffRegion[];
  heatmapBase64?: string;  // base64 encoded PNG heatmap
  ignoredRegions: IgnoreRegion[];
}

/**
 * PNG signature for validation
 */
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/**
 * Options for comparison
 */
export interface CompareOptions {
  threshold?: number;        // Pixel difference threshold (0-255, default 10)
  regionSize?: number;       // Region block size (default 16)
  generateHeatmap?: boolean; // Whether to generate heatmap (default true)
}

/**
 * Simple PNG decoder for extracting pixel data
 * Note: This is a minimal implementation for comparison purposes
 */
interface PNGImage {
  width: number;
  height: number;
  data: Buffer; // RGBA pixel data
}

/**
 * Visual Comparator class
 */
export class VisualComparator {
  private ignoreRegions: Map<string, IgnoreRegion[]> = new Map();

  /**
   * Set ignore regions for a site
   */
  setIgnoreRegions(site: string, regions: IgnoreRegion[]): void {
    this.ignoreRegions.set(site, regions || []);
  }

  /**
   * Get ignore regions for a site
   */
  getIgnoreRegions(site: string): IgnoreRegion[] {
    return this.ignoreRegions.get(site) || [];
  }

  /**
   * Compare two images and detect differences
   */
  compare(
    baseline: Buffer,
    current: Buffer,
    options: CompareOptions = {}
  ): DiffResult {
    const threshold = options.threshold ?? 10;
    const regionSize = options.regionSize ?? 16;
    const generateHeatmap = options.generateHeatmap !== false;

    // Parse PNG images
    const baselineImg = this.parsePNG(baseline);
    const currentImg = this.parsePNG(current);

    // Validate images have same dimensions
    if (baselineImg.width !== currentImg.width || baselineImg.height !== currentImg.height) {
      throw new Error(
        `Image dimensions differ: baseline ${baselineImg.width}x${baselineImg.height} vs current ${currentImg.width}x${currentImg.height}`
      );
    }

    const width = baselineImg.width;
    const height = baselineImg.height;
    const totalPixels = width * height;
    let diffPixels = 0;

    // Calculate region-aware differences
    const regions: DiffRegion[] = [];
    const numRegionsX = Math.ceil(width / regionSize);
    const numRegionsY = Math.ceil(height / regionSize);

    // Track which pixels are different for heatmap
    const diffMap: boolean[] = new Array(totalPixels).fill(false);

    for (let regionY = 0; regionY < numRegionsY; regionY++) {
      for (let regionX = 0; regionX < numRegionsX; regionX++) {
        const startX = regionX * regionSize;
        const startY = regionY * regionSize;
        const endX = Math.min(startX + regionSize, width);
        const endY = Math.min(startY + regionSize, height);
        const regionWidth = endX - startX;
        const regionHeight = endY - startY;

        let totalDiff = 0;
        let pixelCount = 0;

        // Check each pixel in the region
        for (let y = startY; y < endY; y++) {
          for (let x = startX; x < endX; x++) {
            const idx = (y * width + x) * 4;

            // Get RGB values (ignore alpha for comparison)
            const r1 = baselineImg.data[idx];
            const g1 = baselineImg.data[idx + 1];
            const b1 = baselineImg.data[idx + 2];
            const r2 = currentImg.data[idx];
            const g2 = currentImg.data[idx + 1];
            const b2 = currentImg.data[idx + 2];

            // Calculate Euclidean distance in RGB space
            const diff = Math.sqrt(
              Math.pow(r1 - r2, 2) +
              Math.pow(g1 - g2, 2) +
              Math.pow(b1 - b2, 2)
            );

            if (diff > threshold) {
              totalDiff += diff;
              diffMap[y * width + x] = true;
              diffPixels++;
            }
            pixelCount++;
          }
        }

        // Calculate region severity (normalized 0-1)
        const maxPossibleDiff = pixelCount * (255 * Math.sqrt(3));
        const severity = totalDiff / maxPossibleDiff;

        // Only add regions with significant differences
        if (severity > 0.01) {
          regions.push({
            x: startX,
            y: startY,
            width: regionWidth,
            height: regionHeight,
            severity: Math.min(severity, 1),
            label: `diff_${regionX}_${regionY}`
          });
        }
      }
    }

    const diffPercentage = totalPixels > 0 ? (diffPixels / totalPixels) * 100 : 0;

    const result: DiffResult = {
      totalPixels,
      diffPixels,
      diffPercentage,
      regions,
      ignoredRegions: []
    };

    // Generate heatmap if requested
    if (generateHeatmap) {
      result.heatmapBase64 = this.generateHeatmapBuffer(
        baselineImg,
        diffMap,
        width,
        height
      ).toString('base64');
    }

    return result;
  }

  /**
   * Generate a heatmap from diff regions
   */
  generateHeatmap(baseline: Buffer, diffRegions: DiffRegion[]): Buffer {
    // Parse baseline to get dimensions
    const baselineImg = this.parsePNG(baseline);
    const width = baselineImg.width;
    const height = baselineImg.height;
    const totalPixels = width * height;

    // Create diff map from regions
    const diffMap: boolean[] = new Array(totalPixels).fill(false);

    for (const region of diffRegions) {
      for (let y = region.y; y < region.y + region.height && y < height; y++) {
        for (let x = region.x; x < region.x + region.width && x < width; x++) {
          diffMap[y * width + x] = true;
        }
      }
    }

    return this.generateHeatmapBuffer(baselineImg, diffMap, width, height);
  }

  /**
   * Parse a PNG buffer into width, height and RGBA pixel data.
   *
   * This is a REAL decoder: it concatenates every IDAT chunk, inflates the
   * zlib stream with the built-in `zlib` module, reverses the per-scanline
   * PNG filtering, and normalises the result to 8-bit RGBA. The previous
   * implementation copied the still-compressed IDAT bytes verbatim into the
   * pixel buffer, so every "diff" it produced was meaningless.
   *
   * Supports the colour types Playwright (and typical PNG encoders) emit:
   * grayscale (0), RGB (2), grayscale+alpha (4) and RGBA (6), at 8 or 16 bit.
   */
  private parsePNG(buffer: Buffer): PNGImage {
    // Validate PNG signature
    if (buffer.length < 8 || !buffer.slice(0, 8).equals(PNG_SIGNATURE)) {
      throw new Error('Invalid PNG signature');
    }

    let offset = 8;
    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = 0;
    const idatChunks: Buffer[] = [];

    while (offset + 8 <= buffer.length) {
      const chunkLength = buffer.readUInt32BE(offset);
      offset += 4;
      const chunkType = buffer.slice(offset, offset + 4).toString('ascii');
      offset += 4;

      if (chunkType === 'IHDR') {
        width = buffer.readUInt32BE(offset);
        height = buffer.readUInt32BE(offset + 4);
        bitDepth = buffer.readUInt8(offset + 8);
        colorType = buffer.readUInt8(offset + 9);
      } else if (chunkType === 'IDAT') {
        idatChunks.push(buffer.slice(offset, offset + chunkLength));
      } else if (chunkType === 'IEND') {
        break;
      }

      offset += chunkLength + 4; // skip data + CRC
    }

    if (!width || !height) {
      throw new Error('Could not parse PNG dimensions');
    }
    if (idatChunks.length === 0) {
      throw new Error('PNG has no IDAT data');
    }

    // Number of samples per pixel for each colour type.
    const channelsByColorType: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };
    const channels = channelsByColorType[colorType];
    if (!channels) {
      throw new Error(`Unsupported PNG colour type: ${colorType} (indexed/palette PNGs are not supported)`);
    }
    if (bitDepth !== 8 && bitDepth !== 16) {
      throw new Error(`Unsupported PNG bit depth: ${bitDepth} (only 8 and 16 are supported)`);
    }

    // Inflate the concatenated IDAT zlib stream → filtered scanline bytes.
    const inflated = zlib.inflateSync(Buffer.concat(idatChunks));

    // bytesPerPixel in the FILTERED (pre-normalisation) representation, which
    // the unfiltering step operates on. Round up to a whole byte.
    const bitsPerPixel = channels * bitDepth;
    const filterBpp = Math.max(1, Math.ceil(bitsPerPixel / 8));
    const bytesPerRow = Math.ceil((width * bitsPerPixel) / 8);
    const expected = (bytesPerRow + 1) * height;
    if (inflated.length < expected) {
      throw new Error(`Truncated PNG data: got ${inflated.length} bytes, expected at least ${expected}`);
    }

    // Reverse PNG per-scanline filtering into `recon` (still native channels).
    const recon = Buffer.alloc(bytesPerRow * height);
    const prevLine = Buffer.alloc(bytesPerRow); // zero-initialised (line above first row)
    const curLine = Buffer.alloc(bytesPerRow);

    for (let y = 0; y < height; y++) {
      const lineStart = y * (bytesPerRow + 1);
      const filterType = inflated[lineStart];
      const src = inflated.subarray(lineStart + 1, lineStart + 1 + bytesPerRow);

      for (let x = 0; x < bytesPerRow; x++) {
        const xBpp = x >= filterBpp ? x - filterBpp : x;
        const filt = src[x];
        const a = x >= filterBpp ? curLine[xBpp] : 0; // left
        const b = prevLine[x];                          // above
        const c = x >= filterBpp ? prevLine[xBpp] : 0;  // above-left

        let value: number;
        switch (filterType) {
          case 0: // None
            value = filt;
            break;
          case 1: // Sub
            value = (filt + a) & 0xff;
            break;
          case 2: // Up
            value = (filt + b) & 0xff;
            break;
          case 3: // Average
            value = (filt + ((a + b) >> 1)) & 0xff;
            break;
          case 4: { // Paeth
            const p = a + b - c;
            const pa = Math.abs(p - a);
            const pb = Math.abs(p - b);
            const pc = Math.abs(p - c);
            const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
            value = (filt + pred) & 0xff;
            break;
          }
          default:
            throw new Error(`Unknown PNG filter type: ${filterType}`);
        }
        curLine[x] = value;
        recon[y * bytesPerRow + x] = value;
      }

      // Roll the line window forward.
      prevLine.set(curLine);
    }

    // Normalise to 8-bit RGBA, scaling 16-bit samples down and expanding
    // non-alpha colour types to include a fully-opaque alpha channel.
    const data = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcPixel = y * width + x;
        const srcOff = srcPixel * channels * (bitDepth === 16 ? 2 : 1);
        let r = 0, g = 0, b = 0, a = 255;

        const sample = (byteIndex: number): number => {
          if (bitDepth === 16) {
            // Drop the low byte (take the high byte) to scale to 8-bit.
            return recon[srcOff + byteIndex * 2];
          }
          return recon[srcOff + byteIndex];
        };

        switch (colorType) {
          case 0: // grayscale
            r = g = b = sample(0);
            break;
          case 2: // RGB
            r = sample(0); g = sample(1); b = sample(2);
            break;
          case 4: // grayscale + alpha
            r = g = b = sample(0); a = sample(1);
            break;
          case 6: // RGBA
            r = sample(0); g = sample(1); b = sample(2); a = sample(3);
            break;
        }

        const dstOff = srcPixel * 4;
        data[dstOff] = r;
        data[dstOff + 1] = g;
        data[dstOff + 2] = b;
        data[dstOff + 3] = a;
      }
    }

    return { width, height, data };
  }

  /**
   * Generate heatmap as PNG buffer (private helper)
   */
  private generateHeatmapBuffer(
    baselineImg: PNGImage,
    diffMap: boolean[],
    width: number,
    height: number
  ): Buffer {
    // Create heatmap buffer (RGBA)
    const heatmapData = Buffer.alloc(width * height * 4);

    for (let i = 0; i < diffMap.length; i++) {
      const idx = i * 4;
      if (diffMap[i]) {
        // Red for differences
        heatmapData[idx] = 255;     // R
        heatmapData[idx + 1] = 0;   // G
        heatmapData[idx + 2] = 0;   // B
        heatmapData[idx + 3] = 180; // A (semi-transparent)
      } else {
        // Semi-transparent green for no difference
        heatmapData[idx] = 0;       // R
        heatmapData[idx + 1] = 255; // G
        heatmapData[idx + 2] = 0;   // B
        heatmapData[idx + 3] = 50;   // A (very transparent)
      }
    }

    // Create a simple PNG header with the heatmap data
    // This is a minimal PNG - in production you'd use a proper PNG encoder
    const signature = PNG_SIGNATURE;
    const ihdr = this.createIHDRChunk(width, height);
    const idat = this.createIDATChunk(heatmapData, width, height);
    const iend = Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]); // IEND chunk

    return Buffer.concat([signature, ihdr, idat, iend]);
  }

  /**
   * Create IHDR chunk for PNG
   */
  private createIHDRChunk(width: number, height: number): Buffer {
    const data = Buffer.alloc(13);
    data.writeUInt32BE(width, 0);
    data.writeUInt32BE(height, 4);
    data.writeUInt8(8, 8);   // Bit depth
    data.writeUInt8(6, 9);   // Color type (RGBA)
    data.writeUInt8(0, 10);  // Compression
    data.writeUInt8(0, 11);  // Filter
    data.writeUInt8(0, 12);  // Interlace

    const length = Buffer.alloc(4);
    length.writeUInt32BE(13, 0);

    const type = Buffer.from('IHDR');
    const crc = this.calculateCRC(Buffer.concat([type, data]));

    return Buffer.concat([length, type, data, crc]);
  }

  /**
   * Create a valid IDAT chunk: the raw scanline bytes (each prefixed with a
   * None filter byte) are zlib-deflated, as the PNG spec requires. The
   * previous version wrote the uncompressed bytes directly, producing an
   * invalid PNG that no decoder could read.
   */
  private createIDATChunk(rgba: Buffer, width: number, height: number): Buffer {
    // Add a None (0) filter byte at the start of each scanline.
    const bytesPerRow = width * 4;
    const raw = Buffer.alloc((bytesPerRow + 1) * height);
    for (let y = 0; y < height; y++) {
      raw[y * (bytesPerRow + 1)] = 0; // filter type None
      rgba.copy(raw, y * (bytesPerRow + 1) + 1, y * bytesPerRow, y * bytesPerRow + bytesPerRow);
    }

    const compressed = zlib.deflateSync(raw);

    const length = Buffer.alloc(4);
    length.writeUInt32BE(compressed.length, 0);

    const type = Buffer.from('IDAT');
    const crc = this.calculateCRC(Buffer.concat([type, compressed]));

    return Buffer.concat([length, type, compressed, crc]);
  }

  /**
   * Calculate CRC for PNG chunk
   */
  private calculateCRC(data: Buffer): Buffer {
    // Simple CRC-32 calculation
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

  /**
   * Check if a point is within any ignore region
   */
  private isPointIgnored(x: number, y: number, ignoreRegions: IgnoreRegion[]): boolean {
    for (const region of ignoreRegions) {
      if (region.x !== undefined && region.y !== undefined &&
          region.width !== undefined && region.height !== undefined) {
        if (x >= region.x && x < region.x + region.width &&
            y >= region.y && y < region.y + region.height) {
          return true;
        }
      }
    }
    return false;
  }
}
