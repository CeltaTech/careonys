import { describe, it, expect } from 'vitest';
import { partir, asuntoDe, ASUNTOS } from '../avisosEnVivo';

/* Lo que se prueba acá es la lectura del formato que manda el backend. La red entrega los pedazos
   donde se le ocurre: un mensaje puede llegar partido al medio y dos mensajes pueden llegar juntos.
   Si esto se lee mal, la pantalla no se entera de nada y no hay ningún error a la vista. */

describe('partir', () => {
  it('devuelve los mensajes completos y guarda lo que quedó a medias', () => {
    const { mensajes, pendiente } = partir('', 'event: uno\ndata: {}\n\nevent: do');
    expect(mensajes).toEqual(['event: uno\ndata: {}']);
    expect(pendiente).toBe('event: do');
  });

  it('pega lo que quedó a medias con lo que llega después', () => {
    const primero = partir('', 'event: pedi');
    expect(primero.mensajes).toEqual([]);

    const segundo = partir(primero.pendiente, 'dos\ndata: {}\n\n');
    expect(segundo.mensajes).toEqual(['event: pedidos\ndata: {}']);
    expect(segundo.pendiente).toBe('');
  });

  it('separa dos mensajes que llegaron en la misma lectura', () => {
    const { mensajes } = partir('', 'event: uno\n\nevent: dos\n\n');
    expect(mensajes).toEqual(['event: uno', 'event: dos']);
  });

  it('no da por completo un mensaje al que le falta el renglón en blanco', () => {
    const { mensajes, pendiente } = partir('', 'event: uno\ndata: {}\n');
    expect(mensajes).toEqual([]);
    expect(pendiente).toBe('event: uno\ndata: {}\n');
  });
});

describe('asuntoDe', () => {
  it('saca el asunto del mensaje', () => {
    expect(asuntoDe(`event: ${ASUNTOS.PEDIDOS_DE_CODIGO}\ndata: {}`)).toBe(
      ASUNTOS.PEDIDOS_DE_CODIGO,
    );
  });

  // La señal de vida del backend llega como comentario del protocolo. Tomarla por un mensaje haría
  // que la pantalla volviera a pedir la lista cada veinte segundos sin que hubiera pasado nada.
  it('no ve ningún asunto en un comentario del protocolo', () => {
    expect(asuntoDe(': sigo acá')).toBe(null);
    expect(asuntoDe(': conectado')).toBe(null);
  });

  it('no ve ningún asunto donde no hay renglón de asunto', () => {
    expect(asuntoDe('data: {}')).toBe(null);
    expect(asuntoDe('')).toBe(null);
  });
});
