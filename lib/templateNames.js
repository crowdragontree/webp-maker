// Bot template names follow the .txt file names: "7._My_Template_October_2026_V3.txt" is shown as
// "7. Template name" everywhere (the Bot Builder list, Build Bot, saved bots), and the
// list is in the files' own order: by number first (1, 2, ... 10, 11, not 1, 10, 11, 2), then alphabetically.
const fs = require('fs');
const path = require('path');

function prettyName(file) {
  const base = path.basename(String(file || ''), path.extname(String(file || '')));
  const m = base.match(/^\s*(\d+)\s*[._\s]+\s*(.*)$/);           // "7._", "7__", "7. ", "7_" all become "7. "
  let rest = (m ? m[2] : base).replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
  // the short name: the month and year, "6 Paragraph Test" and a version ("v2", "V9") are left off
  const short = rest.replace(/\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b.*$/i, '')
    .replace(/\s+\d+\s+paragraphs?\s+test\b.*$/i, '').replace(/\s+v\d+(?:\.\d+)*$/i, '').trim();
  if (short) rest = short;
  return m ? `${+m[1]}. ${rest}` : rest;
}
const numberOf = name => { const m = String(name || '').match(/^\s*(\d+)\./); return m ? +m[1] : Infinity; };
function compare(a, b) {
  const na = a && (a.name || prettyName(a.id)), nb = b && (b.name || prettyName(b.id));
  const x = numberOf(na), y = numberOf(nb);
  if (x !== y) return x < y ? -1 : 1;
  return String(na).localeCompare(String(nb), undefined, {numeric: true, sensitivity: 'base'}) || String(a && a.id).localeCompare(String(b && b.id));
}

module.exports = {prettyName, compare, numberOf};
