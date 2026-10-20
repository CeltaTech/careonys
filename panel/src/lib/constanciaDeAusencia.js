import { jsPDF } from 'jspdf';

// La constancia de ausencia justificada que se le entrega a un Asistente: un PDF armado con los
// datos de la ausencia ya cargada. No calcula nada ni inventa texto legal; devuelve el documento
// sin descargarlo, y la descarga la dispara quien lo pidió con `descargarPDF()`.

const MARGEN = 20;
const ANCHO_UTIL = 170;

// EL DOCUMENTO VA EN CASTELLANO. Todo lo que este archivo escribe —el título, los rótulos, la
// advertencia del pie— está redactado en castellano acá adentro, porque es un papel que se
// entrega, no una pantalla que cambia de idioma con quien la mira. Entonces las fechas que van
// adentro de ese papel se escriben también en castellano. El idioma del documento se declara una
// sola vez, acá: el día que una Prestadora entregue este papel en otro idioma, pasa a ser un dato
// de la Prestadora y hay un solo renglón que tocar.
export const IDIOMA_DEL_DOCUMENTO = 'es-AR';

function textoDisclaimerLegal(nombreEmpresa) {
  return (
    `Documento generado automáticamente por el sistema de ${nombreEmpresa} a partir de los datos cargados. ` +
    'Debe ser revisado por un abogado laboralista antes de su entrega o uso formal — no reemplaza ' +
    'el asesoramiento legal profesional.'
  );
}

function nuevoDocumento() {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFont('helvetica', 'normal');
  return doc;
}

function encabezado(doc, titulo, nombreEmpresa) {
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(nombreEmpresa.toUpperCase(), MARGEN, 20);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(titulo, MARGEN, 28);
  doc.setDrawColor(180);
  doc.line(MARGEN, 32, MARGEN + ANCHO_UTIL, 32);
  return 42;
}

function parrafo(doc, texto, y, opciones = {}) {
  doc.setFontSize(opciones.tamano || 10);
  doc.setFont('helvetica', opciones.negrita ? 'bold' : 'normal');
  const lineas = doc.splitTextToSize(texto, ANCHO_UTIL);
  doc.text(lineas, MARGEN, y);
  return y + lineas.length * 5 + (opciones.espacioExtra ?? 4);
}

function piePagina(doc, nombreEmpresa) {
  const alturaPagina = doc.internal.pageSize.getHeight();
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(120);
  const lineas = doc.splitTextToSize(textoDisclaimerLegal(nombreEmpresa), ANCHO_UTIL);
  doc.text(lineas, MARGEN, alturaPagina - 20);
  doc.setTextColor(0);
}

function formatoFecha(fecha) {
  if (!fecha) return '—';
  // Las columnas DATE de Postgres llegan como "YYYY-MM-DD" — parsearlas con `new Date()`
  // las interpreta como UTC medianoche, y en horario argentino (UTC-3) toLocaleDateString
  // las corre un día para atrás. Se formatea directo desde el string para fechas sin hora.
  if (typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}/.test(fecha)) {
    const [anio, mes, dia] = fecha.slice(0, 10).split('-');
    return `${dia}/${mes}/${anio}`;
  }
  return new Date(fecha).toLocaleDateString(IDIOMA_DEL_DOCUMENTO);
}

export function generarConstanciaAusencia({ asistente, ausencia, tipoLabel, nombreEmpresa }) {
  const doc = nuevoDocumento();
  let y = encabezado(doc, 'Constancia de ausencia justificada', nombreEmpresa);

  y = parrafo(doc, `Asistente: ${asistente.nombre} (DNI ${asistente.dni ?? '—'})`, y);
  y = parrafo(doc, `Tipo de ausencia: ${tipoLabel}`, y);
  y = parrafo(doc, `Desde: ${formatoFecha(ausencia.fecha_inicio)}`, y);
  y = parrafo(doc, `Hasta: ${formatoFecha(ausencia.fecha_fin)}${ausencia.fecha_vuelta_real ? '' : ' (prevista)'}`, y);
  if (ausencia.dias_computados !== null && ausencia.dias_computados !== undefined) {
    y = parrafo(doc, `Días computados: ${ausencia.dias_computados}`, y);
  }
  if (ausencia.observaciones) {
    y = parrafo(doc, `Observaciones: ${ausencia.observaciones}`, y, { espacioExtra: 8 });
  }

  piePagina(doc, nombreEmpresa);
  return doc;
}

export function descargarPDF(doc, nombreArchivo) {
  doc.save(nombreArchivo);
}
