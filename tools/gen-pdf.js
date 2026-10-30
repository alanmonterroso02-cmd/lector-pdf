/* Genera un PDF de prueba con 6 páginas y marcadores (índice) */
const fs = require('fs');
const path = require('path');

const LOREM = (
  'El lector de libros debe permitir leer comodamente. Esta es una prueba de ' +
  'renderizado de texto con pdf.js dentro de una aplicacion Android. ' +
  'La lectura nocturna reduce la fatiga visual y el modo sepia imita el papel. ' +
  'Buscar palabras dentro del libro es util para estudiar. '
);

const totalPages = 6;
const objs = []; // objs[i] = contenido del objeto i+1
function add(s) { objs.push(s); return objs.length; }

const catalogId = add('');      // 1
const pagesId = add('');        // 2
const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
const fontBoldId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

const pageIds = [];
const contentIds = [];

for (let p = 1; p <= totalPages; p++) {
  const lines = [];
  lines.push('BT /F2 26 Tf 70 760 Td (Capitulo ' + p + ') Tj ET');
  lines.push('BT /F1 13 Tf 70 720 Td (Lector PDF - documento de prueba) Tj ET');
  let y = 690;
  for (let i = 0; i < 12; i++) {
    const chunk = LOREM.slice(0, 78).replace(/[()\\]/g, ' ');
    lines.push('BT /F1 12 Tf 70 ' + y + ' Td (' + chunk + ') Tj ET');
    y -= 20;
  }
  lines.push('BT /F1 12 Tf 70 ' + y + ' Td (Pagina ' + p + ' de ' + totalPages + '. Palabra clave: lectura.) Tj ET');
  const stream = lines.join('\n');
  const cid = add('<< /Length ' + Buffer.byteLength(stream, 'latin1') + ' >>\nstream\n' + stream + '\nendstream');
  contentIds.push(cid);
  const pid = add(
    '<< /Type /Page /Parent ' + pagesId + ' 0 R /MediaBox [0 0 595 842] ' +
    '/Resources << /Font << /F1 ' + fontId + ' 0 R /F2 ' + fontBoldId + ' 0 R >> >> ' +
    '/Contents ' + cid + ' 0 R >>'
  );
  pageIds.push(pid);
}

objs[pagesId - 1] = '<< /Type /Pages /Kids [' + pageIds.map(i => i + ' 0 R').join(' ') + '] /Count ' + totalPages + ' >>';

const outlineId = add('');
const item1 = add('');
const item2 = add('');
objs[item1 - 1] = '<< /Title (Capitulo 1) /Parent ' + outlineId + ' 0 R /Next ' + item2 + ' 0 R /Dest [' + pageIds[0] + ' 0 R /Fit] >>';
objs[item2 - 1] = '<< /Title (Capitulo 3) /Parent ' + outlineId + ' 0 R /Prev ' + item1 + ' 0 R /Dest [' + pageIds[2] + ' 0 R /Fit] >>';
objs[outlineId - 1] = '<< /Type /Outlines /First ' + item1 + ' 0 R /Last ' + item2 + ' 0 R /Count 2 >>';
objs[catalogId - 1] = '<< /Type /Catalog /Pages ' + pagesId + ' 0 R /Outlines ' + outlineId + ' 0 R >>';

// ensamblado con tabla xref
let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
const offsets = [];
for (let i = 0; i < objs.length; i++) {
  offsets.push(Buffer.byteLength(out, 'latin1'));
  out += (i + 1) + ' 0 obj\n' + objs[i] + '\nendobj\n';
}
const xrefPos = Buffer.byteLength(out, 'latin1');
out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
offsets.forEach(o => { out += String(o).padStart(10, '0') + ' 00000 n \n'; });
out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root ' + catalogId + ' 0 R >>\nstartxref\n' + xrefPos + '\n%%EOF\n';

const dest = path.join(__dirname, 'sample.pdf');
fs.writeFileSync(dest, Buffer.from(out, 'latin1'));
console.log('PDF escrito:', dest, fs.statSync(dest).size, 'bytes');
