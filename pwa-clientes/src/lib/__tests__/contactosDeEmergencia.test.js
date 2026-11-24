// La lista de contactos de emergencia mientras el titular la arma.
//
// UNA PRUEBA QUE NO PUEDE FALLAR NO PRUEBA NADA: si subir o bajar dejan de mover el renglón, si se
// sale del borde, si la lista pasa del máximo, si una persona entra dos veces, si el pedido deja de
// mandar el orden o mezcla una persona elegida con una nueva, si el error del backend no encuentra
// su texto o si falta una frase en algún idioma, alguna de estas falla.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  agregarPersona,
  agregarPersonaNueva,
  bajar,
  cambio,
  cuerpoDelPedido,
  deLaRespuesta,
  faltantesDeLaPersonaNueva,
  personasParaElegir,
  quitar,
  rolesDe,
  sePuedeAgregar,
  subir,
  textoDelError,
} from '../contactosDeEmergencia.js';
import { T } from '../../i18n/translations.js';

// Identificadores y nombres inventados.
const ANA = { personaId: '00000000-0000-4000-8000-000000000001', nombre: 'Ana Prueba', esContratante: true, esPaciente: false, esResponsableDePagos: true, esPersonaAutorizada: false };
const BETO = { personaId: '00000000-0000-4000-8000-000000000002', nombre: 'Beto Ficticio', esContratante: false, esPaciente: true, esResponsableDePagos: false, esPersonaAutorizada: false };
const CARLA = { personaId: '00000000-0000-4000-8000-000000000003', nombre: 'Carla Inventada', esContratante: false, esPaciente: false, esResponsableDePagos: false, esPersonaAutorizada: true };

const guardada = deLaRespuesta([
  { ...BETO, prioridad: 2, telefonos: ['1155550002'] },
  { ...ANA, prioridad: 1, telefonos: ['1155550001'] },
]);

const ids = (lista) => lista.map((c) => c.personaId ?? c.clave);

test('la lista guardada llega ordenada por prioridad', () => {
  assert.deepEqual(ids(guardada), [ANA.personaId, BETO.personaId]);
});

test('subir y bajar mueven el renglón y no se salen del borde', () => {
  assert.deepEqual(ids(subir(guardada, 1)), [BETO.personaId, ANA.personaId]);
  assert.deepEqual(ids(bajar(guardada, 0)), [BETO.personaId, ANA.personaId]);
  assert.equal(subir(guardada, 0), guardada);
  assert.equal(bajar(guardada, 1), guardada);
});

test('quitar saca sólo ese renglón', () => {
  assert.deepEqual(ids(quitar(guardada, 0)), [BETO.personaId]);
});

test('una persona del Cliente entra una sola vez y la lista no pasa del máximo', () => {
  const conCarla = agregarPersona(guardada, CARLA, 3);
  assert.deepEqual(ids(conCarla), [ANA.personaId, BETO.personaId, CARLA.personaId]);
  assert.equal(agregarPersona(guardada, ANA, 3), guardada);
  assert.equal(sePuedeAgregar(conCarla, 3), false);
  assert.equal(agregarPersona(guardada, CARLA, 2), guardada);
  assert.equal(agregarPersonaNueva(guardada, { nombre: 'Dora', apellido: 'Ejemplo', telefono: '1155550004' }, 'nueva-1', 2), guardada);
});

test('para elegir quedan sólo las personas que todavía no están en la lista', () => {
  assert.deepEqual(ids(personasParaElegir([ANA, BETO, CARLA], guardada)), [CARLA.personaId]);
});

test('la persona nueva exige nombre, apellido y teléfono', () => {
  assert.deepEqual(faltantesDeLaPersonaNueva({ nombre: ' ', apellido: 'Prueba', telefono: '' }), ['nombre', 'telefono']);
  const incompleta = agregarPersonaNueva(guardada, { nombre: 'Dora', apellido: '', telefono: '1155550004' }, 'nueva-1', 3);
  assert.equal(incompleta, guardada);
  const completa = agregarPersonaNueva(guardada, { nombre: ' Dora ', apellido: 'Ejemplo', telefono: '1155550004' }, 'nueva-1', 3);
  assert.equal(completa.length, 3);
  assert.equal(completa[2].nombreVisible, 'Dora Ejemplo');
});

test('el pedido manda la lista entera en orden, cada contacto con su forma', () => {
  const lista = subir(agregarPersonaNueva(guardada, { nombre: 'Dora', apellido: 'Ejemplo', telefono: '1155550004' }, 'nueva-1', 3), 2);
  assert.deepEqual(cuerpoDelPedido(lista), {
    contactos: [
      { personaId: ANA.personaId },
      { nombre: 'Dora', apellido: 'Ejemplo', telefono: '1155550004' },
      { personaId: BETO.personaId },
    ],
  });
});

test('se nota el cambio de orden, de cantidad y la persona nueva, y no hay cambio si nada se tocó', () => {
  assert.equal(cambio(guardada, guardada), false);
  assert.equal(cambio(subir(guardada, 1), guardada), true);
  assert.equal(cambio(quitar(guardada, 1), guardada), true);
});

test('el lugar de la persona en el Cliente sale de los textos de la base', () => {
  const textos = { contratante: 'Contratante', responsable_de_pagos: 'Responsable de pagos' };
  assert.deepEqual(rolesDe(ANA, textos), ['Contratante', 'Responsable de pagos']);
});

test('cada rechazo del backend encuentra su texto, y lo demás queda para la frase general', () => {
  const textos = { error: { demasiados: 'a', repetido: 'b', inexistente: 'c', faltan_datos: 'd', telefono_invalido: 'e' } };
  assert.equal(textoDelError({ motivo: 'demasiados_contactos_de_emergencia' }, textos), 'a');
  assert.equal(textoDelError({ motivo: 'contacto_de_emergencia_repetido' }, textos), 'b');
  assert.equal(textoDelError({ motivo: 'contacto_de_emergencia_inexistente' }, textos), 'c');
  assert.equal(textoDelError({ motivo: 'faltan_datos' }, textos), 'd');
  assert.equal(textoDelError({ motivo: 'telefono_invalido' }, textos), 'e');
  assert.equal(textoDelError({ motivo: 'sin_permiso' }, textos), null);
});

test('las frases de la pantalla están en los tres idiomas', () => {
  const claves = Object.keys(T['es-AR'].contactos_de_emergencia);
  for (const idioma of ['es-AR', 'en', 'pt-BR']) {
    const textos = T[idioma].contactos_de_emergencia;
    assert.deepEqual(Object.keys(textos), claves, idioma);
    for (const campo of ['persona', 'nombre', 'apellido', 'telefono']) assert.ok(textos.falta[campo], `${idioma} ${campo}`);
  }
});
