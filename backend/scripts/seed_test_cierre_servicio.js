import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { identidadInventada } from './identidadInventada.js';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PRESTADORA_ID = '874f54d7-4383-4d54-8b9f-f51d02f0dd11';

// La contraseña de las cuentas de prueba entra por el entorno, como cualquier credencial. Escrita
// acá queda a la vista de cualquiera que abra el repositorio, y las cuentas que ya nacieron con
// ella la siguen teniendo. Sin la variable el script no arranca.
const PASSWORD = process.env.SEED_TEST_PASSWORD;
if (!PASSWORD) {
  console.error('Falta la variable SEED_TEST_PASSWORD. Es la contraseña con la que nacen las cuentas de prueba, y no se escribe en el código.');
  process.exit(1);
}

async function main() {
  const { data: coordinadorAuth, error: errorCoordAuth } = await supabase.auth.admin.createUser({
    email: 'alas.para.escribir.2026+coordinador.test@gmail.com',
    password: PASSWORD,
    email_confirm: true,
  });
  if (errorCoordAuth) throw errorCoordAuth;

  const { error: errorUsuarioCoord } = await supabase.from('usuarios').insert({
    id: coordinadorAuth.user.id,
    rol: 'coordinador',
    nombre: 'PRUEBA temporal — Coordinador cierre de servicio',
    prestadora_id: PRESTADORA_ID,
  });
  if (errorUsuarioCoord) throw errorUsuarioCoord;

  const { data: clienteAuth, error: errorClienteAuth } = await supabase.auth.admin.createUser({
    email: 'alas.para.escribir.2026+cliente.test.cierre@gmail.com',
    password: PASSWORD,
    email_confirm: true,
  });
  if (errorClienteAuth) throw errorClienteAuth;

  const { error: errorUsuarioCliente } = await supabase.from('usuarios').insert({
    id: clienteAuth.user.id,
    rol: 'cliente',
    nombre: 'PRUEBA temporal — Cliente cierre servicio',
    prestadora_id: PRESTADORA_ID,
  });
  if (errorUsuarioCliente) throw errorUsuarioCliente;

  const { error: errorCliente } = await supabase.from('clientes')
    .insert({ id: clienteAuth.user.id, prestadora_id: PRESTADORA_ID, plan: 'directo' });
  if (errorCliente) throw errorCliente;

  const { data: paciente, error: errorPaciente } = await supabase.from('pacientes')
    .insert({ prestadora_id: PRESTADORA_ID, cliente_id: clienteAuth.user.id, nombre: 'PRUEBA temporal — Paciente cierre servicio' })
    .select().single();
  if (errorPaciente) throw errorPaciente;

  const { data: prestacion, error: errorPrestacion } = await supabase.from('prestaciones')
    .insert({ prestadora_id: PRESTADORA_ID, paciente_id: paciente.id, tipo_servicio: 'PRUEBA temporal', precio_final: 1000, estado: 'vigente' })
    .select().single();
  if (errorPrestacion) throw errorPrestacion;

  const { data: paquete, error: errorPaquete } = await supabase.from('paquetes_prestaciones')
    .insert({ prestadora_id: PRESTADORA_ID, paciente_id: paciente.id, nombre: 'PRUEBA temporal — Paquete', precio_paquete: 5000, estado: 'vigente' })
    .select().single();
  if (errorPaquete) throw errorPaquete;

  const { data: asistenteAuth, error: errorAsistenteAuth } = await supabase.auth.admin.createUser({
    email: 'alas.para.escribir.2026+asistente.test.cierre@gmail.com',
    password: PASSWORD,
    email_confirm: true,
  });
  if (errorAsistenteAuth) throw errorAsistenteAuth;

  const { error: errorUsuarioAsistente } = await supabase.from('usuarios').insert({
    id: asistenteAuth.user.id,
    rol: 'asistente',
    nombre: 'PRUEBA temporal — Asistente cierre servicio',
    prestadora_id: PRESTADORA_ID,
  });
  if (errorUsuarioAsistente) throw errorUsuarioAsistente;

  const { error: errorAsistenteFila } = await supabase.from('asistentes').insert({
    id: asistenteAuth.user.id,
    nombre: 'PRUEBA temporal — Asistente cierre servicio',
    prestadora_id: PRESTADORA_ID,
    ...identidadInventada(30498001, 'femenino'),
  });
  if (errorAsistenteFila) throw errorAsistenteFila;

  const manana = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: serie, error: errorSerie } = await supabase.from('series_guardias')
    .insert({
      prestadora_id: PRESTADORA_ID,
      paciente_id: paciente.id,
      asistente_id: asistenteAuth.user.id,
      dias_semana: [1, 2, 3, 4, 5],
      hora_inicio: '09:00',
      hora_fin: '17:00',
      modalidad: 'PRUEBA temporal',
      vigente_desde: manana,
      vigente_hasta: null,
      estado: 'activa',
    })
    .select().single();
  if (errorSerie) throw errorSerie;

  const { data: guardia, error: errorGuardia } = await supabase.from('guardias')
    .insert({
      prestadora_id: PRESTADORA_ID,
      paciente_id: paciente.id,
      asistente_id: asistenteAuth.user.id,
      serie_id: serie.id,
      fecha: manana,
      hora_inicio: '09:00',
      hora_fin: '17:00',
      modalidad: 'PRUEBA temporal',
      estado: 'programada',
    })
    .select().single();
  if (errorGuardia) throw errorGuardia;

  console.log(JSON.stringify({
    coordinadorId: coordinadorAuth.user.id,
    clienteId: clienteAuth.user.id,
    asistenteId: asistenteAuth.user.id,
    pacienteId: paciente.id,
    prestacionId: prestacion.id,
    paqueteId: paquete.id,
    serieId: serie.id,
    guardiaId: guardia.id,
  }, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); });
