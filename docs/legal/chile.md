# Legislación — Chile

> **La sección «Riesgo laboral — sin investigar todavía» está vacía de contenido real:** no se
> investigó todavía la legislación laboral de Chile. **Mientras esa sección no tenga la tabla de
> advertencias completa, el sistema no muestra ninguna advertencia laboral para Prestadoras de
> esta jurisdicción**: sin documento no hay aviso, y no se improvisa (`celtatech/CLAUDE.md`,
> sección «El riesgo legal», y `celtatech/docs/REGLAS_PRODUCTOS_CAREONYS.md`, sección «Riesgo
> legal»).
>
> La sección «Protección de datos e historia clínica» sí tiene contenido.

## Riesgo laboral — sin investigar todavía

### Qué falta completar acá

Antes de dar de alta la primera Prestadora real de Chile, completar:

1. **Marco de referencia** — la norma laboral local equivalente al art. 23 de la LCT
   argentina (presunción de relación de dependencia laboral cuando hay prestación de
   servicios, salvo prueba en contrario), o el mecanismo legal que determine en esta
   jurisdicción cuándo una relación de prestación de servicios se reclasifica como relación
   de dependencia.
2. **Tabla de advertencias** (jurisdicción → función → texto), una fila por cada función de
   gestión de Asistentes que enumera `celtatech/docs/REGLAS_PRODUCTOS_CAREONYS.md`, sección
   «Riesgo legal»: penalización de inasistencias o inconductas, rankings, puntuaciones por
   aceptación de guardia, puntuaciones por calificación de Cliente/Paciente, límite de
   oportunidades futuras por rechazos, niveles/categorías/jerarquías por servicio, horarios
   fijos — y cualquier otra que se agregue después.
3. Idealmente, revisión de un abogado laboralista local antes de considerarlo definitivo —
   ver la misma salvedad en `docs/legal/argentina.md`.

### Disparador para completar esta sección

En el momento en que se detecte la primera Prestadora real con jurisdicción
Chile (no Sandbox, no datos de prueba), esta sección deja de ser opcional — hay que
completarla antes de habilitar esa Prestadora: antes de vender en un país nuevo, ese país tiene
que tener su documento (`celtatech/CLAUDE.md`, sección «El riesgo legal»).

## Protección de datos e historia clínica

> Los estados —**Cumple**,
> **En obra** con su paso de `docs/PLAN_HASTA_PRODUCCION.md`, y **No alcanza**— significan lo que
> dice la introducción de `docs/CUMPLIMIENTO_NORMATIVO.md`. Lo que comparten los diez países
> relevados se queda allá.

### Las normas

- **Norma de datos:** Ley 19.628; **Ley 21.719 vigente desde el 1-12-2026**, crea la APDP. Arts.
  1 bis, 13, 14 quinquies, 14 sexies, 15 bis, 15 ter, 16 bis, 27-29, 34 quáter.
- **Historia clínica:** Ley 20.584 arts. 3, 12 y 13; **Decreto 41/2012 arts. 6-13**; Ley 21.541
  (telemedicina); Ley 21.668.
- **Conservación:** **15 años desde el último ingreso de información** (Decreto 41/2012 art. 11).
  Eliminar después es **facultativo** (art. 12).
- **Brecha:** **«Sin dilaciones indebidas»**, sin plazo en horas. También al titular por ser datos
  sensibles.

### Las obligaciones particulares

- **Chile: el aislamiento tiene que seguir adentro de la Prestadora.** Es el hallazgo que más lejos
  llega de los diez países. El art. 13 de la Ley 20.584 prohíbe el acceso de terceros no
  relacionados con la atención «**Ello incluye al personal de salud y administrativo del mismo
  prestador, no vinculado a la atención de la persona**», y el art. 9 del Decreto 41/2012 obliga a
  tomar medidas para impedirlo. No alcanza con separar Prestadora de Prestadora: adentro de una
  Prestadora, quien no participa de la atención de esa persona no puede ver su historia. Es un
  segundo nivel de aislamiento, por vínculo con la atención y no por rol. **Aplicado en la base**
  — la política restrictiva de lectura `la_informacion_de_salud_la_ve_quien_atiende`, en nueve
  tablas de información de salud, y la función `interno.alcanza_la_informacion_de_salud`.
- **Chile: el registro de accesos es de lecturas, y es reglamentario.** El mismo art. 9 del Decreto
  41/2012: «Este sistema debe llevar registro de las fechas y personas que han accedido a las
  fichas.» No es auditoría de escritura. **En obra** — paso 9.
- **Chile: no hay refugio geográfico.** El art. 1 bis lit. b) de la Ley 19.628 nueva aplica la ley
  chilena al encargado que trata datos por cuenta de un responsable establecido en Chile, esté
  donde esté y con la base donde esté. Y el art. 3 de la Ley 20.584 lo dice desde el lado sanitario:
  el prestador es el responsable, los proveedores tienen «las responsabilidades propias de un
  mandatario», y **no lo exime usar software de terceros**.
- **Chile: subcontratar el alojamiento necesita permiso escrito de cada Prestadora.** El art. 15 bis
  prohíbe subencargar sin autorización específica y por escrito del responsable, y aun autorizada
  subsiste la responsabilidad solidaria. El proveedor de nube es un subencargado. **En obra** —
  paso 5.
- **Chile: la situación socioeconómica pasa a ser dato sensible.** El art. 2 lit. g) del texto que
  entra en vigor la pone junto a la salud. Es el segundo país que lo hace, después de Perú. Y el
  matiz importa: lo que el Cliente de la Prestadora paga por el servicio se trata por la ejecución del contrato (art.
  13 lit. c), pero una evaluación socioeconómica para asignar escalas de precio o subsidios es dato
  sensible y necesita base propia.
- **Chile: el delegado de protección de datos es potestativo.** Ecuador y Uruguay lo exigen y
  alcanza al encargado; en Chile, en cambio, el art. 50 lo deja **potestativo**.

### Transferencia internacional

**Chile** no tiene todavía lista de países adecuados ni cláusulas modelo —la Agencia no está
constituida—, así que la única vía practicable al 1-12-2026 es la del art. 27 lit. b), cláusulas
contractuales, **y la carga de acreditarlo es de la Prestadora** (art. 28), que sólo puede hacerlo
con documentación que le dé CeltaTech. **En obra** — pasos 5 y 127.

### Registro de bases ante la autoridad

**Chile no tiene registro de bases**, y además el art. tercero transitorio de la Ley 21.719 ordena
**eliminar** el registro de bancos de datos que hoy lleva el Registro Civil.

### Lo que no se verificó

- **Si Chile posterga la vigencia de su ley al 1-12-2027.** Hay un proyecto en trámite —boletín
  18.623-07, ingresado el 1-9-2026— que lo haría. **No es ley**, y su texto no se pudo leer: el
  sitio de la Cámara devolvió 403. Todo el diseño se hace contra el 1-12-2026, que es la fecha
  vigente.
- **Los estándares de seguridad que el art. 3 de la Ley 20.584 chilena manda dictar al Ministerio de
  Salud.** Se sabe que existen como mandato y que el prestador responde por incumplirlos; **no se
  identificó el acto que los contiene**. Puede haber requisitos técnicos obligatorios adicionales a
  los del Decreto 41/2012.
- **El reglamento chileno de acreditación de plataformas de salud digital** (art. 10 bis de la Ley
  20.584) y la actualización del Decreto 41/2012 que ordenó la Ley 21.668. No se localizaron.
- **Si existen cláusulas contractuales modelo chilenas.** Una fuente secundaria afirma que sí. Se
  considera dudoso: la Agencia que debería dictarlas no está constituida —el Senado rechazó la
  propuesta de consejeros el 20-5-2026 por falta de quórum—, y sin Agencia tampoco hay lista de
  países adecuados, ni contratos tipo, ni mecanismo de certificación.
- **El encuadre sanitario chileno de cada Prestadora.** El Decreto 1/2022 excluye de la
  hospitalización domiciliaria a la atención domiciliaria ambulatoria y de libre elección, lo que
  cambia mucho la carga regulatoria. Depende de cómo esté constituida y autorizada cada Prestadora,
  y no es algo que el producto pueda resolver en abstracto.
