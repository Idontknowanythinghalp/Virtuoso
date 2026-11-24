#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const ROOT_DIR = process.cwd();
const DEFAULT_OUTPUT = path.resolve(ROOT_DIR, "virtuoso-cms-export.zip");

const EXCLUDED_DIRS = new Set([
  ".aistudio",
  ".git",
  ".next",
  ".vercel",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
]);

const EXCLUDED_FILES = new Set([
  ".DS_Store",
  "bun.lock",
  "next-env.d.ts",
]);

function shouldExcludeEntry(relPath, entryName, isDirectory) {
  if (isDirectory) {
    return EXCLUDED_DIRS.has(entryName);
  }
  if (EXCLUDED_FILES.has(entryName)) {
    return true;
  }
  if (entryName.endsWith(".zip") || entryName.endsWith(".log") || entryName.endsWith(".tsbuildinfo")) {
    return true;
  }
  // Exclude all .env* files except .env.example
  if (entryName.startsWith(".env") && entryName !== ".env.example") {
    return true;
  }
  // Avoid bundling temporary/empty output files if present at root
  if (relPath === "virtuoso-cms-export.zip") {
    return true;
  }
  return false;
}

function collectFiles(dir, prefix = "") {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const fullPath = path.join(dir, entry.name);

    if (entry.isSymbolicLink()) {
      continue;
    }

    if (entry.isDirectory()) {
      if (shouldExcludeEntry(relPath, entry.name, true)) {
        continue;
      }
      results.push(...collectFiles(fullPath, relPath));
    } else if (entry.isFile()) {
      if (shouldExcludeEntry(relPath, entry.name, false)) {
        continue;
      }
      results.push({ relPath, fullPath });
    }
  }

  return results;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toDosTimeDate(date) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((date.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((year - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    (date.getDate() & 0x1f);
  return { dosTime, dosDate };
}

function createZipBuffer(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const raw = fs.readFileSync(file.fullPath);
    const stat = fs.statSync(file.fullPath);
    const { dosTime, dosDate } = toDosTimeDate(stat.mtime);

    const compressed = zlib.deflateRawSync(raw, { level: 6 });
    const useStored = compressed.length >= raw.length;
    const method = useStored ? 0 : 8;
    const payload = useStored ? raw : compressed;
    const crc = crc32(raw);

    const nameBytes = Buffer.from(file.relPath.replace(/\\/g, "/"), "utf8");
    const utf8Flag = 0x0800;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(utf8Flag, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(payload.length, 18);
    localHeader.writeUInt32LE(raw.length, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBytes, payload);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(utf8Flag, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(payload.length, 20);
    centralHeader.writeUInt32LE(raw.length, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBytes);
    offset += localHeader.length + nameBytes.length + payload.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(files.length, 8);
  endRecord.writeUInt16LE(files.length, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, endRecord]);
}

function resolveOutputPath(arg) {
  if (!arg) return DEFAULT_OUTPUT;
  const resolved = path.resolve(ROOT_DIR, arg);
  return resolved;
}

const outputPath = resolveOutputPath(process.argv[2]);
const files = collectFiles(ROOT_DIR);
const zipBuffer = createZipBuffer(files);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, zipBuffer);

console.log(
  `Created ${path.relative(ROOT_DIR, outputPath) || outputPath} (${files.length} files, ${(zipBuffer.length / 1024).toFixed(1)} KB)`,
);
