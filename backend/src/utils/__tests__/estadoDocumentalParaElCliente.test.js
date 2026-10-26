/**
 * El estado documental que ve el Cliente.
 *
 *   npm test --prefix backend
 *
 * QUÉ SE PRUEBA ACÁ, Y POR QUÉ ESTO. Lo que se equivoca fácil en una cuenta como ésta es
 * redondear para arriba: dar por "al día" un documento que nunca se cargó, uno que espera
 * revisión o uno que la Prestadora observó. Ésa es exactamente la afirmación por la que
 * sancionaron a Care.com, y es lo que primero prueban las pruebas de abajo.
 *
 * Qué daría con el sistema roto: si alguien contara los documentos enviados en vez de los
 * aprobados, la prueba del documento en revisión daría "al_dia"; si contara los cargados en vez de
 * los pedidos, la del documento que falta también.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RESUMEN_DOCUMENTAL, estadoDocumentalParaElCliente } from '../estadoDocumentalParaElCliente.js';

const HOY = new Date('2026-09-15T10:00:00');

const armar = (documentos) => estadoDocumentalParaElCliente({ documentos, diasAviso: 30, ahora: HOY });

describe('el estado documental agregado que ve el Cliente', () => {
  it('sin documentos pedidos no informa nada', () => {
    const estado = armar([]);
    assert.equal(estado.resumen, RESUMEN_DOCUMENTAL.SIN_EXIGENCIAS);
    assert.equal(estado.documentosExigidos, 0);
  });

  it('todo aprobado y lejos de vencer queda al día', () => {
    const estado = armar([
      { estado: 'aprobado', fecha_vencimiento: '2027-01-01' },
      { estado: 'aprobado', fecha_vencimiento: null },
    ]);
    assert.equal(estado.resumen, RESUMEN_DOCUMENTAL.AL_DIA);
    assert.equal(estado.alDia, 2);
    assert.equal(estado.documentosExigidos, 2);
  });

  it('un documento que falta deja la documentación incompleta, no al día', () => {
    const estado = armar([
      { estado: 'aprobado', fecha_vencimiento: '2027-01-01' },
      { estado: null, fecha_vencimiento: null },
    ]);
    assert.equal(estado.resumen, RESUMEN_DOCUMENTAL.INCOMPLETA);
    assert.equal(estado.pendientes, 1);
    assert.equal(estado.alDia, 1);
  });

  it('uno en revisión no está al día: nadie lo aprobó todavía', () => {
    const estado = armar([{ estado: 'en_revision', fecha_vencimiento: '2027-01-01' }]);
    assert.equal(estado.resumen, RESUMEN_DOCUMENTAL.INCOMPLETA);
    assert.equal(estado.alDia, 0);
  });

  it('uno observado tampoco', () => {
    const estado = armar([{ estado: 'observado', fecha_vencimiento: '2027-01-01' }]);
    assert.equal(estado.resumen, RESUMEN_DOCUMENTAL.INCOMPLETA);
    assert.equal(estado.pendientes, 1);
  });

  it('lo que entra en la ventana de aviso se dice como por vencer', () => {
    const estado = armar([{ estado: 'aprobado', fecha_vencimiento: '2026-10-05' }]);
    assert.equal(estado.resumen, RESUMEN_DOCUMENTAL.POR_VENCER);
    assert.equal(estado.porVencer, 1);
  });

  it('un vencido tapa a todo lo demás: es lo que hay que saber hoy', () => {
    const estado = armar([
      { estado: 'aprobado', fecha_vencimiento: '2026-08-01' },
      { estado: null, fecha_vencimiento: null },
    ]);
    assert.equal(estado.resumen, RESUMEN_DOCUMENTAL.VENCIDA);
    assert.equal(estado.vencidos, 1);
    assert.equal(estado.pendientes, 1);
  });

  it('de acá no sale el nombre de ningún documento', () => {
    const estado = armar([{ estado: 'aprobado', fecha_vencimiento: '2027-01-01', nombre: 'Certificado psicofísico' }]);
    assert.ok(!JSON.stringify(estado).includes('psicofísico'));
  });
});
