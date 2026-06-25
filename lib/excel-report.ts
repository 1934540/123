import { appDateString, formatAppDateTime } from "@/lib/date"

export type ReportCell = string | number | boolean | null | undefined
export type ReportSection = {
  title: string
  headers: string[]
  rows: ReportCell[][]
}

export function currentMonth(): string {
  return appDateString().slice(0, 7)
}

export function normalizeMonth(value: string | null): string {
  if (value && /^\d{4}-\d{2}$/.test(value)) return value
  return currentMonth()
}

export function nextMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number)
  const next = monthNumber === 12 ? { year: year + 1, month: 1 } : { year, month: monthNumber + 1 }
  return `${next.year}-${String(next.month).padStart(2, "0")}`
}

export function formatReportDateTime(value: string | null | undefined): string {
  const formatted = formatAppDateTime(value)
  return formatted === "—" ? "-" : formatted
}

export function excelResponse(title: string, filename: string, headers: string[], rows: ReportCell[][]): Response {
  return excelWorkbookResponse(title, filename, [{ title, headers, rows }])
}

export function excelWorkbookResponse(title: string, filename: string, sections: ReportSection[]): Response {
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    table { border-collapse: collapse; }
    th, td { border: 1px solid #999; padding: 6px 8px; }
    th { background: #e8eef7; font-weight: 700; }
  </style>
</head>
<body>
  <h2>${escapeHtml(title)}</h2>
  ${sections.map(renderSection).join("")}
</body>
</html>`

  return new Response(html, {
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}

function renderSection(section: ReportSection): string {
  return `<h3>${escapeHtml(section.title)}</h3>
  <table>
    <thead>
      <tr>${section.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
    </thead>
    <tbody>
      ${
        section.rows.length
          ? section.rows
              .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell ?? "-")}</td>`).join("")}</tr>`)
              .join("")
          : `<tr><td colspan="${section.headers.length}">Нет данных</td></tr>`
      }
    </tbody>
  </table><br />`
}

function escapeHtml(value: ReportCell): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}
