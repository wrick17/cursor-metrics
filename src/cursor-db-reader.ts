import { closeSync, existsSync, fstatSync, openSync, readSync } from "fs";

const CURSOR_AUTH_KEYS = ["cursorAuth/accessToken", "cursorAuth/cachedEmail"] as const;
type CursorAuthKey = (typeof CURSOR_AUTH_KEYS)[number];
export type CursorAuthValues = Partial<Record<CursorAuthKey, string>>;

type Varint = { value: number; nextOffset: number };
type SqliteValue = number | string | null;
type DecodedField = { value: SqliteValue; byteLength: number };
type WalIndex = { fd: number; pages: Map<number, number> };

function decodeVarint(buffer: Buffer, offset: number, limit = buffer.length): Varint | null {
  let value = 0;
  for (let i = 0; i < 8 && offset + i < limit; i++) {
    const byte = buffer[offset + i];
    if (byte === undefined) return null;
    value = value * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) {
      return { value, nextOffset: offset + i + 1 };
    }
  }

  if (offset + 8 < limit) {
    const byte = buffer[offset + 8];
    return byte === undefined ? null : { value: value * 256 + byte, nextOffset: offset + 9 };
  }
  return null;
}

function sqliteFieldByteLength(serialType: number): number | null {
  if (serialType === 0 || serialType === 8 || serialType === 9) return 0;
  if (serialType >= 1 && serialType <= 4) return serialType;
  if (serialType === 5) return 6;
  if (serialType === 6 || serialType === 7) return 8;
  if (serialType >= 12) return Math.floor((serialType - 12) / 2);
  return null;
}

function readSignedInt(buffer: Buffer, offset: number, byteLength: number): number | null {
  if (byteLength === 0) return 0;
  if (offset + byteLength > buffer.length) return null;

  let value = 0;
  for (let i = 0; i < byteLength; i++) {
    const byte = buffer[offset + i];
    if (byte === undefined) return null;
    value = value * 256 + byte;
  }

  const signBit = 2 ** (byteLength * 8 - 1);
  return value >= signBit ? value - 2 ** (byteLength * 8) : value;
}

function readSqliteField(buffer: Buffer, offset: number, serialType: number): DecodedField | null {
  const byteLength = sqliteFieldByteLength(serialType);
  if (byteLength === null || offset + byteLength > buffer.length) return null;
  if (serialType === 0) return { value: null, byteLength };
  if (serialType === 8) return { value: 0, byteLength };
  if (serialType === 9) return { value: 1, byteLength };
  if (serialType >= 1 && serialType <= 6) {
    const value = readSignedInt(buffer, offset, byteLength);
    return value === null ? null : { value, byteLength };
  }
  if (serialType === 7) return { value: null, byteLength };
  if (serialType % 2 === 0) return { value: null, byteLength };
  return {
    value: buffer.toString("utf8", offset, offset + byteLength),
    byteLength,
  };
}

function readSqliteRecord(page: Buffer, payloadOffset: number, payloadSize: number): SqliteValue[] | null {
  if (payloadOffset + payloadSize > page.length) return null;

  const headerSizeVarint = decodeVarint(page, payloadOffset, payloadOffset + payloadSize);
  if (!headerSizeVarint) return null;

  const headerEnd = payloadOffset + headerSizeVarint.value;
  if (headerEnd > payloadOffset + payloadSize) return null;

  const serialTypes: number[] = [];
  let serialOffset = headerSizeVarint.nextOffset;
  while (serialOffset < headerEnd) {
    const serialType = decodeVarint(page, serialOffset, headerEnd);
    if (!serialType) return null;
    serialTypes.push(serialType.value);
    serialOffset = serialType.nextOffset;
  }

  const values: SqliteValue[] = [];
  let fieldOffset = headerEnd;
  for (const serialType of serialTypes) {
    const field = readSqliteField(page, fieldOffset, serialType);
    if (!field) return null;
    values.push(field.value);
    fieldOffset += field.byteLength;
  }
  return values;
}

function readTableLeafRecord(page: Buffer, cellOffset: number): SqliteValue[] | null {
  if (cellOffset >= page.length) return null;
  const payloadSize = decodeVarint(page, cellOffset);
  if (!payloadSize) return null;

  const rowId = decodeVarint(page, payloadSize.nextOffset);
  if (!rowId) return null;

  return readSqliteRecord(page, rowId.nextOffset, payloadSize.value);
}

function getSqlitePageSize(header: Buffer, walPageSize?: number): number {
  if (walPageSize && walPageSize > 0) return walPageSize;

  const pageSize = header.readUInt16BE(16);
  return pageSize === 1 ? 65_536 : pageSize;
}

function indexWalFile(dbPath: string, pageSize: number): WalIndex | null {
  const walPath = `${dbPath}-wal`;
  if (!existsSync(walPath)) return null;

  const fd = openSync(walPath, "r");
  const size = fstatSync(fd).size;
  if (size < 32) return { fd, pages: new Map() };

  const header = Buffer.alloc(32);
  readSync(fd, header, 0, header.length, 0);
  const magic = header.readUInt32BE(0);
  if (magic !== 0x377f0682 && magic !== 0x377f0683) {
    closeSync(fd);
    return null;
  }

  const pages = new Map<number, number>();
  const frameSize = 24 + pageSize;
  for (let frameOffset = 32; frameOffset + frameSize <= size; frameOffset += frameSize) {
    const frameHeader = Buffer.alloc(4);
    readSync(fd, frameHeader, 0, frameHeader.length, frameOffset);
    const pageNumber = frameHeader.readUInt32BE(0);
    if (pageNumber > 0) {
      pages.set(pageNumber, frameOffset + 24);
    }
  }

  return { fd, pages };
}

function getCellPointerOffset(pageType: number, btreeHeaderOffset: number): number {
  return btreeHeaderOffset + (pageType === 0x05 ? 12 : 8);
}

function readPage(
  dbFd: number,
  walIndex: WalIndex | null,
  pageNumber: number,
  pageSize: number,
): Buffer | null {
  const page = Buffer.alloc(pageSize);
  const walOffset = walIndex?.pages.get(pageNumber);
  const bytesRead = walOffset === undefined || !walIndex
    ? readSync(dbFd, page, 0, pageSize, (pageNumber - 1) * pageSize)
    : readSync(walIndex.fd, page, 0, pageSize, walOffset);

  if (bytesRead <= 0) return null;
  return bytesRead === pageSize ? page : page.subarray(0, bytesRead);
}

function collectTableLeafRecords(
  readDbPage: (pageNumber: number) => Buffer | null,
  rootPage: number,
  onRecord: (record: SqliteValue[]) => boolean,
  seenPages = new Set<number>(),
): void {
  if (seenPages.has(rootPage)) return;
  seenPages.add(rootPage);

  const page = readDbPage(rootPage);
  if (!page) return;

  const btreeHeaderOffset = rootPage === 1 ? 100 : 0;
  const pageType = page[btreeHeaderOffset];
  if (pageType !== 0x05 && pageType !== 0x0d) return;

  const cellCount = page.readUInt16BE(btreeHeaderOffset + 3);
  const cellPointerOffset = getCellPointerOffset(pageType, btreeHeaderOffset);

  if (pageType === 0x05) {
    for (let i = 0; i < cellCount; i++) {
      const pointerOffset = cellPointerOffset + i * 2;
      if (pointerOffset + 2 > page.length) break;
      const cellOffset = page.readUInt16BE(pointerOffset);
      if (cellOffset + 4 > page.length) continue;
      collectTableLeafRecords(readDbPage, page.readUInt32BE(cellOffset), onRecord, seenPages);
    }

    const rightMostPage = page.readUInt32BE(btreeHeaderOffset + 8);
    collectTableLeafRecords(readDbPage, rightMostPage, onRecord, seenPages);
    return;
  }

  for (let i = 0; i < cellCount; i++) {
    const pointerOffset = cellPointerOffset + i * 2;
    if (pointerOffset + 2 > page.length) break;
    const record = readTableLeafRecord(page, page.readUInt16BE(pointerOffset));
    if (record && !onRecord(record)) return;
  }
}

function findTableRootPage(
  readDbPage: (pageNumber: number) => Buffer | null,
  tableName: string,
): number | null {
  let rootPage: number | null = null;
  collectTableLeafRecords(readDbPage, 1, (record) => {
    const [type, name, , page] = record;
    if (type === "table" && name === tableName && typeof page === "number" && page > 0) {
      rootPage = page;
      return false;
    }
    return true;
  });
  return rootPage;
}

function findItemTableRootPage(readDbPage: (pageNumber: number) => Buffer | null): number | null {
  return findTableRootPage(readDbPage, "ItemTable");
}

export function readTableKeyValue(dbPath: string, tableName: string, key: string): string | null {
  const fd = openSync(dbPath, "r");
  let walIndex: WalIndex | null = null;
  try {
    const header = Buffer.alloc(100);
    readSync(fd, header, 0, header.length, 0);
    if (header.toString("utf8", 0, 16) !== "SQLite format 3\0") {
      return null;
    }

    const pageSize = getSqlitePageSize(header);
    walIndex = indexWalFile(dbPath, pageSize);
    const readDbPage = (pageNumber: number) => readPage(fd, walIndex, pageNumber, pageSize);
    const rootPage = findTableRootPage(readDbPage, tableName);
    if (rootPage === null) return null;

    let found: string | null = null;
    collectTableLeafRecords(readDbPage, rootPage, (record) => {
      if (record.length < 2) return true;
      const [recordKey, value] = record;
      if (recordKey === key && typeof value === "string") {
        found = value;
        return false;
      }
      return true;
    });
    return found;
  } catch {
    return null;
  } finally {
    if (walIndex) closeSync(walIndex.fd);
    closeSync(fd);
  }
}

export function readCursorAuthValuesFromDb(dbPath: string): CursorAuthValues {
  const fd = openSync(dbPath, "r");
  let walIndex: WalIndex | null = null;
  try {
    const header = Buffer.alloc(100);
    readSync(fd, header, 0, header.length, 0);

    if (header.toString("utf8", 0, 16) !== "SQLite format 3\0") {
      throw new Error("Invalid SQLite database header");
    }

    const pageSize = getSqlitePageSize(header);
    walIndex = indexWalFile(dbPath, pageSize);
    const readDbPage = (pageNumber: number) => readPage(fd, walIndex, pageNumber, pageSize);
    const itemTableRootPage = findItemTableRootPage(readDbPage);
    if (itemTableRootPage === null) {
      throw new Error("Could not find ItemTable root page");
    }

    const remainingKeys = new Set<CursorAuthKey>(CURSOR_AUTH_KEYS);
    const values: CursorAuthValues = {};

    collectTableLeafRecords(readDbPage, itemTableRootPage, (record) => {
      if (record.length < 2) return true;
      const [key, value] = record;
      if (typeof key === "string" && typeof value === "string" && remainingKeys.has(key as CursorAuthKey)) {
        const authKey = key as CursorAuthKey;
        values[authKey] = value;
        remainingKeys.delete(authKey);
      }
      return remainingKeys.size > 0;
    });

    return values;
  } finally {
    if (walIndex) closeSync(walIndex.fd);
    closeSync(fd);
  }
}
