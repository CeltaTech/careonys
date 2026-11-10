import { describe, expect, it } from 'vitest';
import { nombreDeLaAccion, queCambio } from '../registroDeActividad.js';
import { T as translations } from '../../i18n/translations.js';

// El borrado del registro de accesos y sus dos avisos por correo se leen en Auditoría con su
// nombre, en los tres idiomas, y dicen de qué año eran.
const ACCIONES = ['borrado_por_vencimiento', 'preaviso_de_borrado', 'notificacion_de_borrado'];

describe('el borrado del registro de accesos en Auditoría', () => {
  for (const idioma of Object.keys(translations)) {
    const t = translations[idioma];
    for (const accion of ACCIONES) {
      it(`${accion} tiene nombre en ${idioma} y dice el año`, () => {
        const fila = { accion, detalle: { anio: 2023 } };
        expect(nombreDeLaAccion(fila, t)).not.toBe(t.auditoria.accion_desconocida);
        expect(queCambio(fila, t)).toBe('2023');
      });
    }
  }
});
