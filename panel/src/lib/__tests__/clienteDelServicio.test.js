import { describe, expect, it } from 'vitest';

import { TIPO_CLIENTE, clienteDelServicio } from '../clienteDelServicio';

const CLIENTE = '40000000-0000-4000-8000-000000000001';

const CONTACTO = {
  nombre: 'Cliente Gómez',
  localidad: 'Vicente López',
  telefono: '+54 11 5555-0000',
  email: 'contacto.inventado@ejemplo.test',
};

const SERVICIO_DE_UNA_CLIENTE = {
  id: 's1',
  tipo_contratante: TIPO_CLIENTE,
  contratante_id: CLIENTE,
  clientes: { id: CLIENTE, solicitudes: CONTACTO },
};

describe('clienteDelServicio', () => {
  it('cuando el Cliente es un Cliente, devuelve su contacto y el camino a su ficha', () => {
    expect(clienteDelServicio(SERVICIO_DE_UNA_CLIENTE)).toEqual({
      tipo: TIPO_CLIENTE,
      id: CLIENTE,
      contacto: CONTACTO,
      ruta: `/clientes/${CLIENTE}`,
    });
  });

  // La prueba que hace que este archivo sirva de algo: el día que un Servicio lo contrate algo
  // que no es un Cliente, la pantalla no puede mandar a nadie a la ficha de un Cliente que no
  // existe. Sin `ruta`, el botón no se dibuja.
  it('cuando el Cliente no es un Cliente, no ofrece ninguna ficha', () => {
    const otro = { ...SERVICIO_DE_UNA_CLIENTE, tipo_contratante: 'obra_social', clientes: null };
    expect(clienteDelServicio(otro)).toEqual({
      tipo: 'obra_social',
      id: CLIENTE,
      contacto: null,
      ruta: null,
    });
  });

  it('no ofrece ficha si el identificador del Cliente falta', () => {
    const sinCliente = { ...SERVICIO_DE_UNA_CLIENTE, contratante_id: null };
    expect(clienteDelServicio(sinCliente).ruta).toBeNull();
  });

  it('aguanta que todavía no haya llegado el Servicio, que es el estado «cargando»', () => {
    expect(clienteDelServicio(null)).toEqual({ tipo: null, id: null, contacto: null, ruta: null });
  });

  it('aguanta que el Servicio venga sin la solicitud anidada', () => {
    const sinSolicitud = { ...SERVICIO_DE_UNA_CLIENTE, clientes: { id: CLIENTE } };
    expect(clienteDelServicio(sinSolicitud).contacto).toBeNull();
    expect(clienteDelServicio(sinSolicitud).ruta).toBe(`/clientes/${CLIENTE}`);
  });
});
