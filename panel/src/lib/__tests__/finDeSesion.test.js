/**
 * La constancia del fin de la sesión, que nunca frena el cierre.
 *
 *   npx vitest run src/lib/__tests__/finDeSesion.test.js
 *
 * Lo que hay que sostener: la constancia se pide con la causa, y si el pedido falla o tarda, la
 * sesión se cierra igual. Con el sistema roto, un pedido que no contesta dejaría a la persona sin
 * poder salir, y un pedido rechazado cortaría el cierre con un error.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { anotarFinDeSesion, CAUSAS_DE_FIN_DE_SESION } from '../finDeSesion';

afterEach(() => {
  vi.useRealTimers();
});

describe('la constancia del fin de la sesión', () => {
  it('se pide con la causa', async () => {
    const enviar = vi.fn().mockResolvedValue({ ok: true });
    await anotarFinDeSesion(enviar, CAUSAS_DE_FIN_DE_SESION.POR_INACTIVIDAD);
    expect(enviar).toHaveBeenCalledWith('por_inactividad');
  });

  it('si el pedido falla, termina igual y sin error', async () => {
    const enviar = vi.fn().mockRejectedValue(new Error('sin conexión'));
    await expect(anotarFinDeSesion(enviar, CAUSAS_DE_FIN_DE_SESION.A_MANO)).resolves.toBeUndefined();
  });

  it('si el envío se rompe antes de salir, termina igual', async () => {
    const enviar = vi.fn(() => {
      throw new Error('roto');
    });
    await expect(anotarFinDeSesion(enviar, CAUSAS_DE_FIN_DE_SESION.A_MANO)).resolves.toBeUndefined();
  });

  it('si el pedido no contesta, deja de esperar al cumplirse el plazo', async () => {
    vi.useFakeTimers();
    const enviar = vi.fn(() => new Promise(() => {}));
    let termino = false;
    const espera = anotarFinDeSesion(enviar, CAUSAS_DE_FIN_DE_SESION.A_MANO, 3000).then(() => {
      termino = true;
    });
    await vi.advanceTimersByTimeAsync(2999);
    expect(termino).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await espera;
    expect(termino).toBe(true);
  });
});
