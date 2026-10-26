// El estado documental de un Asistente, tal como se le puede contar al Cliente.
//
// Dos cosas que este bloque no hace, y las dos son deliberadas. No nombra ningún documento: el
// nombre de un tipo de documento puede ser dato de salud, y el Cliente contrató un servicio,
// no la historia clínica de quien lo presta. Y no afirma nada que el producto no haya comprobado:
// la última línea dice con todas las letras qué no se verifica —identidad, antecedentes,
// autenticidad—, que es la parte que en este tema termina en juicio cuando falta
// (`docs/PRD_07_Modalidad_Match.md:247`).
//
// La Matrícula es un documento más y entra en la cuenta como cualquier otro: no tiene renglón
// propio, porque nombrarla sería decir cuál de los documentos es cuál.
//
// Vive acá y no adentro de una pantalla porque lo dicen dos: lo cargado del Asistente que ya
// está trabajando en la casa, y el perfil público de la vidriera. Es la misma afirmación sobre
// la misma persona, y decirla distinto en dos lugares es exactamente lo que no puede pasar.
export default function EstadoDocumental({ resumen, alDia, documentosExigidos, t }) {
  if (!resumen) return null;
  const hayExigencias = resumen !== 'sin_exigencias';
  return (
    <section className="pwa-card">
      <h2>{t.asistente.documentacion_titulo}</h2>
      <p className="pwa-card-dato">{t.asistente[`documentacion_${resumen}`]}</p>
      {hayExigencias && (
        <p className="pwa-card-dato">
          {t.asistente.documentacion_cuenta
            .replace('{alDia}', alDia)
            .replace('{total}', documentosExigidos)}
        </p>
      )}
      <p className="mini mini-abajo">{t.asistente.documentacion_que_no_se_verifica}</p>
    </section>
  );
}
