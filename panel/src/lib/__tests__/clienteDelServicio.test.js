import { describe, expect, it, vi } from 'vitest';

import { clienteDelServicio, contactosDeClientes } from '../clienteDelServicio';

const CLIENTE = '40000000-0000-4000-8000-000000000001';
const OTRO_CLIENTE = '40000000-0000-4000-8000-000000000002';

const CONTACTO = {
  nombre: 'Cliente Gómez',
  localidad: 'Vicente López',
  telefono: '+54 11 5555-0000',
  email: 'contacto.inventado@ejemplo.test',
};

// Cómo llega ese mismo contacto desde el Directorio de Personas: los datos de quien
// contrata, su lugar y sus teléfonos.
const PERSONA = {
  nombre_visible: 'Cliente Gómez',
  email: 'contacto.inventado@ejemplo.test',
  lugares: { nombre: 'Vicente López' },
  telefonos_de_la_persona: [{ telefono: '+54 11 5555-0000' }],
};

const SERVICIO_DE_UN_CLIENTE = { id: 's1', cliente_id: CLIENTE };

const CONTACTOS = new Map([[CLIENTE, CONTACTO]]);

describe('clienteDelServicio', () => {
  it('devuelve el contacto del Cliente y el camino a la Ficha del cliente', () => {
    expect(clienteDelServicio(SERVICIO_DE_UN_CLIENTE, CONTACTOS)).toEqual({
      id: CLIENTE,
      contacto: CONTACTO,
      ruta: `/clientes/${CLIENTE}`,
    });
  });

  it('no ofrece Ficha del cliente si el identificador del Cliente falta', () => {
    const sinCliente = { ...SERVICIO_DE_UN_CLIENTE, cliente_id: null };
    expect(clienteDelServicio(sinCliente, CONTACTOS).ruta).toBeNull();
  });

  it('aguanta que todavía no haya llegado el Servicio, que es el estado «cargando»', () => {
    expect(clienteDelServicio(null, CONTACTOS)).toEqual({ id: null, contacto: null, ruta: null });
  });

  it('aguanta que los contactos todavía no hayan llegado', () => {
    expect(clienteDelServicio(SERVICIO_DE_UN_CLIENTE, new Map()).contacto).toBeNull();
    expect(clienteDelServicio(SERVICIO_DE_UN_CLIENTE, undefined).contacto).toBeNull();
    expect(clienteDelServicio(SERVICIO_DE_UN_CLIENTE, new Map()).ruta).toBe(`/clientes/${CLIENTE}`);
  });
});

// Arma un doble de la base que devuelve lo que se le diga y deja ver con qué se lo llamó.
function baseFalsa(respuesta) {
  const enIn = vi.fn().mockResolvedValue(respuesta);
  const enSelect = vi.fn(() => ({ in: enIn }));
  const enFrom = vi.fn(() => ({ select: enSelect }));
  return { supabase: { from: enFrom }, enFrom, enSelect, enIn };
}

describe('contactosDeClientes', () => {
  it('trae una sola vez cada Cliente, aunque tenga varios Servicios', async () => {
    const { supabase, enIn } = baseFalsa({
      data: [{ id: CLIENTE, personas: PERSONA }],
      error: null,
    });

    const { contactos, error } = await contactosDeClientes(supabase, [
      SERVICIO_DE_UN_CLIENTE,
      { ...SERVICIO_DE_UN_CLIENTE, id: 's2' },
    ]);

    expect(enIn).toHaveBeenCalledWith('id', [CLIENTE]);
    expect(error).toBeNull();
    expect(contactos.get(CLIENTE)).toEqual(CONTACTO);
  });

  it('aguanta que todavía no haya llegado ningún Servicio', async () => {
    const { supabase, enFrom } = baseFalsa({ data: [], error: null });
    const { contactos } = await contactosDeClientes(supabase, null);
    expect(enFrom).not.toHaveBeenCalled();
    expect(contactos.size).toBe(0);
  });

  // Una persona que la base no devuelve —la protección por fila no la deja ver— no puede
  // dejar un renglón indefinido adentro del mapa: la pantalla muestra un guion.
  it('deja afuera al Cliente cuyos datos no llegaron', async () => {
    const { supabase } = baseFalsa({
      data: [
        { id: CLIENTE, personas: PERSONA },
        { id: OTRO_CLIENTE, personas: null },
      ],
      error: null,
    });

    const { contactos } = await contactosDeClientes(supabase, [
      SERVICIO_DE_UN_CLIENTE,
      { ...SERVICIO_DE_UN_CLIENTE, id: 's2', cliente_id: OTRO_CLIENTE },
    ]);

    expect(contactos.size).toBe(1);
    expect(contactos.has(OTRO_CLIENTE)).toBe(false);
  });

  it('devuelve la falla de la base en vez de tragársela', async () => {
    const falla = { message: 'se cayó' };
    const { supabase } = baseFalsa({ data: null, error: falla });

    const { contactos, error } = await contactosDeClientes(supabase, [SERVICIO_DE_UN_CLIENTE]);

    expect(error).toBe(falla);
    expect(contactos.size).toBe(0);
  });
});
