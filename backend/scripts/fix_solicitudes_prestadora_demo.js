import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PRESTADORA_ID = '4e84b0e7-1729-4d07-9e70-56fdbd54cd89';

const CONTACTOS = {
  'DEMO — Antonio Ferreyra': { nombre: 'DEMO — Marisa Ferreyra (hija)', telefono: '+549 11 4522-8801', email: 'marisa.ferreyra.demo@gmail.com' },
  'DEMO — Delia Ponce': { nombre: 'DEMO — Jorge Ponce (hijo)', telefono: '+549 11 4877-2290', email: 'jorge.ponce.demo@gmail.com' },
  'DEMO — Elena Sosa Domínguez': { nombre: 'DEMO — Laura Sosa (hija)', telefono: '+549 11 4553-6612', email: 'laura.sosa.demo@gmail.com' },
  'DEMO — Enrique Duarte': { nombre: 'DEMO — Patricia Duarte (hija)', telefono: '+549 11 4901-3345', email: 'patricia.duarte.demo@gmail.com' },
  'DEMO — Ernesto Bianchi': { nombre: 'DEMO — Carlos Bianchi (hijo)', telefono: '+549 11 4756-9081', email: 'carlos.bianchi.demo@gmail.com' },
  'DEMO — Héctor Giménez': { nombre: 'DEMO — Marta Giménez (hija)', telefono: '+549 11 4331-2298', email: 'marta.gimenez.demo@gmail.com' },
  'DEMO — Juan Carlos Medina': { nombre: 'DEMO — Silvina Medina (hija)', telefono: '+549 11 4208-7743', email: 'silvina.medina.demo@gmail.com' },
  'DEMO — María Esther Aguilar': { nombre: 'DEMO — Roberto Aguilar (hijo)', telefono: '+549 11 4257-1190', email: 'roberto.aguilar.demo@gmail.com' },
  'DEMO — Marta Escobar': { nombre: 'DEMO — Daniel Escobar (hijo)', telefono: '+549 11 4571-4423', email: 'daniel.escobar.demo@gmail.com' },
  'DEMO — Nélida Franco': { nombre: 'DEMO — Adriana Franco (hija)', telefono: '+549 11 4628-0091', email: 'adriana.franco.demo@gmail.com' },
  'DEMO — Osvaldo Ríos': { nombre: 'DEMO — Gustavo Ríos (hijo)', telefono: '+549 11 4244-7789', email: 'gustavo.rios.demo@gmail.com' },
  'DEMO — Ramón Quiroga': { nombre: 'DEMO — Cecilia Quiroga (hija)', telefono: '+549 11 4749-3321', email: 'cecilia.quiroga.demo@gmail.com' },
  'DEMO — Roberto Fernández': { nombre: 'DEMO — Ana Fernández (hija)', telefono: '+549 11 4658-2214', email: 'ana.fernandez.demo@gmail.com' },
  'DEMO — Rosa Villalba': { nombre: 'DEMO — Miguel Villalba (hijo)', telefono: '+549 11 4747-6690', email: 'miguel.villalba.demo@gmail.com' },
  'DEMO — Susana Paz': { nombre: 'DEMO — Fernando Paz (hijo)', telefono: '+549 11 4612-8834', email: 'fernando.paz.demo@gmail.com' },
};

function localidadDe(domicilio) {
  return domicilio.split(',').slice(-1)[0].trim();
}

async function main() {
  const { data: pacientes } = await supabase
    .from('pacientes')
    .select('id, nombre, cliente_id, domicilio')
    .eq('prestadora_id', PRESTADORA_ID)
    .throwOnError();

  const { data: clientesSinSolicitud } = await supabase
    .from('clientes')
    .select('id, solicitud_id')
    .eq('prestadora_id', PRESTADORA_ID)
    .is('solicitud_id', null)
    .throwOnError();

  const idsSinSolicitud = new Set(clientesSinSolicitud.map((f) => f.id));

  for (const p of pacientes) {
    if (!idsSinSolicitud.has(p.cliente_id)) continue;
    const contacto = CONTACTOS[p.nombre];
    if (!contacto) { console.warn(`sin contacto definido para ${p.nombre}, se omite`); continue; }

    const { data: solicitud, error: errorSolicitud } = await supabase
      .from('solicitudes')
      .insert({
        prestadora_id: PRESTADORA_ID,
        nombre: contacto.nombre,
        telefono: contacto.telefono,
        email: contacto.email,
        nombre_paciente: p.nombre,
        localidad: localidadDe(p.domicilio),
        tipo_servicio: 'Cuidado domiciliario',
        modalidad: 'presencial',
        dias_horario: 'Lunes a viernes, 08:00 a 14:00',
        canal: 'demo',
        estado: 'asignada',
        cliente_id: p.cliente_id,
      })
      .select()
      .single()
      .throwOnError();

    await supabase.from('clientes').update({ solicitud_id: solicitud.id }).eq('id', p.cliente_id).throwOnError();
    console.log(`solicitud vinculada OK: ${p.nombre}`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
