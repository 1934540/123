import { inflateRawSync } from "node:zlib"
import { hashPassword } from "@/lib/password"

export type ImportedEmployee = {
  uid: string
  public_id: string
  name: string
  username: string
  password: string
  organization: string | null
  department: string | null
  role: "employee"
}

type ParsedRow = Record<string, string>

const HEADER_ALIASES = {
  name: ["name", "full name", "employee", "fio", "имя", "фио", "сотрудник", "аты"],
  username: ["username", "login", "user", "логин", "пользователь"],
  password: ["password", "pass", "пароль", "құпиясөз"],
  organization: ["organization", "company", "org", "организация", "компания", "ұйым"],
  department: ["department", "dept", "отдел", "бөлім"],
} as const

export async function parseEmployeeImport(file: File): Promise<{
  employees: ImportedEmployee[]
  skipped: number
}> {
  const bytes = Buffer.from(await file.arrayBuffer())
  const fileName = file.name.toLowerCase()
  const rows = fileName.endsWith(".xlsx") ? parseXlsx(bytes) : parseDelimited(bytes.toString("utf8"))

  const employees: ImportedEmployee[] = []
  let skipped = 0

  for (const row of rows) {
    const name = field(row, HEADER_ALIASES.name)
    const username = field(row, HEADER_ALIASES.username).toLowerCase().replace(/\s+/g, "")
    const password = field(row, HEADER_ALIASES.password)
    const organization = field(row, HEADER_ALIASES.organization)
    const department = field(row, HEADER_ALIASES.department)

    if (!name || !username || !password) {
      skipped += 1
      continue
    }

    const suffix = Math.random().toString(36).slice(2, 7).toUpperCase()
    employees.push({
      uid: `EMP-${suffix}`,
      public_id: username.toUpperCase(),
      name,
      username,
      password: hashPassword(password),
      organization: organization || null,
      department: department || null,
      role: "employee",
    })
  }

  return { employees, skipped }
}

function field(row: ParsedRow, aliases: readonly string[]): string {
  for (const alias of aliases) {
    const value = row[normalizeHeader(alias)]
    if (value) return value.trim()
  }
  return ""
}

function parseDelimited(text: string): ParsedRow[] {
  const delimiter = text.includes("\t") ? "\t" : ";"
  const rows = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => splitDelimitedLine(line, delimiter))
    .filter((row) => row.some(Boolean))

  return rowsToObjects(rows)
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = []
  let current = ""
  let quoted = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (char === '"' && line[i + 1] === '"') {
      current += '"'
      i += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim())
      current = ""
    } else {
      current += char
    }
  }

  cells.push(current.trim())
  return cells
}

function parseXlsx(bytes: Buffer): ParsedRow[] {
  const entries = unzipEntries(bytes)
  const sheet = entries.get("xl/worksheets/sheet1.xml")
  if (!sheet) return []

  const sharedStrings = parseSharedStrings(entries.get("xl/sharedStrings.xml")?.toString("utf8") ?? "")
  const xml = sheet.toString("utf8")
  const rows: string[][] = []

  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = []
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cellMatch[1]
      const body = cellMatch[2]
      const ref = attrs.match(/\br="([A-Z]+)\d+"/)?.[1]
      const index = ref ? columnIndex(ref) : cells.length
      const type = attrs.match(/\bt="([^"]+)"/)?.[1]
      cells[index] = cellValue(type, body, sharedStrings)
    }
    if (cells.some(Boolean)) rows.push(cells.map((cell) => cell ?? ""))
  }

  return rowsToObjects(rows)
}

function parseSharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) =>
    [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((textMatch) => decodeXml(textMatch[1])).join(""),
  )
}

function cellValue(type: string | undefined, body: string, sharedStrings: string[]): string {
  if (type === "s") {
    const index = Number(body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? -1)
    return sharedStrings[index] ?? ""
  }
  if (type === "inlineStr") {
    return decodeXml(body.match(/<t\b[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? "")
  }
  return decodeXml(body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "")
}

function rowsToObjects(rows: string[][]): ParsedRow[] {
  const [headers, ...dataRows] = rows
  if (!headers) return []
  const normalizedHeaders = headers.map(normalizeHeader)

  return dataRows.map((row) =>
    Object.fromEntries(normalizedHeaders.map((header, index) => [header, String(row[index] ?? "").trim()])),
  )
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, " ")
}

function columnIndex(column: string): number {
  return [...column].reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
}

function unzipEntries(bytes: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>()
  const eocdOffset = findSignature(bytes, 0x06054b50, Math.max(0, bytes.length - 65557))
  if (eocdOffset < 0) return entries

  const totalEntries = bytes.readUInt16LE(eocdOffset + 10)
  let offset = bytes.readUInt32LE(eocdOffset + 16)

  for (let i = 0; i < totalEntries; i += 1) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) break

    const method = bytes.readUInt16LE(offset + 10)
    const compressedSize = bytes.readUInt32LE(offset + 20)
    const fileNameLength = bytes.readUInt16LE(offset + 28)
    const extraLength = bytes.readUInt16LE(offset + 30)
    const commentLength = bytes.readUInt16LE(offset + 32)
    const localOffset = bytes.readUInt32LE(offset + 42)
    const name = bytes.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8")

    const localNameLength = bytes.readUInt16LE(localOffset + 26)
    const localExtraLength = bytes.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize)

    if (method === 0) entries.set(name, compressed)
    if (method === 8) entries.set(name, inflateRawSync(compressed))

    offset += 46 + fileNameLength + extraLength + commentLength
  }

  return entries
}

function findSignature(bytes: Buffer, signature: number, start: number): number {
  for (let i = bytes.length - 4; i >= start; i -= 1) {
    if (bytes.readUInt32LE(i) === signature) return i
  }
  return -1
}
