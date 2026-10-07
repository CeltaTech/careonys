import { describe, expect, it, vi } from 'vitest';

import { TIPO_CLIENTE, clienteDelServicio, contactosDeClientes } from '../clienteDelServicio';

const CLIENTE = '40000000-0000-4000-8000-000000000001';
const OTRO_CLIENTE = '40000000-0000-4000-8000-000000000002';

const CONTACTO = {
  nombre: 'Cliente Gómez',
  localidad: 'Vicente López',
  telefono: '+54 11 5555-0000',
  email: 'contacto.inventado@ejemplo.test',
};

const SERVICIO_DE_UN_CLIENTE = {
  id: 's1',
  tipo_contratante: TIPO_CLIENTE,
  contratante_id: CLIENTE,
};

const CONTACTOS = new Map([[CLIENTE, CONTACTO]]);

describe('clienteDelServicio', () => {
  it('cuando el Cliente es un Cliente, devuelve su contacto y el camino a la Ficha del cliente', () => {
    expect(clienteDelServicio(SERVICIO_DE_UN_CLIENTE, CONTACTOS)).toEqual({
      tipo: TIPO_CLIENTE,
      id: CLIENTE,
      contacto: CONTACTO,
      ruta: `/clientes/${CLIENTE}`,
    });
  });

  // La prueba que hace que este archivo sirva de algo: el día que un Servicio lo contrate algo
  // que no es un Cliente, la pantalla no puede mandar a nadie a la Ficha del cliente de uno que no
  // existe. Sin `ruta`, el botón no se dibuja.
  it('cuando el Cliente no es un Cliente, no ofrece ninguna Ficha del cliente', () => {
    const otro = { ...SERVICIO_DE_UN_CLIENTE, tipo_contratante: 'obra_social' };
    expect(clienteDelServicio(otro, CONTACTOS)).toEqual({
      tipo: 'obra_social',
      id: CLIENTE,
      contacto: null,
      ruta: null,
    });
  });

  it('no ofrece Ficha del cliente si el identificador del Cliente falta', () => {
    const sinCliente = { ...SERVICIO_DE_UN_CLIENTE, contratante_id: null };
    expect(clienteDelServicio(sinCliente, CONTACTOS).ruta).toBeNull();
  });

  it('aguanta que todavía no haya llegado el Servicio, que es el estado «cargando»', () => {
    expect(clienteDelServicio(null, CONTACTOS)).toEqual({ tipo: null, id: null, contacto: null, ruta: null });
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
      data: [{ id: CLIENTE, solicitudes: CONTACTO }],
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

  // Si no hay ningún Cliente que buscar, no se consulta: una pantalla de Servicios de Clientes
  // que no son Clientes no tiene por qué pagar una consulta que va a volver vacía.
  it('no consulta nada cuando ningún Cliente es un Cliente', async () => {
    const { supabase, enFrom } = baseFalsa({ data: [], error: null });

    const { contactos } = await contactosDeClientes(supabase, [
      { ...SERVICIO_DE_UN_CLIENTE, tipo_contratante: 'obra_social' },
    ]);

    expect(enFrom).not.toHaveBeenCalled();
    expect(contactos.size).toBe(0);
  });

  it('aguanta que todavía no haya llegado ningún Servicio', async () => {
    const { supabase, enFrom } = baseFalsa({ data: [], error: null });
    const { contactos } = await contactosDeClientes(supabase, null);
    expect(enFrom).not.toHaveBeenCalled();
    expect(contactos.size).toBe(0);
  });

  // Un Cliente que entró sin solicitud no tiene de dónde sacar el contacto, y eso no puede
  // dejar un renglón indefinido adentro del mapa: la pantalla muestra un guion.
  it('deja afuera al Cliente que no tiene solicitud', async () => {
    const { supabase } = baseFalsa({
      data: [
        { id: CLIENTE, solicitudes: CONTACTO },
        { id: OTRO_CLIENTE, solicitudes: null },
      ],
      error: null,
    });

    const { contactos } = await contactosDeClientes(supabase, [
      SERVICIO_DE_UN_CLIENTE,
      { ...SERVICIO_DE_UN_CLIENTE, id: 's2', contratante_id: OTRO_CLIENTE },
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
