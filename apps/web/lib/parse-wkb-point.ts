/**
 * Parse a PostGIS WKB hex string for a POINT geometry into lat/lng coordinates.
 * PostGIS geography(POINT, 4326) stores as WKB hex when returned by Supabase.
 *
 * WKB POINT layout (little-endian):
 *   Byte 0: byte order (01 = little-endian)
 *   Bytes 1-4: geometry type (01000020 for POINT with SRID in extended WKB)
 *   Bytes 5-8: SRID (optional, 4326 = E6100000)
 *   Next 8 bytes: X (longitude) as float64
 *   Next 8 bytes: Y (latitude) as float64
 */

interface Coordinates {
  readonly latitude: number;
  readonly longitude: number;
}

export function parseWkbPoint(hex: string | null): Coordinates | null {
  if (!hex || typeof hex !== 'string') return null;

  // Minimum length: byte order (2) + type (8) + x (16) + y (16) = 42
  // With SRID: byte order (2) + type (8) + srid (8) + x (16) + y (16) = 50
  if (hex.length < 42) return null;

  try {
    const buf = Buffer.from(hex, 'hex');

    // Byte order: 0 = big-endian, 1 = little-endian
    const isLittleEndian = buf[0] === 1;

    // Read geometry type (4 bytes)
    const geomType = isLittleEndian
      ? buf.readUInt32LE(1)
      : buf.readUInt32BE(1);

    // Determine offset based on whether SRID is present
    // Type with SRID flag has bit 0x20000000 set
    const hasSrid = (geomType & 0x20000000) !== 0;
    const coordOffset = hasSrid ? 9 : 5;

    // Read X (longitude) and Y (latitude) as float64
    const lng = isLittleEndian
      ? buf.readDoubleLE(coordOffset)
      : buf.readDoubleBE(coordOffset);
    const lat = isLittleEndian
      ? buf.readDoubleLE(coordOffset + 8)
      : buf.readDoubleBE(coordOffset + 8);

    // Validate reasonable coordinate ranges
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

    return { latitude: lat, longitude: lng };
  } catch {
    return null;
  }
}
