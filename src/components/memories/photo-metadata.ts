import { z } from "zod";
import type { ImportMetadata, MemoryMimeType } from "../../../shared/memories-contract";

const unknownMetadata = (): ImportMetadata => ({
  capturedAt: null,
  timezone: null,
  latitude: null,
  longitude: null,
  accuracyM: null,
  origin: "unknown",
});

function exifOffset(bytes: Uint8Array, type: MemoryMimeType): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (offset: number, length: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + length));
  if (type === "image/jpeg" && view.byteLength > 4 && view.getUint16(0) === 0xffd8) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff || bytes[offset + 1] === 0xda) break;
      const size = view.getUint16(offset + 2);
      if (size < 2 || offset + size + 2 > bytes.length) break;
      if (bytes[offset + 1] === 0xe1 && text(offset + 4, 6) === "Exif\0\0") return offset + 10;
      offset += size + 2;
    }
  }
  if (type === "image/png" && text(1, 3) === "PNG") {
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const size = view.getUint32(offset);
      if (offset + size + 12 > bytes.length) break;
      if (text(offset + 4, 4) === "eXIf") return offset + 8;
      offset += size + 12;
    }
  }
  if (type === "image/webp" && text(0, 4) === "RIFF" && text(8, 4) === "WEBP") {
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const size = view.getUint32(offset + 4, true);
      if (offset + size + 8 > bytes.length) break;
      if (text(offset, 4) === "EXIF")
        return offset + 8 + (text(offset + 8, 6) === "Exif\0\0" ? 6 : 0);
      offset += size + 8 + (size % 2);
    }
  }
  return null;
}

export function readImageMetadata(buffer: ArrayBuffer, type: MemoryMimeType): ImportMetadata {
  const result = unknownMetadata();
  try {
    const bytes = new Uint8Array(buffer);
    const start = exifOffset(bytes, type);
    if (start === null || start + 8 > bytes.length) return result;
    const view = new DataView(buffer, start);
    const little = view.getUint16(0) === 0x4949;
    if (!little && view.getUint16(0) !== 0x4d4d) return result;
    if (view.getUint16(2, little) !== 42) return result;
    const u16 = (offset: number) => view.getUint16(offset, little);
    const u32 = (offset: number) => view.getUint32(offset, little);
    function directory(offset: number) {
      const entries = new Map<number, { type: number; count: number; offset: number }>();
      if (offset < 8 || offset + 2 > view.byteLength) return entries;
      const count = Math.min(u16(offset), 256);
      for (let i = 0; i < count; i++) {
        const entry = offset + 2 + 12 * i;
        if (entry + 12 > view.byteLength) break;
        const type = u16(entry + 2);
        const count = u32(entry + 4);
        const width = type === 2 ? 1 : type === 3 ? 2 : type === 4 ? 4 : type === 5 ? 8 : 0;
        if (!width || count > 1024) continue;
        const pointer = count * width > 4 ? u32(entry + 8) : entry + 8;
        if (pointer + count * width > view.byteLength) continue;
        entries.set(u16(entry), { type, count, offset: pointer });
      }
      return entries;
    }
    type Directory = ReturnType<typeof directory>;
    function ascii(entries: Directory, tag: number) {
      const entry = entries.get(tag);
      return entry?.type === 2
        ? String.fromCharCode(
            ...bytes.subarray(start! + entry.offset, start! + entry.offset + entry.count),
          )
            .replace(/\0.*$/, "")
            .trim()
        : null;
    }
    function pointer(entries: Directory, tag: number) {
      const entry = entries.get(tag);
      return entry?.type === 4 && entry.count === 1 ? u32(entry.offset) : 0;
    }
    const root = directory(u32(4));
    const exif = directory(pointer(root, 0x8769));
    const date = ascii(exif, 0x9003);
    const offset = ascii(exif, 0x9011);
    if (
      date &&
      /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/.test(date) &&
      offset &&
      /^[+-]\d{2}:\d{2}$/.test(offset)
    ) {
      const instant = `${date.slice(0, 10).replaceAll(":", "-")}T${date.slice(11)}${offset}`;
      if (
        z.string().datetime({ offset: true }).safeParse(instant).success &&
        Number.isFinite(Date.parse(instant))
      )
        result.capturedAt = new Date(instant).toISOString();
    }
    const gps = directory(pointer(root, 0x8825));
    function coordinate(tag: number, referenceTag: number, positive: string, negative: string) {
      const entry = gps.get(tag);
      const reference = ascii(gps, referenceTag);
      if (entry?.type !== 5 || entry.count !== 3 || ![positive, negative].includes(reference ?? ""))
        return null;
      const numbers = [0, 1, 2].map((index) => {
        const point = entry.offset + index * 8;
        return u32(point) / u32(point + 4);
      });
      const value = numbers[0] + numbers[1] / 60 + numbers[2] / 3600;
      return Number.isFinite(value) && numbers[1] < 60 && numbers[2] < 60
        ? value * (reference === negative ? -1 : 1)
        : null;
    }
    const latitude = coordinate(2, 1, "N", "S");
    const longitude = coordinate(4, 3, "E", "W");
    if (
      latitude !== null &&
      longitude !== null &&
      Math.abs(latitude) <= 90 &&
      Math.abs(longitude) <= 180
    ) {
      result.latitude = latitude;
      result.longitude = longitude;
    }
    if (result.capturedAt || result.latitude !== null) result.origin = "exif";
    return result;
  } catch {
    return unknownMetadata();
  }
}
