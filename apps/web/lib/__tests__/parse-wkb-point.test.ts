import { describe, it, expect } from 'vitest';
import { parseWkbPoint } from '../parse-wkb-point';

describe('parseWkbPoint', () => {
  // Real PostGIS WKB hex for POINT(-89.4012 43.0731) with SRID 4326, little-endian
  // Byte order: 01 (LE)
  // Geometry type: 01000020 (Point with SRID)
  // SRID: E6100000 (4326 LE)
  // X (lng): -89.4012 as float64 LE
  // Y (lat): 43.0731 as float64 LE
  function buildWkbHex(lng: number, lat: number, opts?: { hasSrid?: boolean; bigEndian?: boolean }): string {
    const hasSrid = opts?.hasSrid ?? true;
    const bigEndian = opts?.bigEndian ?? false;

    const buf = Buffer.alloc(hasSrid ? 25 : 21);
    let offset = 0;

    // Byte order
    buf[offset++] = bigEndian ? 0 : 1;

    // Geometry type
    const geomType = hasSrid ? 0x20000001 : 1;
    if (bigEndian) {
      buf.writeUInt32BE(geomType, offset);
    } else {
      buf.writeUInt32LE(geomType, offset);
    }
    offset += 4;

    // SRID (4326)
    if (hasSrid) {
      if (bigEndian) {
        buf.writeUInt32BE(4326, offset);
      } else {
        buf.writeUInt32LE(4326, offset);
      }
      offset += 4;
    }

    // X (longitude)
    if (bigEndian) {
      buf.writeDoubleBE(lng, offset);
    } else {
      buf.writeDoubleLE(lng, offset);
    }
    offset += 8;

    // Y (latitude)
    if (bigEndian) {
      buf.writeDoubleBE(lat, offset);
    } else {
      buf.writeDoubleLE(lat, offset);
    }

    return buf.toString('hex');
  }

  it('parses a little-endian WKB POINT with SRID', () => {
    const hex = buildWkbHex(-89.4012, 43.0731, { hasSrid: true, bigEndian: false });
    const result = parseWkbPoint(hex);
    expect(result).not.toBeNull();
    expect(result!.longitude).toBeCloseTo(-89.4012, 4);
    expect(result!.latitude).toBeCloseTo(43.0731, 4);
  });

  it('parses a big-endian WKB POINT with SRID', () => {
    const hex = buildWkbHex(-89.4012, 43.0731, { hasSrid: true, bigEndian: true });
    const result = parseWkbPoint(hex);
    expect(result).not.toBeNull();
    expect(result!.longitude).toBeCloseTo(-89.4012, 4);
    expect(result!.latitude).toBeCloseTo(43.0731, 4);
  });

  it('parses a WKB POINT without SRID', () => {
    const hex = buildWkbHex(-89.4012, 43.0731, { hasSrid: false });
    const result = parseWkbPoint(hex);
    expect(result).not.toBeNull();
    expect(result!.longitude).toBeCloseTo(-89.4012, 4);
    expect(result!.latitude).toBeCloseTo(43.0731, 4);
  });

  it('returns null for null input', () => {
    expect(parseWkbPoint(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseWkbPoint('')).toBeNull();
  });

  it('returns null for hex string shorter than minimum length', () => {
    expect(parseWkbPoint('0101000020')).toBeNull();
  });

  it('returns null for invalid hex that causes parse error', () => {
    expect(parseWkbPoint('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz')).toBeNull();
  });

  it('returns null when latitude is out of range', () => {
    const hex = buildWkbHex(-89.4012, 91.0);
    expect(parseWkbPoint(hex)).toBeNull();
  });

  it('returns null when longitude is out of range', () => {
    const hex = buildWkbHex(-181.0, 43.0731);
    expect(parseWkbPoint(hex)).toBeNull();
  });

  it('handles coordinates at the boundary (90, 180)', () => {
    const hex = buildWkbHex(180, 90);
    const result = parseWkbPoint(hex);
    expect(result).not.toBeNull();
    expect(result!.latitude).toBe(90);
    expect(result!.longitude).toBe(180);
  });

  it('handles coordinates at the negative boundary (-90, -180)', () => {
    const hex = buildWkbHex(-180, -90);
    const result = parseWkbPoint(hex);
    expect(result).not.toBeNull();
    expect(result!.latitude).toBe(-90);
    expect(result!.longitude).toBe(-180);
  });

  it('handles zero coordinates (0, 0)', () => {
    const hex = buildWkbHex(0, 0);
    const result = parseWkbPoint(hex);
    expect(result).not.toBeNull();
    expect(result!.latitude).toBe(0);
    expect(result!.longitude).toBe(0);
  });
});
