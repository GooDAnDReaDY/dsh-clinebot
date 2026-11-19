/** Escape one CSV cell: RFC 4180 quoting plus formula neutralization. */
export function csvCell(value) {
  let text = String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
  if (/^[\s\u00a0]*[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}
