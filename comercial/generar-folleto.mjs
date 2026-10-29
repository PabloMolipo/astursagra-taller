// Folleto comercial «Taller 360» (A4, 8 páginas). Uso: node folleto-taller360.mjs <salida.pdf>
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
const require = createRequire(path.join(DIR, 'render', 'package.json'));
const PDFDocument = require('pdfkit');
const { geoConicConformal, geoPath } = await import('file:///' + path.join(DIR, 'render', 'node_modules', 'd3-geo', 'src', 'index.js').replace(/\\/g, '/'));

const salida = process.argv[2];
const F = n => path.join(DIR, 'fuente', n);
const ICONOS = path.join(DIR, 'render', 'node_modules', '@tabler', 'icons', 'icons', 'outline');
const GEO = JSON.parse(fs.readFileSync('D:/Proyectos/Taller/frontend/public/geo/comunidades.json', 'utf8'));

// Paleta
const C = {
  negro: '#0a0a0a', carbon: '#141414', carbon2: '#1d1d1d', lima: '#c6ff00', limaTexto: '#5a7d00', limaSuave: '#eef7cc',
  texto: '#16181a', gris: '#56595e', grisClaro: '#8a8d92', fondo: '#f5f6f1', borde: '#e2e4da', blanco: '#ffffff', ambar: '#e89a00', rojo: '#d9473f'
};
const CONTACTO = { telefono: '608 399 505', web: 'www.astursagra.es', email: 'palvarezj@apps-sharepoint.com' };

const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: 'Taller 360 · Gestión completa para talleres', Author: 'Taller 360', Subject: 'Presentación comercial' } });
doc.pipe(fs.createWriteStream(salida));
doc.registerFont('titulo', F('ChakraPetch-Bold.ttf'));
doc.registerFont('titulo2', F('ChakraPetch-SemiBold.ttf'));
doc.registerFont('texto', F('Barlow-Regular.ttf'));
doc.registerFont('medio', F('Barlow-Medium.ttf'));
doc.registerFont('semi', F('Barlow-SemiBold.ttf'));
doc.registerFont('negrita', F('Barlow-Bold.ttf'));

const W = 595.28, H = 841.89, M = 46;

// ---------- utilidades ----------
function icono(nombre, x, y, size, color, grosor = 1.8) {
  const svg = fs.readFileSync(path.join(ICONOS, nombre + '.svg'), 'utf8');
  const s = size / 24;
  doc.save().translate(x, y).scale(s).lineWidth(grosor / s * s).strokeColor(color).lineCap('round').lineJoin('round');
  for (const m of svg.matchAll(/<(path|circle|rect|line|polyline)\b([^>]*)\/?>/g)) {
    const [, tag, attrs] = m;
    const a = Object.fromEntries([...attrs.matchAll(/([\w-]+)="([^"]*)"/g)].map(x => [x[1], x[2]]));
    if (a.stroke === 'none' && tag === 'path' && a.d?.startsWith('M0 0h24v24H0z')) continue;
    if (tag === 'path') { if (a.d.startsWith('M0 0h24v24H0z')) continue; doc.path(a.d).stroke(); }
    else if (tag === 'circle') doc.circle(+a.cx, +a.cy, +a.r).stroke();
    else if (tag === 'rect') { if (+a.rx) doc.roundedRect(+a.x, +a.y, +a.width, +a.height, +a.rx).stroke(); else doc.rect(+a.x, +a.y, +a.width, +a.height).stroke(); }
    else if (tag === 'line') doc.moveTo(+a.x1, +a.y1).lineTo(+a.x2, +a.y2).stroke();
    else if (tag === 'polyline') { const p = a.points.trim().split(/[\s,]+/).map(Number); doc.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) doc.lineTo(p[i], p[i + 1]); doc.stroke(); }
  }
  doc.restore();
}

function rayas(x, y, w, h, color, paso = 9, radio = 0) {
  doc.save(); (radio ? doc.roundedRect(x, y, w, h, radio) : doc.rect(x, y, w, h)).clip(); doc.lineWidth(2.2).strokeColor(color);
  for (let i = -h; i < w; i += paso) doc.moveTo(x + i, y + h).lineTo(x + i + h, y).stroke();
  doc.restore();
}

function logo(x, y, r, oscuro = true) {
  doc.save();
  doc.circle(x, y, r).fill(oscuro ? C.negro : C.blanco);
  doc.circle(x, y, r).lineWidth(r * 0.12).strokeColor(C.lima).stroke();
  // Arco de «vuelta completa» con punta de flecha
  doc.lineWidth(r * 0.07).strokeColor(oscuro ? C.blanco : C.texto);
  const a0 = -0.6 * Math.PI, a1 = 1.25 * Math.PI, rr = r * 0.72;
  doc.moveTo(x + rr * Math.cos(a0), y + rr * Math.sin(a0));
  for (let t = 1; t <= 40; t++) { const a = a0 + (a1 - a0) * t / 40; doc.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)); }
  doc.stroke();
  const ax = x + rr * Math.cos(a1), ay = y + rr * Math.sin(a1);
  doc.polygon([ax + r * 0.16, ay + r * 0.02], [ax - r * 0.06, ay - r * 0.14], [ax - r * 0.02, ay + r * 0.16]).fill(oscuro ? C.blanco : C.texto);
  doc.font('titulo').fontSize(r * 0.62).fillColor(C.lima).text('360', x - r, y - r * 0.36, { width: 2 * r, align: 'center', lineBreak: false });
  doc.restore();
}

function marca(x, y, tam, oscuro = true) {
  doc.font('titulo').fontSize(tam).fillColor(oscuro ? C.blanco : C.texto).text('TALLER', x, y, { continued: true, lineBreak: false })
    .fillColor(oscuro ? C.lima : C.limaTexto).text(' 360', { lineBreak: false });
}

function cabecera(numero, kicker, titulo, entradilla) {
  doc.rect(0, 0, W, H).fill(C.fondo);
  doc.rect(0, 0, W, 6).fill(C.lima);
  // Pie
  doc.rect(0, H - 34, W, 34).fill(C.negro);
  logo(M + 9, H - 17, 9);
  doc.font('titulo2').fontSize(8.5).fillColor(C.blanco).text('TALLER 360', M + 24, H - 21.5, { lineBreak: false });
  doc.font('texto').fontSize(8).fillColor('#b5b8bc').text(`${CONTACTO.telefono}  ·  ${CONTACTO.web}`, 0, H - 21, { width: W - M, align: 'right', lineBreak: false });
  doc.font('titulo').fontSize(9).fillColor(C.limaTexto).text(`${String(numero).padStart(2, '0')} · ${kicker.toUpperCase()}`, M, 40, { characterSpacing: 1.2 });
  doc.font('titulo').fontSize(25).fillColor(C.texto).text(titulo.toUpperCase(), M, 56, { width: W - 2 * M, lineGap: -2 });
  let y = doc.y + 6;
  if (entradilla) {
    doc.font('texto').fontSize(11.5).fillColor(C.gris).text(entradilla, M, y, { width: W - 2 * M, lineGap: 2 });
    y = doc.y + 14;
  }
  return y;
}

function tarjeta(x, y, w, h, ico, titulo, texto, opciones = {}) {
  doc.roundedRect(x, y, w, h, 6).fill(opciones.oscura ? C.carbon : C.blanco);
  if (!opciones.oscura) doc.roundedRect(x, y, w, h, 6).lineWidth(0.8).strokeColor(C.borde).stroke();
  doc.rect(x, y + 10, 3, 22).fill(C.lima);
  doc.circle(x + 30, y + 26, 15).fill(opciones.oscura ? C.carbon2 : C.limaSuave);
  icono(ico, x + 21, y + 17, 18, opciones.oscura ? C.lima : C.limaTexto);
  doc.font('semi').fontSize(12).fillColor(opciones.oscura ? C.blanco : C.texto).text(titulo, x + 54, y + 18, { width: w - 64 });
  const ty = Math.max(doc.y + 4, y + 46);
  doc.font('texto').fontSize(9.6).fillColor(opciones.oscura ? '#c9ccd0' : C.gris).text(texto, x + 16, ty, { width: w - 30, lineGap: 1.6 });
}

function vinetas(items, x, y, w, color = C.texto) {
  for (const t of items) {
    doc.circle(x + 3, y + 6, 2.6).fill(C.limaTexto);
    const [neg, ...resto] = t.split('|');
    if (resto.length) doc.font('semi').fontSize(10.5).fillColor(color).text(neg, x + 13, y, { width: w - 13, continued: true, lineGap: 1.5 }).font('texto').fillColor(C.gris).text(' ' + resto.join('|'));
    else doc.font('texto').fontSize(10.5).fillColor(color).text(t, x + 13, y, { width: w - 13, lineGap: 1.5 });
    y = doc.y + 6;
  }
  return y;
}

function flujo(y, titulo, pasos) {
  const ancho = W - 2 * M, alto = 104;
  doc.roundedRect(M, y, ancho, alto, 8).fill(C.blanco);
  doc.roundedRect(M, y, ancho, alto, 8).lineWidth(0.8).strokeColor(C.borde).stroke();
  doc.font('titulo').fontSize(9).fillColor(C.limaTexto).text(titulo, M + 16, y + 12, { characterSpacing: 1 });
  const pw = (ancho - 32) / pasos.length;
  pasos.forEach(([ic, t, d], i) => {
    const px = M + 16 + i * pw, cx = px + pw / 2;
    doc.circle(cx, y + 44, 14).fill(C.negro);
    icono(ic, cx - 9, y + 35, 18, C.lima);
    if (i < pasos.length - 1) doc.moveTo(cx + 20, y + 44).lineTo(cx + pw - 20, y + 44).lineWidth(1).dash(2, { space: 2 }).strokeColor(C.limaTexto).stroke().undash();
    doc.font('semi').fontSize(9.2).fillColor(C.texto).text(t, px + 2, y + 64, { width: pw - 4, align: 'center' });
    doc.font('texto').fontSize(8).fillColor(C.gris).text(d, px + 2, doc.y + 1, { width: pw - 4, align: 'center' });
  });
}

function destacado(y, ic, titulo, texto) {
  const ancho = W - 2 * M;
  doc.font('texto').fontSize(10.5);
  const alto = 46 + doc.heightOfString(texto, { width: ancho - 92, lineGap: 2 });
  doc.roundedRect(M, y, ancho, alto, 8).fill(C.negro);
  rayas(M, y, ancho, alto, '#141414', 10, 8);
  doc.circle(M + 36, y + alto / 2, 20).fill(C.carbon2);
  icono(ic, M + 24, y + alto / 2 - 12, 24, C.lima);
  doc.font('titulo').fontSize(13).fillColor(C.lima).text(titulo.toUpperCase(), M + 70, y + 16, { width: ancho - 92 });
  doc.font('texto').fontSize(10.5).fillColor('#d5d8dc').text(texto, M + 70, doc.y + 4, { width: ancho - 92, lineGap: 2 });
}

function ecuacion(y, terminos, resultado) {
  const ancho = W - 2 * M, alto = 76;
  doc.roundedRect(M, y, ancho, alto, 8).fill(C.limaSuave);
  doc.font('titulo').fontSize(9).fillColor(C.limaTexto).text('ASÍ SE CALCULA (EJEMPLO)', M + 16, y + 10, { characterSpacing: 1 });
  const cajas = [...terminos, resultado], n = cajas.length, op = 18;
  const cw = (ancho - 32 - op * (n - 1)) / n;
  cajas.forEach(([k, v], i) => {
    const cx = M + 16 + i * (cw + op), cy = y + 26, final = i === n - 1;
    doc.roundedRect(cx, cy, cw, 38, 5).fill(final ? C.negro : C.blanco);
    doc.font('semi').fontSize(7.5).fillColor(final ? '#b5b8bc' : C.gris).text(k.toUpperCase(), cx + 8, cy + 6, { width: cw - 16, lineBreak: false });
    doc.font('titulo').fontSize(13).fillColor(final ? C.lima : C.texto).text(v, cx + 8, cy + 18, { width: cw - 16, lineBreak: false });
    if (i < n - 1) doc.font('titulo').fontSize(16).fillColor(C.limaTexto).text(i === n - 2 ? '=' : '−', cx + cw, cy + 9, { width: op, align: 'center', lineBreak: false });
  });
}

function panel(x, y, w, h, titulo) {
  doc.roundedRect(x, y, w, h, 8).fill(C.carbon);
  rayas(x, y, w, h, '#181818', 10, 8);
  doc.roundedRect(x, y, w, h, 8).lineWidth(0.8).strokeColor('#2a2a2a').stroke();
  if (titulo) doc.font('titulo2').fontSize(8).fillColor(C.lima).text(titulo.toUpperCase(), x + 12, y + 10, { characterSpacing: 1 });
}

// ---------- maquetas ----------
function maquetaTablero(x, y, w, h) {
  panel(x, y, w, h, 'Tablero del taller');
  const cols = [['Recibido', '#8a8a8a', 2], ['Diagnóstico', '#4da3ff', 1], ['Presupuestado', '#b07cff', 1], ['Reparación', '#ff8a1f', 3], ['Listo', C.lima, 2]];
  const cw = (w - 24 - 4 * 6) / 5;
  cols.forEach(([nombre, color, n], i) => {
    const cx = x + 12 + i * (cw + 6), cy = y + 28;
    doc.rect(cx, cy, cw, h - 40).fill('#101010');
    doc.rect(cx, cy, cw, 2.5).fill(color);
    doc.font('semi').fontSize(6.5).fillColor('#d8d8d8').text(nombre.toUpperCase(), cx + 4, cy + 6, { width: cw - 8, lineBreak: false });
    for (let k = 0; k < n; k++) {
      const ky = cy + 20 + k * 38;
      doc.rect(ky > cy + h - 80 ? cx : cx + 3, ky, cw - 6, 33).fill('#1c1c1c');
      doc.rect(cx + 3, ky, 2, 33).fill(k === 0 && i === 3 ? C.rojo : k === 1 && i === 1 ? C.ambar : '#1c1c1c');
      doc.font('titulo').fontSize(6.5).fillColor(C.lima).text(['1234 KLM', '5678 HJD', '9012 LPB', '3456 MNB', '7890 GTR', '2468 JKS', '1357 LBC', '8642 FDR', '4321 PKZ', '6543 HHT', '9876 BCD', '1122 KXT'][(i * 3 + k) % 12], cx + 8, ky + 5, { lineBreak: false });
      doc.rect(cx + 8, ky + 15, cw * 0.55, 3).fill('#3a3a3a');
      doc.rect(cx + 8, ky + 22, cw * 0.4, 3).fill('#2c2c2c');
    }
  });
}

function maqueta360(x, y, w, h) {
  panel(x, y, w, h, 'Ficha del vehículo 360°');
  const cx = x + w / 2, cy = y + h / 2 + 6;
  doc.save().dash(3, { space: 3 }).lineWidth(0.8).strokeColor('#3d4d10').ellipse(cx, cy, w * 0.3, h * 0.36).stroke().undash().restore();
  // Coche (silueta)
  const s = w / 420 * 0.42, ox = cx - 210 * s, oy = cy - 75 * s;
  doc.save().translate(ox, oy).scale(s).lineWidth(2.4 / s * s * 2.5).strokeColor(C.lima)
    .path('M18 112 L26 86 Q34 74 66 70 L132 64 Q168 34 214 30 L270 30 Q302 32 334 64 L374 72 Q398 78 402 96 L404 112 Z').fillAndStroke('#161616', C.lima)
    .circle(100, 114, 27).fillAndStroke('#0a0a0a', C.lima).circle(322, 114, 27).fillAndStroke('#0a0a0a', C.lima).restore();
  const bloques = [['Identificación', 0.04, 0.2], ['Uso', 0.04, 0.5], ['Diagnóstico', 0.04, 0.8], ['Propietario', 0.73, 0.2], ['Historial', 0.73, 0.5], ['REPRO', 0.73, 0.8]];
  for (const [t, fx, fy] of bloques) {
    const bx = x + w * fx, by = y + h * fy - 12, bw = w * 0.23;
    doc.rect(bx, by, bw, 24).fill('#1c1c1c');
    doc.font('semi').fontSize(6.5).fillColor('#9a9a9a').text(t.toUpperCase(), bx + 5, by + 4, { lineBreak: false });
    doc.rect(bx + 5, by + 14, bw * 0.6, 3).fill('#3a3a3a');
    const lx = fx < 0.5 ? bx + bw : bx;
    doc.moveTo(lx, by + 12).lineTo(fx < 0.5 ? lx + 8 : lx - 8, by + 12).lineWidth(0.8).strokeColor(C.lima).stroke();
  }
}

function maquetaCliente(x, y, w, h) {
  panel(x, y, w, h, 'Área de cliente · móvil');
  const px = x + w / 2 - 70, py = y + 28, pw = 140, ph = h - 40;
  doc.roundedRect(px, py, pw, ph, 14).fill('#050505');
  doc.roundedRect(px + 6, py + 8, pw - 12, ph - 16, 9).fill('#121212');
  doc.font('titulo').fontSize(9).fillColor(C.blanco).text('HOLA, LAURA', px + 14, py + 18, { lineBreak: false });
  doc.font('texto').fontSize(6.5).fillColor('#a0a0a0').text('Tu coche está en reparación', px + 14, py + 31, { lineBreak: false });
  const pasos = ['Recibido', 'Diagnóstico', 'Presupuesto', 'Reparación', 'Listo'];
  pasos.forEach((p, i) => {
    const sy = py + 48 + i * 17;
    doc.circle(px + 20, sy + 4, 4.5).fill(i < 3 ? C.lima : i === 3 ? C.ambar : '#333');
    doc.font(i === 3 ? 'semi' : 'texto').fontSize(7).fillColor(i <= 3 ? '#e8e8e8' : '#777').text(p, px + 30, sy, { lineBreak: false });
  });
  const by = py + 140;
  doc.rect(px + 12, by, pw - 24, 34).fill('#1c1c1c');
  doc.font('semi').fontSize(6.5).fillColor('#9a9a9a').text('DIAGNOSIS', px + 17, by + 5, { lineBreak: false });
  doc.rect(px + 17, by + 16, 30, 9).fill('#3a1515'); doc.font('titulo').fontSize(5.5).fillColor('#ff8a80').text('P0401', px + 19, by + 18, { lineBreak: false });
  doc.rect(px + 52, by + 16, 30, 9).fill('#3a2c08'); doc.font('titulo').fontSize(5.5).fillColor('#ffc24d').text('P0299', px + 54, by + 18, { lineBreak: false });
  doc.rect(px + 12, by + 40, (pw - 30) / 3, 26).fill('#2a2a2a'); doc.rect(px + 15 + (pw - 30) / 3, by + 40, (pw - 30) / 3, 26).fill('#2a2a2a'); doc.rect(px + 18 + 2 * (pw - 30) / 3, by + 40, (pw - 30) / 3, 26).fill('#2a2a2a');
  icono('photo', px + 24, by + 46, 12, '#8a8a8a'); icono('video', px + 25 + (pw - 30) / 3, by + 46, 12, '#8a8a8a'); icono('file-text', px + 28 + 2 * (pw - 30) / 3, by + 46, 12, '#8a8a8a');
}

function maquetaMapa(x, y, w, h) {
  panel(x, y, w, h, 'Visitas a tu web · mapa de España');
  const peninsula = { type: 'FeatureCollection', features: GEO.features.filter(f => f.properties.codigo !== '05') };
  const proy = geoConicConformal().rotate([3.5, 0]).parallels([37, 43]).fitExtent([[x + 14, y + 30], [x + w - 14, y + h - 12]], peninsula);
  const ruta = geoPath(proy);
  const intensidad = { '08': 1, '13': 0.75, '01': 0.4, '07': 0.3, '10': 0.2, '12': 0.12, '06': 0.12, '16': 0.1 };
  const mezcla = t => { const a = [0x1d, 0x1d, 0x1d], b = [0xb8, 0xef, 0x00]; return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
  for (const f of peninsula.features) {
    const d = ruta(f); if (!d) continue;
    doc.path(d).fillColor(mezcla(intensidad[f.properties.codigo] ?? 0.05)).fill();
    doc.path(d).lineWidth(0.4).strokeColor(C.carbon).stroke();
  }
  for (const [lon, lat, r] of [[-3.7, 40.42, 6], [-3.84, 40.13, 7.5], [-3.7, 42.34, 3], [-4.42, 36.72, 3.5], [-0.38, 39.47, 3]]) {
    const [px, py] = proy([lon, lat]);
    doc.circle(px, py, r).fillOpacity(0.85).fillAndStroke(C.lima, C.carbon).fillOpacity(1);
  }
}

function maquetaConta(x, y, w, h) {
  panel(x, y, w, h, 'Contabilidad · ejemplo');
  const kpis = [['Facturado', '8.420 €', C.blanco], ['Cobrado', '7.960 €', C.lima], ['Beneficio', '3.115 €', C.lima]];
  const kw = (w - 24 - 12) / 3;
  kpis.forEach(([k, v, c], i) => {
    const kx = x + 12 + i * (kw + 6);
    doc.rect(kx, y + 28, kw, 40).fill('#1c1c1c'); doc.rect(kx, y + 28, 2, 40).fill(i === 2 ? C.lima : '#3a3a3a');
    doc.font('semi').fontSize(6).fillColor('#9a9a9a').text(k.toUpperCase(), kx + 7, y + 34, { lineBreak: false });
    doc.font('titulo').fontSize(13).fillColor(c).text(v, kx + 7, y + 45, { lineBreak: false });
  });
  const base = y + h - 16, top = y + 84, n = 12, gw = (w - 24) / n;
  const f = [0.35, 0.42, 0.38, 0.5, 0.55, 0.48, 0.62, 0.58, 0.7, 0.66, 0.78, 0.9], g = [0.2, 0.22, 0.25, 0.24, 0.3, 0.27, 0.3, 0.28, 0.33, 0.31, 0.35, 0.37];
  for (let i = 0; i < n; i++) {
    const bx = x + 12 + i * gw + gw * 0.18, bw = gw * 0.3;
    doc.rect(bx, base - (base - top) * f[i], bw, (base - top) * f[i]).fill('#729f00');
    doc.rect(bx + bw + 1.5, base - (base - top) * g[i], bw, (base - top) * g[i]).fill('#3b82e6');
  }
  doc.moveTo(x + 12, base).lineTo(x + w - 12, base).lineWidth(0.6).strokeColor('#3a3a3a').stroke();
}

// ================= 1. PORTADA =================
doc.rect(0, 0, W, H).fill(C.negro);
rayas(0, 0, W, H, '#121212', 11);
doc.rect(0, 0, W, 8).fill(C.lima);
logo(M + 34, 112, 34);
doc.font('titulo').fontSize(10).fillColor(C.lima).text('SOFTWARE DE GESTIÓN PARA TALLERES', M + 84, 92, { characterSpacing: 1.6 });
marca(M + 84, 106, 30);
doc.font('titulo').fontSize(40).fillColor(C.blanco).text('TODO TU TALLER,', M, 205, { lineGap: -6 });
doc.text('EN UN SOLO SITIO.', { lineGap: -6 });
doc.fillColor(C.lima).text('EN EL MÓVIL Y EN', { lineGap: -6 }).text('EL ORDENADOR.');
doc.font('texto').fontSize(13.5).fillColor('#c9ccd0').text('Órdenes de trabajo, clientes, vehículos, diagnóstico, despiece original, área de cliente, web con tu marca y contabilidad. Pensado por y para un taller real.', M, doc.y + 16, { width: 330, lineGap: 3 });
maquetaTablero(M, 520, W - 2 * M, 190);
const chips = ['Tablero', 'Órdenes', 'Ficha 360°', 'Diagnóstico', 'IA', 'Despiece OEM', 'Área de cliente', 'Web', 'Contabilidad'];
let chx = M, chy = 728;
doc.font('semi').fontSize(9);
for (const c of chips) {
  const cw = doc.widthOfString(c) + 18;
  if (chx + cw > W - M) { chx = M; chy += 22; }
  doc.roundedRect(chx, chy, cw, 17, 3).lineWidth(0.8).strokeColor('#3d4d10').stroke();
  doc.fillColor('#e4f7a8').text(c, chx + 9, chy + 4, { lineBreak: false });
  chx += cw + 6;
}
doc.font('texto').fontSize(9).fillColor('#8a8d92').text('Desarrollado y usado a diario en AsturSagra, taller mecánico en La Sagra (Toledo).', M, H - 40, { width: W - 2 * M });

// ================= 2. QUÉ INCLUYE =================
doc.addPage();
let y = cabecera(1, 'La solución', 'Deja los papeles, el Excel y los mensajes sueltos',
  'Taller 360 reúne en una sola aplicación web todo lo que pasa en el taller: desde que entra un coche hasta que se cobra, con el historial completo de cada cliente y vehículo, y una web y un área privada para tus clientes.');
const modulos = [
  ['layout-kanban', 'Tablero del taller', 'Todos los coches en reparación de un vistazo, con fechas, retrasos y pendientes de cobro.'],
  ['clipboard-list', 'Órdenes de trabajo', 'Mano de obra y piezas, fotos y vídeos desde el móvil, presupuesto y proforma en PDF.'],
  ['car', 'Ficha 360° del vehículo', 'Identificación, uso, historial, averías y reprogramaciones agrupados alrededor del coche.'],
  ['stethoscope', 'Diagnóstico', 'Códigos de avería con descripción, mediciones con valores de referencia, pruebas e informes.'],
  ['message-chatbot', 'Mecánico virtual con IA', 'Un asistente que ya conoce la orden y el vehículo y te ayuda a encontrar la avería.'],
  ['puzzle', 'Despiece original', 'Esquemas y referencias OEM por bastidor, con acceso directo a tiendas de recambios.'],
  ['user-circle', 'Área de cliente', 'Cada cliente ve el estado de su reparación, fotos, diagnosis, documentos e importes.'],
  ['world-www', 'Web con tu marca', 'Web pública con tus servicios y trabajos realizados, en tu propio dominio, con estadísticas.'],
  ['chart-bar', 'Contabilidad', 'Facturado, cobrado, pendiente, gastos con foto del ticket y beneficio real descontando piezas.']
];
const tw = (W - 2 * M - 2 * 12) / 3, th = 128;
modulos.forEach(([ic, t, d], i) => tarjeta(M + (i % 3) * (tw + 12), y + Math.floor(i / 3) * (th + 12), tw, th, ic, t, d));
y += 3 * (th + 12) + 8;
doc.roundedRect(M, y, W - 2 * M, 86, 8).fill(C.negro);
rayas(M, y, W - 2 * M, 86, '#141414', 10, 8);
doc.font('titulo').fontSize(13).fillColor(C.lima).text('SIN INSTALAR NADA', M + 20, y + 16);
doc.font('texto').fontSize(10.5).fillColor('#d5d8dc').text('Funciona en el navegador del ordenador, la tableta y el móvil del mecánico. Tus datos están en la nube, con copias de seguridad y conexión segura (HTTPS), y puedes entrar desde el taller o desde casa.', M + 20, y + 36, { width: W - 2 * M - 40, lineGap: 2 });

// ================= 3. DÍA A DÍA =================
doc.addPage();
y = cabecera(2, 'El día a día', 'Cada coche, cada orden, bajo control',
  'El tablero es la página de inicio: los coches del taller ordenados por estado, con lo más urgente arriba. Se mueven arrastrando o con un toque desde el móvil.');
maquetaTablero(M, y, W - 2 * M, 200);
y += 216;
const col = (W - 2 * M - 20) / 2;
doc.font('titulo').fontSize(12).fillColor(C.texto).text('ÓRDENES DE TRABAJO', M, y);
let y1 = vinetas([
  'Fotos y vídeos|desde la cámara del móvil o del ordenador, por etapas (recepción, diagnóstico, reparación, entrega).',
  'Presupuesto y proforma|en PDF con tus datos, listos para enviar por WhatsApp o email.',
  'Mano de obra y piezas|con precio para el cliente y coste real, para saber el margen de cada orden.',
  'Pagado o pendiente|con fecha de pago y de entrega; avisos de lo que falta por cobrar.',
  'Histórico|carga tus reparaciones antiguas con sus fechas reales.'
], M, y + 20, col);
doc.font('titulo').fontSize(12).fillColor(C.texto).text('CLIENTES Y VEHÍCULOS', M + col + 20, y);
let y2 = vinetas([
  'Ficha 360° del vehículo|con imagen del modelo generada por IA en su color, uso, historial y averías.',
  'Datos por matrícula|bastidor, motorización y fecha de matriculación en un clic (servicio opcional).',
  'Kilómetros u horas|para turismos, motos, furgonetas, camiones, tractores y maquinaria agrícola.',
  'Importación|de tus clientes y vehículos desde Excel al empezar.'
], M + col + 20, y + 20, col);
y = Math.max(y1, y2) + 8;
maqueta360(M, y, W - 2 * M, H - 34 - 18 - y);

// ================= 4. TÉCNICO =================
doc.addPage();
y = cabecera(3, 'Herramientas técnicas', 'Menos tiempo buscando, más tiempo reparando',
  'Todo lo que el mecánico necesita para diagnosticar y pedir piezas, sin salir de la orden de trabajo.');
const tecnicas = [
  ['stethoscope', 'Ficha de diagnosis', 'Códigos de avería con su descripción y estado (activo, intermitente, resuelto), mediciones comparadas con valores de referencia, pruebas realizadas, conclusión e informes adjuntos de la máquina de diagnosis.'],
  ['message-chatbot', 'Mecánico virtual con IA', 'Un chat dentro de cada orden que ya conoce el vehículo, el código de motor y la diagnosis. Sugiere causas probables, comprobaciones y procedimientos en el lenguaje del taller.'],
  ['puzzle', 'Despiece original por bastidor', 'Grupos, esquemas con posiciones y referencias de fabricante para el vehículo exacto. Cada referencia enlaza con la búsqueda en Autodoc para comparar precios.'],
  ['books', 'Documentación técnica', 'Esquemas eléctricos, manuales y procedimientos organizados por marca y modelo, enlazados a cada vehículo y a mano desde la orden.'],
  ['cpu', 'Reprogramaciones (ECU)', 'Archivos de cada reprogramación vinculados al vehículo del cliente, con visor y comparador hexadecimal de archivos .bin.'],
  ['id-badge-2', 'Datos por matrícula', 'Bastidor, versión, motorización y fecha de matriculación a partir de la matrícula, para rellenar la ficha sin errores.']
];
const th2 = 136;
tecnicas.forEach(([ic, t, d], i) => tarjeta(M + (i % 2) * ((W - 2 * M - 12) / 2 + 12), y + Math.floor(i / 2) * (th2 + 12), (W - 2 * M - 12) / 2, th2, ic, t, d));
y += 3 * (th2 + 12) + 4;
doc.roundedRect(M, y, W - 2 * M, 58, 6).fill(C.limaSuave);
icono('info-circle', M + 14, y + 17, 22, C.limaTexto);
doc.font('texto').fontSize(9.5).fillColor(C.gris).text('El despiece por bastidor, los datos por matrícula, el mecánico virtual y la documentación en SharePoint son integraciones opcionales que usan servicios externos con su propia suscripción. Te ayudamos a elegir y configurar las que te interesen.', M + 46, y + 12, { width: W - 2 * M - 62, lineGap: 1.5 });
y += 76;
flujo(y, 'UNA AVERÍA, DE PRINCIPIO A FIN', [
  ['stethoscope', 'Lees los códigos', 'y anotas mediciones en la ficha'],
  ['message-chatbot', 'Consultas la IA', 'con el contexto de la orden'],
  ['puzzle', 'Buscas la pieza', 'en el despiece por bastidor'],
  ['shopping-cart', 'Comparas precios', 'en Autodoc con un clic'],
  ['clipboard-check', 'Cierras la orden', 'con el coste real de la pieza']
]);

// ================= 5. CLIENTE Y WEB =================
doc.addPage();
y = cabecera(4, 'Tus clientes', 'Clientes informados, sin llamadas',
  'Cada cliente tiene su área privada para seguir la reparación, y tu taller una web propia para captar clientes nuevos.');
const mh = 270;
maquetaCliente(M, y, (W - 2 * M - 14) * 0.48, mh);
maquetaMapa(M + (W - 2 * M - 14) * 0.48 + 14, y, (W - 2 * M - 14) * 0.52, mh);
y += mh + 18;
doc.font('titulo').fontSize(12).fillColor(C.texto).text('ÁREA DE CLIENTE', M, y);
y1 = vinetas([
  'Estado de la reparación|paso a paso, con fecha prevista.',
  'Fotos, vídeos y documentos|que tú decidas compartir.',
  'Diagnosis comprensible|códigos, mediciones y conclusión.',
  'Importes y pagos|de cada intervención.',
  'Vista 360° de sus vehículos|con su historial completo.',
  'Vista previa|desde la ficha del cliente, para ver exactamente lo que ve.'
], M, y + 20, col);
doc.font('titulo').fontSize(12).fillColor(C.texto).text('WEB DEL TALLER', M + col + 20, y);
y2 = vinetas([
  'Tu dominio propio|con conexión segura (HTTPS).',
  'Trabajos realizados|con fotos y vídeos que publicas desde la gestión.',
  'Servicios, horario y contacto|editables por ti.',
  'Estadísticas de visitas|mapa de España por comunidades y ciudades, sin guardar datos personales.',
  'Acceso de clientes|desde la propia web.'
], M + col + 20, y + 20, col);
y = Math.max(y1, y2) + 14;
destacado(y, 'phone-off', 'Menos llamadas de «¿cómo va lo mío?»', 'El cliente consulta por su cuenta el estado de su vehículo desde el móvil, a cualquier hora. Tú decides qué fotos, vídeos y documentos comparte el taller, y el cliente ve también lo que tiene pendiente de pago.');

// ================= 6. CONTABILIDAD =================
doc.addPage();
y = cabecera(5, 'Tus números', 'Sabe cuánto ganas, de verdad',
  'Un resumen claro por mes, trimestre o año, con y sin IVA, a partir de las órdenes y los gastos que ya registras en el día a día.');
maquetaConta(M, y, W - 2 * M, 230);
y += 248;
const conta = [
  ['receipt', 'Facturado y cobrado', 'Lo entregado y lo pagado en cada periodo, y la lista de lo pendiente de cobro.'],
  ['coin-euro', 'Beneficio real', 'Cobrado menos el coste real de las piezas y los gastos generales, sin contar nada dos veces.'],
  ['camera', 'Gastos con foto del ticket', 'Recambios, alquiler, luz, herramientas… Fotografía el ticket con el móvil y queda archivado.'],
  ['chart-pie', 'Análisis', 'Gastos por categoría, facturación por tipo de servicio, mejores clientes y evolución de 12 meses.']
];
const cw2 = (W - 2 * M - 12) / 2, ch2 = 104;
conta.forEach(([ic, t, d], i) => tarjeta(M + (i % 2) * (cw2 + 12), y + Math.floor(i / 2) * (ch2 + 12), cw2, ch2, ic, t, d));
y += 2 * (ch2 + 12) + 4;
ecuacion(y, [['Cobrado', '7.960 €'], ['Coste de las piezas', '2.385 €'], ['Gastos generales', '2.460 €']], ['Beneficio', '3.115 €']);
y += 92;
doc.font('texto').fontSize(8.5).fillColor(C.grisClaro).text('Taller 360 genera presupuestos y facturas proforma y lleva la gestión interna de ingresos y gastos; la facturación oficial y los impuestos los sigues gestionando con tu programa de facturación o tu gestoría.', M, y, { width: W - 2 * M, lineGap: 1.5 });

// ================= 7. TECNOLOGÍA E IMPLANTACIÓN =================
doc.addPage();
y = cabecera(6, 'Tecnología e implantación', 'Seguro, en la nube y listo en días',
  'Una aplicación moderna, alojada en Google Cloud (Europa), que crece contigo y que ponemos en marcha con tus datos y tu imagen.');
const tecno = [
  ['cloud', 'En la nube', 'Alojado en Google Cloud en Europa, con base de datos gestionada y copias de seguridad.'],
  ['lock', 'Seguro', 'Conexión cifrada (HTTPS), contraseñas protegidas y bloqueo ante intentos fallidos.'],
  ['users', 'Perfiles de acceso', 'Personal del taller con acceso completo y clientes solo con sus vehículos y reparaciones.'],
  ['device-mobile', 'Móvil, tableta y ordenador', 'Sin instalar nada: el mecánico usa el móvil en el foso y la oficina el ordenador.'],
  ['shield-check', 'Privacidad', 'Estadísticas de visitas sin guardar IPs ni datos personales de los visitantes.'],
  ['palette', 'Con tu marca', 'Tu logotipo, tus colores y tu dominio, en la web, el área de cliente y los documentos.']
];
const t3w = (W - 2 * M - 24) / 3, t3h = 116;
tecno.forEach(([ic, t, d], i) => tarjeta(M + (i % 3) * (t3w + 12), y + Math.floor(i / 3) * (t3h + 12), t3w, t3h, ic, t, d));
y += 2 * (t3h + 12) + 14;
doc.font('titulo').fontSize(14).fillColor(C.texto).text('CÓMO EMPEZAMOS', M, y);
y += 26;
const pasosImpl = [
  ['Demostración', 'Te enseñamos Taller 360 funcionando en un taller real y vemos cómo trabajas.'],
  ['Tus datos', 'Importamos tus clientes, vehículos e historial desde Excel u otro programa.'],
  ['Tu imagen', 'Configuramos tu marca, tu web y tu dominio, y los servicios opcionales que elijas.'],
  ['Formación', 'Formamos al equipo y te acompañamos en las primeras semanas de uso.']
];
const pw4 = (W - 2 * M - 3 * 10) / 4;
pasosImpl.forEach(([t, d], i) => {
  const px = M + i * (pw4 + 10);
  doc.roundedRect(px, y, pw4, 150, 6).fill(C.blanco); doc.roundedRect(px, y, pw4, 150, 6).lineWidth(0.8).strokeColor(C.borde).stroke();
  doc.circle(px + 22, y + 24, 13).fill(C.negro);
  doc.font('titulo').fontSize(12).fillColor(C.lima).text(String(i + 1), px + 9, y + 17, { width: 26, align: 'center' });
  doc.font('semi').fontSize(11.5).fillColor(C.texto).text(t, px + 12, y + 46, { width: pw4 - 24 });
  doc.font('texto').fontSize(9.4).fillColor(C.gris).text(d, px + 12, doc.y + 4, { width: pw4 - 24, lineGap: 1.5 });
  if (i < 3) icono('chevron-right', px + pw4 - 2, y + 66, 12, C.limaTexto);
});
y += 172;
doc.font('titulo').fontSize(14).fillColor(C.texto).text('PREGUNTAS FRECUENTES', M, y);
y += 24;
const faq = [
  ['¿Hay que instalar algo?', 'No. Se usa desde el navegador del ordenador, la tableta o el móvil, y se puede añadir a la pantalla de inicio como una aplicación.'],
  ['¿Sirve para camiones y maquinaria agrícola?', 'Sí. Cada vehículo lleva su tipo y se controla por kilómetros o por horas de uso, según corresponda.'],
  ['¿Puedo empezar con los datos que ya tengo?', 'Sí. Importamos tus clientes, vehículos e historial desde Excel para que no empieces de cero.'],
  ['¿Lo pueden usar varias personas a la vez?', 'Sí. Cada persona del taller tiene su usuario, y cada cliente su acceso a su área privada.']
];
const fw = (W - 2 * M - 14) / 2;
faq.forEach(([p, rta], i) => {
  const fx = M + (i % 2) * (fw + 14), fy = y + Math.floor(i / 2) * 62;
  doc.font('semi').fontSize(10.5).fillColor(C.texto).text(p, fx, fy, { width: fw });
  doc.font('texto').fontSize(9.4).fillColor(C.gris).text(rta, fx, doc.y + 2, { width: fw, lineGap: 1.4 });
});

// ================= 8. CONTACTO =================
doc.addPage();
doc.rect(0, 0, W, H).fill(C.negro);
rayas(0, 0, W, H, '#121212', 11);
doc.rect(0, 0, W, 8).fill(C.lima);
logo(W / 2, 190, 58);
doc.font('titulo').fontSize(34).fillColor(C.blanco).text('PIDE UNA', 0, 290, { width: W, align: 'center', lineGap: -6 });
doc.fillColor(C.lima).text('DEMOSTRACIÓN', { width: W, align: 'center' });
doc.font('texto').fontSize(13).fillColor('#c9ccd0').text('Te enseñamos Taller 360 con casos reales y te preparamos un presupuesto a la medida de tu taller, sin compromiso.', W / 2 - 200, doc.y + 18, { width: 400, align: 'center', lineGap: 3 });
const datos = [['phone', CONTACTO.telefono], ['world-www', CONTACTO.web], ['mail', CONTACTO.email]];
let dy = 500;
for (const [ic, t] of datos) {
  doc.roundedRect(W / 2 - 170, dy, 340, 44, 6).fill(C.carbon);
  doc.roundedRect(W / 2 - 170, dy, 340, 44, 6).lineWidth(0.8).strokeColor('#2d3a0a').stroke();
  icono(ic, W / 2 - 150, dy + 11, 22, C.lima);
  doc.font('semi').fontSize(14).fillColor(C.blanco).text(t, W / 2 - 112, dy + 13, { width: 270, lineBreak: false });
  dy += 56;
}
doc.font('texto').fontSize(10).fillColor('#8a8d92').text('Taller 360 nace en AsturSagra, un taller mecánico de La Sagra (Toledo) que lo usa cada día con turismos, furgonetas, motos, camiones, tractores y maquinaria agrícola.', M + 40, H - 110, { width: W - 2 * M - 80, align: 'center', lineGap: 2 });

doc.end();
console.log('ok', salida);
