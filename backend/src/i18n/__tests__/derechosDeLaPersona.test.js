/**
 * El correo que avisa que vence el plazo para responder lo que una persona pidió sobre sus datos.
 *
 *   npm test --prefix backend
 *
 * Las frases se leen de la migración que las siembra, no de este archivo: si el código pide una
 * clave que la base no trae, o la trae en menos de tres idiomas, esta prueba rompe. Datos
 * inventados, como manda CLAUDE.md §6.
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { sembrarMensajesDelSistema } from '../mensajesDelSistema.js';
import { filasSembradas } from './mensajesSembrados.js';
import { avisoDeDerechoPorVencer, DERECHOS_DE_LA_PERSONA } from '../derechosDeLaPersona.js';
import { IDENTIDAD } from '../../config/identidadProducto.js';

const MIGRACION = new URL(
  '../../../../supabase/migrations/20270409000200_los_derechos_de_la_persona_y_sus_plazos.sql',
  import.meta.url,
);
const SIEMBRA = /\('([^']+)',\s*'(\{.*?\})'::jsonb(?:,\s*(true|false),\s*(true|false))?\)/g;

const texto = readFileSync(MIGRACION, 'utf8');
const propias = [...texto.matchAll(SIEMBRA)].map(([, clave, i18n, admite, activo]) => ({
  clave,
  prestadora_id: null,
  activo: activo !== 'false',
  admite_texto_propio: admite !== 'false',
  i18n: JSON.parse(i18n),
}));
sembrarMensajesDelSistema([...filasSembradas(), ...propias]);

const IDIOMAS = ['es-AR', 'en', 'pt-BR'];
const MARCA_DE_FALTANTE = /derechos_de_la_persona|\{\{/;

describe('las frases de los derechos de la persona', () => {
  it('la migración siembra cada derecho del catálogo y las dos frases del correo, en los tres idiomas', () => {
    const esperadas = [
      'derechos_de_la_persona.aviso_de_vencimiento.asunto',
      'derechos_de_la_persona.aviso_de_vencimiento.texto',
      ...DERECHOS_DE_LA_PERSONA.map((d) => `derechos_de_la_persona.derecho.${d}`),
    ];
    assert.deepEqual(propias.map((f) => f.clave).sort(), esperadas.sort());
    for (const fila of propias) {
      for (const idioma of IDIOMAS) {
        assert.ok(fila.i18n[idioma]?.trim(), `${fila.clave} no tiene ${idioma}`);
      }
    }
  });

  it('el catálogo de derechos del código es el mismo que siembra la base', () => {
    const delCatalogo = [...texto.matchAll(/\('([a-z_]+)',\s+\d+\)/g)].map((m) => m[1]);
    assert.deepEqual(delCatalogo.sort(), [...DERECHOS_DE_LA_PERSONA].sort());
  });

  it('el correo sale armado en cada idioma, con las fechas y sin marcadores sueltos', () => {
    for (const idioma of IDIOMAS) {
      for (const tipo of DERECHOS_DE_LA_PERSONA) {
        const { asunto, texto: cuerpo } = avisoDeDerechoPorVencer(idioma, {
          tipo, recibidaEl: '2027-03-02', venceEl: '2027-03-16',
        });
        assert.doesNotMatch(asunto, MARCA_DE_FALTANTE, `${idioma} ${tipo}: ${asunto}`);
        assert.doesNotMatch(cuerpo, MARCA_DE_FALTANTE, `${idioma} ${tipo}: ${cuerpo}`);
        assert.match(asunto, /16\/3\/2027/);
        assert.match(cuerpo, /2\/3\/2027/);
        assert.ok(cuerpo.includes(IDENTIDAD.nombre), 'falta la marca al pie');
      }
    }
  });
});
