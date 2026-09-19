import test from 'node:test';
import assert from 'node:assert/strict';

import { filasSembradas } from './mensajesSembrados.js';
import {
  sembrarMensajesDelSistema,
  hayMensajesCargados,
  clavesCargadas,
  frase,
} from '../mensajesDelSistema.js';
import { IDIOMAS_SOPORTADOS, IDIOMA_POR_DEFECTO } from '../idiomas.js';
import { aviso, CLAVES_DE_AVISO } from '../avisos.js';

const FILAS = filasSembradas();

// Una Prestadora inventada, que no existe en ninguna base.
const UNA_PRESTADORA = '00000000-0000-4000-8000-000000000001';
const OTRA_PRESTADORA = '00000000-0000-4000-8000-000000000002';

test('la migración siembra todas las piezas, y el renglón sigue teniendo la forma que la prueba lee', () => {
  // Si alguien parte un renglón en dos o cambia la forma del INSERT, esto se cae y hay que
  // arreglarlo a propósito: es justamente lo que impide que la prueba quede leyendo nada.
  assert.ok(FILAS.length > 100, `se leyeron ${FILAS.length} filas de la migración`);
  assert.equal(new Set(FILAS.map((f) => f.clave)).size, FILAS.length, 'hay claves repetidas');
});

test('cada pieza sembrada trae los tres idiomas y ninguno vacío', () => {
  for (const fila of FILAS) {
    for (const idioma of IDIOMAS_SOPORTADOS) {
      const texto = fila.i18n[idioma];
      assert.equal(typeof texto, 'string', `${fila.clave} no trae ${idioma}`);
      assert.notEqual(texto.trim(), '', `${fila.clave} tiene vacío el ${idioma}`);
    }
  }
});

test('los cuatro avisos de la seguridad de la cuenta no los reescribe ninguna Prestadora', () => {
  const cerrados = FILAS.filter((f) => f.admite_texto_propio === false).map((f) => f.clave);
  for (const deLaSeguridad of [
    'clave_recuperada',
    'telefono_cambiado',
    'entrada_desde_equipo_nuevo',
    'cambio_de_clave_habilitado',
  ]) {
    assert.ok(
      cerrados.some((clave) => clave.startsWith(`${deLaSeguridad}.`)),
      `${deLaSeguridad} quedó abierto a texto propio`
    );
  }
  // Y la gramática compartida tampoco: no es un mensaje, son las partes con las que se arman todos.
  assert.ok(cerrados.some((clave) => clave.startsWith('comun.')), 'la gramática común quedó abierta');
});

test('sin nada cargado, una frase que falta avisa y deja una marca a la vista', () => {
  sembrarMensajesDelSistema([]);
  assert.equal(hayMensajesCargados(), false);
  const salida = frase('comun.conjuncion', IDIOMA_POR_DEFECTO);
  assert.notEqual(salida.trim(), '', 'una frase que falta no puede devolver un hueco mudo');
  assert.ok(salida.includes('comun.conjuncion'), 'la marca tiene que decir qué falta');
});

test('lo sembrado se carga y queda entero', () => {
  sembrarMensajesDelSistema(FILAS);
  assert.equal(hayMensajesCargados(), true);
  assert.equal(clavesCargadas().length, FILAS.length);
});

test('todas las claves que pide el código están sembradas, en los tres idiomas', () => {
  sembrarMensajesDelSistema(FILAS);
  for (const idioma of IDIOMAS_SOPORTADOS) {
    for (const clave of CLAVES_DE_AVISO) {
      const armado = aviso(clave, idioma, DATOS_MINIMOS[clave] ?? {});
      for (const [parte, texto] of Object.entries(armado)) {
        assert.ok(
          !texto.includes('[falta:'),
          `${clave}.${parte} en ${idioma} pide una frase que la migración no siembra: ${texto}`
        );
      }
    }
  }
});

test('un marcador sin valor no deja un hueco mudo', () => {
  sembrarMensajesDelSistema(FILAS);
  const salida = frase('comun.marca', IDIOMA_POR_DEFECTO, {});
  assert.ok(salida.includes('producto'), 'el marcador sin valor tiene que quedar a la vista');
});

test('el texto propio de una Prestadora gana, y no se le escapa a ninguna otra', () => {
  sembrarMensajesDelSistema([
    ...FILAS,
    {
      clave: 'mensaje_del_coordinador.titulo',
      prestadora_id: UNA_PRESTADORA,
      activo: true,
      i18n: { 'es-AR': 'Aviso de la coordinación' },
    },
  ]);
  const delProducto = frase('mensaje_del_coordinador.titulo', 'es-AR');
  assert.equal(frase('mensaje_del_coordinador.titulo', 'es-AR', {}, UNA_PRESTADORA), 'Aviso de la coordinación');
  assert.equal(frase('mensaje_del_coordinador.titulo', 'es-AR', {}, OTRA_PRESTADORA), delProducto);
  // Escribió el suyo en castellano y nada más: a quien se le habla en inglés le sale el del
  // producto, que sí está en los tres. Media frase de cada uno sería peor que ninguna.
  assert.equal(
    frase('mensaje_del_coordinador.titulo', 'en', {}, UNA_PRESTADORA),
    frase('mensaje_del_coordinador.titulo', 'en')
  );
});

test('una fila apagada no sale', () => {
  sembrarMensajesDelSistema([
    ...FILAS,
    {
      clave: 'mensaje_del_coordinador.titulo',
      prestadora_id: UNA_PRESTADORA,
      activo: false,
      i18n: { 'es-AR': 'Esto no tiene que salir' },
    },
  ]);
  assert.notEqual(
    frase('mensaje_del_coordinador.titulo', 'es-AR', {}, UNA_PRESTADORA),
    'Esto no tiene que salir'
  );
});

// Lo mínimo para poder llamar a cada aviso. No comprueba qué dice: sólo que ninguna pieza falte.
const DATOS_MINIMOS = {
  origen_de_alerta: { fuente: 'aviso_telefonico' },
  guardia_sin_cerrar: {
    fecha: '2026-10-07', horaInicio: '08:00', horaFin: '16:00', pacientes: ['Elena'],
    asistente: 'Marta', minutosDeAtraso: 40, salidaMarcada: true, veces: 2,
  },
  guardia_sin_cerrar_grave: {
    fecha: '2026-10-07', horaInicio: '08:00', horaFin: '16:00', pacientes: ['Elena'],
    asistente: 'Marta', minutosDeAtraso: 300, salidaMarcada: false,
  },
  guardia_sin_cerrar_respaldo: { fecha: '2026-10-07', horaInicio: '08:00', horaFin: '16:00', minutosDeAtraso: 90 },
  guardia_sin_cerrar_familia: { fecha: '2026-10-07', horaInicio: '08:00', horaFin: '16:00', pacientes: ['Elena'] },
  guardia_sin_cerrar_grave_familia: { fecha: '2026-10-07', horaInicio: '08:00', horaFin: '16:00', pacientes: ['Elena'] },
  alerta_temprana_guardia_familia: { fecha: '2026-10-07', horaInicio: '08:00', horaFin: '16:00', pacientes: ['Elena'] },
  escalada_a_respaldo: {},
  escalada_a_todos_los_coordinadores: { minutos: 45 },
  escalada_a_la_administracion: { minutos: 90 },
  alerta_temprana_sin_resolver: {
    fecha: '2026-10-07', horaInicio: '08:00', horaFin: '16:00', pacientes: ['Elena'],
    origen: 'un origen', motivo: 'no contesta', minutos: 30,
  },
  alerta_temprana_respaldo: {
    fecha: '2026-10-07', horaInicio: '08:00', horaFin: '16:00', pacientes: ['Elena'], minutos: 30,
  },
  aviso_demora_asistente: { fecha: '2026-10-07', horaInicio: '08:00', origen: 'un origen', motivo: 'tránsito' },
  incidente_relevo_sin_resolver: {
    fecha: '2026-10-07', horaInicio: '08:00', horaFin: '16:00', pacientes: ['Elena'], minutos: 45,
  },
  incidente_relevo_respaldo: {
    fecha: '2026-10-07', horaInicio: '08:00', horaFin: '16:00', pacientes: ['Elena'], minutos: 45,
  },
  incidente_relevo_fase_automatica: {
    fecha: '2026-10-07', horaInicio: '08:00', horaFin: '16:00', pacientes: ['Elena'],
    minutosUmbral: 60, contactados: 3, sinNivel: false, sinOrden: false, quedaElFamiliar: true,
  },
  convocatoria_de_relevo: { fecha: '2026-10-07', horaInicio: '22:00', horaFin: '06:00' },
  incidente_relevo_familia: { fecha: '2026-10-07', horaInicio: '08:00', horaFin: '16:00' },
  cambio_de_asistente: {
    asistenteNuevo: 'Rita Solano', asistenteAnterior: 'Marcos Peña',
    turnos: [{ fecha: '2026-10-07', horaInicio: '08:00', horaFin: '16:00', pacientes: ['Elena'] }],
  },
  cambio_de_asistente_familia: {
    asistenteNuevo: 'Rita Solano',
    turnos: [{ fecha: '2026-10-07', horaInicio: '08:00', horaFin: '16:00', pacientes: ['Elena'] }],
  },
  ausencia_avisada_con_tiempo: {
    asistente: 'Rita Solano', fechaInicio: '2026-10-07', fechaFin: '2026-10-14',
    fecha: '2026-10-07', horaInicio: '08:00', horaFin: '16:00', pacientes: ['Elena'],
    turnos: 3, yaEmpezo: false, horas: 72, veces: 1,
  },
  ausencia_de_golpe: {
    asistente: 'Rita Solano', fechaInicio: '2026-10-07', fechaFin: null,
    fecha: '2026-10-07', horaInicio: '08:00', horaFin: '16:00', pacientes: ['Elena'],
    turnos: 2, yaEmpezo: false, horas: 2, veces: 2,
  },
  guardia_sin_cubrir: {
    fecha: '2026-10-07', horaInicio: '08:00', horaFin: '16:00', pacientes: ['Elena'],
    yaEmpezo: false, horas: 5, veces: 1,
    busqueda: { ofrecida: true, invitados: 3, sinContestar: 1, aceptaron: 0 },
  },
  incidente_turno_sin_cubrir: {
    fecha: '2026-10-07', horaInicio: '08:00', horaFin: '16:00', pacientes: ['Elena'],
    yaEmpezo: false, horas: 12, veces: 2,
    cubrenFrancos: ['Rita Solano'], candidatos: ['Rita Solano', 'Marta Ruiz'],
  },
  emergencia_en_guardia: { fecha: '2026-10-07', horaInicio: '08:00' },
  no_puede_continuar_la_extension: { fecha: '2026-10-07', horaInicio: '22:00', horaFin: '06:00' },
  alerta_ia_coordinador: { esRoja: true },
  alerta_ia_familia: { esRoja: false },
  vencimiento_documentos: {
    etiqueta: 'Carnet sanitario', dias: 30,
    documentos: [{ nombre: 'Marta', fechaVencimiento: '2026-11-01' }],
  },
  mfa_codigo_recuperacion: { codigo: '123456', minutos: 10, producto: 'un producto' },
  codigo_instruccion_circulo: { codigo: '123456', minutos: 10, remite: 'Cuidados del Sur' },
  activacion_cuenta: {
    nombre: 'Elena', link: 'https://ejemplo/activar', dias: 7,
    empresa: 'Cuidados del Sur', producto: 'un producto',
  },
  recuperacion_clave: {
    nombre: 'Elena', link: 'https://ejemplo/clave-nueva', horas: 2,
    empresa: 'Cuidados del Sur', producto: 'un producto',
  },
  estado_postulacion: { empresa: 'Cuidados del Sur', nombre: 'Marta', estado: 'aprobado' },
  nueva_postulacion_asistente: { nombre: 'Marta' },
  nueva_solicitud_servicio: {
    nombre: 'Elena', telefono: '1150000000', email: 'elena@ejemplo', localidad: 'Quilmes',
    tipoServicio: 'Acompañamiento', modalidad: 'Por hora', diasHorario: 'Lunes a viernes',
    descripcion: 'Dos turnos por semana',
  },
  mensaje_del_coordinador: {},
  guardia_asignada: { fecha: '2026-10-07', horaInicio: '08:00' },
  recordatorio_de_guardia: { fecha: '2026-10-07', horaInicio: '08:00' },
  fin_periodo_sin_cargo: { dia: '7/10/2026', importe: '4500.00 ARS' },
  cobro_no_realizado: { importe: '4500.00 ARS', dia: '7/10/2026' },
  cese_de_servicio: {},
  entrevista_agendada: {
    prestadora: 'Cuidados del Sur', cuando: 'martes, 7 de octubre de 2026, 10:00',
    enlace: 'https://ejemplo/entrevista/una-llave', anticipo: 15,
  },
  entrevista_reprogramada: {
    prestadora: 'Cuidados del Sur', cuando: 'jueves, 9 de octubre de 2026, 15:30',
    enlace: 'https://ejemplo/entrevista/una-llave', anticipo: 15,
  },
  entrevista_cancelada: { prestadora: 'Cuidados del Sur', cuando: 'martes, 7 de octubre de 2026, 10:00' },
  clave_recuperada: { nombre: 'Marta Giménez', prestadora: 'Cuidados del Sur' },
  telefono_cambiado: { nombre: 'Marta Giménez', prestadora: 'Cuidados del Sur' },
  entrada_desde_equipo_nuevo: { nombre: 'Marta Giménez', prestadora: 'Cuidados del Sur' },
  cambio_de_clave_habilitado: { nombre: 'Marta Giménez', prestadora: 'Cuidados del Sur' },
};
