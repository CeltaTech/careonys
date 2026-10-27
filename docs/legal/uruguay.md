# Legislación — Uruguay

> **La sección «Riesgo laboral — sin investigar todavía» está vacía de contenido real:** no se
> investigó todavía la legislación laboral de Uruguay. **Mientras esa sección no tenga la tabla de
> advertencias completa, el sistema no muestra ninguna advertencia laboral para Prestadoras de
> esta jurisdicción**: sin documento no hay aviso, y no se improvisa (`celtatech/CLAUDE.md`,
> sección «El riesgo legal», y `celtatech/docs/REGLAS_PRODUCTOS_CAREONYS.md`, sección «Riesgo
> legal»).
>
> La sección «Protección de datos e historia clínica» sí tiene contenido.

## Riesgo laboral — sin investigar todavía

### Qué falta completar acá

Antes de dar de alta la primera Prestadora real de Uruguay, completar:

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
Uruguay (no Sandbox, no datos de prueba), esta sección deja de ser opcional — hay que
completarla antes de habilitar esa Prestadora: antes de vender en un país nuevo, ese país tiene
que tener su documento (`celtatech/CLAUDE.md`, sección «El riesgo legal»).

## Protección de datos e historia clínica

> Los estados —**Cumple**,
> **En obra** con su paso de `docs/PLAN_HASTA_PRODUCCION.md`, y **No alcanza**— significan lo que
> dice la introducción de `docs/CUMPLIMIENTO_NORMATIVO.md`. Lo que comparten los diez países
> relevados se queda allá.

### Las normas

- **Norma de datos:** Ley 18.331 arts. 4 E, 18, 19 y 23; Decreto 414/009; Decreto 64/020 arts. 4,
  6 y 10. **Adecuación europea por Decisión 2012/484/UE**.
- **Historia clínica:** HCEN: Decreto 242/017 arts. 3, 13 y 16; Decreto 122/019; Ley 19.869 y
  Decreto 127/024 (telemedicina).
- **Conservación:** 2 + 3 = 5 años (Decreto 355/982), pero es **facultad de destruir, no
  obligación de conservar**; la historia electrónica **no se borra** (242/017 art. 13).
- **Brecha:** 72 horas, **sólo a la autoridad**.

### Lo que comparte con los otros nueve países

De las cinco exigencias que los diez comparten, listadas en `docs/CUMPLIMIENTO_NORMATIVO.md`,
Uruguay figura en una:

- **Corrección por nota aclaratoria, nunca por sobreescritura** (Decreto 242/017 art. 13).
  **Cumple** en `indicaciones_medicacion`, `rangos_referencia_vitales` y
  `domicilios_temporales_paciente`: cada corrección deja su versión con nota aclaratoria, y nadie
  la edita ni la borra. Lo corregido desde el Panel todavía queda sin autor — **en obra**, paso 9.

### Las obligaciones particulares

- **Uruguay exige delegado de protección de datos, y alcanza al encargado.** Por el art. 10 del
  Decreto 64/020, cuando se tratan datos sensibles como actividad principal. **No alcanza** — es
  obligación societaria de CeltaTech, no del producto.
- **El cifrado de audio y video ya no es una rareza argentina: son dos países.** El Decreto 98/2023
  argentino y el art. 10 del Decreto 127/024 uruguayo, que exige «sistema de cifrado actualizado» en
  los servicios con transmisión de audio y video en simultáneo. **En obra** — paso 13.
- **Uruguay: la historia clínica electrónica no se borra.** El art. 13 del Decreto 242/017: «La
  información no podrá ser alterada o eliminada sin que quede registrada la modificación», y la
  corrección agrega el dato nuevo «sin suprimir lo corregido». Los cinco años del Decreto 355/982
  son **facultad de destruir**, pensada para el papel: quien no destruye no incumple. Refuerza la
  regla del paso 122 —vencido el plazo el sistema avisa y espera, nunca borra— con un país donde
  borrar sería lo incorrecto.

### Transferencia internacional

**Uruguay** no excluye por definición la entrega de los datos al encargado, pero llegó al mismo
resultado que los países que la excluyen por otro camino: la URCDP declaró **ajustadas a la
normativa nacional las cláusulas contractuales de AWS** (Resolución 42/022) y autorizó
transferencias a servidores de AWS fundadas en ellas (Resolución 18/024). Eso es lo que habilita
São Paulo para datos uruguayos, y hace falta porque **Brasil no está en la lista de países
adecuados** de la Resolución URCDP 23/021, ampliada por la 63/023.

**Y una advertencia:** que no haya que firmar cláusulas de transferencia no alivia nada. El
contrato de encargo sigue siendo obligatorio, con contenido mínimo, y las medidas de seguridad son
las mismas. Lo único que desaparece es un trámite.

### Registro de bases ante la autoridad

Uruguay inscribe las bases dentro de los 90 días de iniciar actividad. **En obra** — paso 127, como
aviso por país. Nunca como bloqueo.

### Integración nacional obligatoria

El HCEN uruguayo es una integración nacional obligatoria que el plan no construye, y es obra
propia.

### Lo que no se verificó

- **El régimen uruguayo de cuidados domiciliarios sin habilitación sanitaria.** El Decreto 242/017
  obliga a todos los prestadores a llevar historia clínica electrónica y a usar la Plataforma, pero
  delega condiciones y plazos en el Ministerio, que sólo los fijó para siete grupos del Plan de
  Adopción. Los cuidados domiciliarios sin habilitación sanitaria **no están en ninguno**. La
  internación domiciliaria sí es servicio habilitado y entraría como prestador privado parcial.
