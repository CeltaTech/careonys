import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PRESTADORA_ID = '4e84b0e7-1729-4d07-9e70-56fdbd54cd89';
const HOY = new Date('2026-07-19T00:00:00');

function fecha(diffDias) {
  const d = new Date(HOY);
  d.setDate(d.getDate() + diffDias);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const { data: asistentes } = await supabase
    .from('asistentes').select('id, nombre, estado')
    .eq('prestadora_id', PRESTADORA_ID).order('nombre').throwOnError();
  const { data: pacientes } = await supabase
    .from('pacientes').select('id, nombre, cliente_id, lat, lng')
    .eq('prestadora_id', PRESTADORA_ID).order('nombre').throwOnError();
  const { data: tipos } = await supabase
    .from('tipos_documento_asistente').select('id, nombre')
    .eq('prestadora_id', PRESTADORA_ID).throwOnError();

  const activos = asistentes.filter((a) => a.estado === 'activo');

  // --- documentos_asistente: los 40 asistentes x los 4 tipos, ~80% con variedad
  // vigente/por_vencer/vencido, ~20% sin documento cargado a propósito ---
  const documentos = [];
  asistentes.forEach((a, ai) => {
    tipos.forEach((t, ti) => {
      const bucket = (ai + ti) % 5;
      if (bucket === 0) return; // sin cargar
      let fecha_vencimiento;
      if (bucket === 1) fecha_vencimiento = fecha(200 + ((ai * 7 + ti * 3) % 300));
      else if (bucket === 2) fecha_vencimiento = fecha(90 + ((ai * 5 + ti * 2) % 150));
      else if (bucket === 3) fecha_vencimiento = fecha(3 + ((ai + ti) % 25)); // por_vencer
      else fecha_vencimiento = fecha(-(5 + ((ai * 3 + ti) % 80))); // vencido
      documentos.push({ prestadora_id: PRESTADORA_ID, asistente_id: a.id, tipo_documento_id: t.id, fecha_vencimiento });
    });
  });
  await supabase.from('documentos_asistente').insert(documentos).throwOnError();
  console.log(`documentos_asistente: ${documentos.length} filas`);

  // --- personal_emergencia: un franquero y un contacto de emergencia cada 6 asistentes ---
  const personalEmergencia = activos
    .filter((_, i) => i % 6 === 0)
    .map((a, i) => ({ prestadora_id: PRESTADORA_ID, asistente_id: a.id, tipo: i % 2 === 0 ? 'franquero' : 'emergencia', activo: true }));
  await supabase.from('personal_emergencia').insert(personalEmergencia).throwOnError();
  console.log(`personal_emergencia: ${personalEmergencia.length} filas`);

  // --- guardias: cada paciente tiene un titular fijo, del 07-13 al 07-22 ---
  const titulares = pacientes.map((p, i) => activos[i % activos.length]);
  const backup = activos[(activos.length - 1)];

  const guardias = [];
  for (let dia = -6; dia <= 3; dia++) {
    const f = fecha(dia);
    pacientes.forEach((p, pi) => {
      const titular = titulares[pi];
      // Un swap puntual: el paciente 0 tiene backup en día -2
      const asistente = pi === 0 && dia === -2 ? backup : titular;

      let estado = 'programada';
      let checkin_at = null, checkout_at = null, checkin_lat = null, checkin_lng = null, checkout_lat = null, checkout_lng = null;
      let cancelacion_origen = null, cancelacion_alcance = null, checkout_bloqueado = false;

      if (dia < 0) {
        estado = 'completada';
        checkin_at = `${f}T08:05:00-03:00`;
        checkout_at = `${f}T14:10:00-03:00`;
        checkin_lat = p.lat; checkin_lng = p.lng;
        checkout_lat = p.lat; checkout_lng = p.lng;
        // Un ausente sin relevo previo puntual (paciente 3, día -4) y una cancelada (paciente 5, día -1)
        if (pi === 3 && dia === -4) {
          estado = 'ausente';
          checkin_at = null; checkout_at = null; checkin_lat = null; checkin_lng = null; checkout_lat = null; checkout_lng = null;
        }
        if (pi === 5 && dia === -1) {
          estado = 'cancelada';
          cancelacion_origen = 'cliente';
          cancelacion_alcance = 'total';
          checkin_at = null; checkout_at = null; checkin_lat = null; checkin_lng = null; checkout_lat = null; checkout_lng = null;
        }
      } else if (dia === 0) {
        estado = 'activa';
        checkin_at = `${f}T08:00:00-03:00`;
        checkin_lat = p.lat; checkin_lng = p.lng;
      }

      guardias.push({
        prestadora_id: PRESTADORA_ID,
        asistente_id: asistente.id,
        paciente_id: p.id,
        fecha: f,
        hora_inicio: '08:00:00',
        hora_fin: '14:00:00',
        modalidad: 'presencial',
        estado,
        cancelacion_origen,
        cancelacion_alcance,
        checkin_at, checkin_lat, checkin_lng,
        checkout_at, checkout_lat, checkout_lng,
        checkout_bloqueado,
      });
    });
  }
  await supabase.from('guardias').insert(guardias).throwOnError();
  console.log(`guardias: ${guardias.length} filas`);

  // --- ausencias: un par de asistentes con licencia registrada ---
  const ausencias = [
    { prestadora_id: PRESTADORA_ID, asistente_id: activos[3].id, tipo: 'enfermedad_inculpable', fecha_inicio: fecha(-10), fecha_fin: fecha(-4), dias_computados: 6, observaciones: 'DEMO — Reposo por gripe con certificado médico.' },
    { prestadora_id: PRESTADORA_ID, asistente_id: activos[7].id, tipo: 'otra_licencia', fecha_inicio: fecha(-20), fecha_fin: fecha(-18), dias_computados: 2, observaciones: 'DEMO — Licencia por trámite personal.' },
  ];
  await supabase.from('ausencias').insert(ausencias).throwOnError();
  console.log(`ausencias: ${ausencias.length} filas`);
}

main().catch((err) => { console.error(err); process.exit(1); });
