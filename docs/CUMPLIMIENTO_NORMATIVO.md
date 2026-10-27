# A qué normas da cumplimiento Careonys

Este documento dice qué normas alcanzan a Careonys y en qué estado está el sistema frente a cada
una. **Lo de cada país —sus normas, con artículo, y el estado de cada renglón— está en su propio
documento, en `docs/legal/<país>.md`**, y esos documentos son la referencia. Acá queda sólo lo que
no es de un país: lo que comparten varios, los marcos de auditoría y lo que el producto ya cumple.
Está escrito para que lo lea un auditor o el área de compras de un comprador, y para que cada
afirmación se pueda verificar contra el producto.

**Tres estados, y no hay un cuarto.**

| Estado | Qué significa |
|---|---|
| **Cumple** | Está construido y se puede mostrar funcionando |
| **En obra** | Está planificado en `docs/PLAN_HASTA_PRODUCCION.md`, con su paso |
| **No alcanza** | La norma no aplica al producto, y se dice por qué |

Lo que no está en ninguno de los tres no se afirma.

**Lo que este documento no dice.** No afirma ninguna certificación. No existe certificación de
HIPAA de ninguna clase, ni oficial ni acreditada: todo sello que diga «HIPAA certified» es
autoafirmación y jurídicamente no sirve como defensa. Tampoco existe «estar certificado en GDPR»:
los arts. 42 y 43 certifican operaciones concretas, no organizaciones, y el art. 42(4) dice que la
certificación no reduce la responsabilidad. SOC 2 es una atestación y C5 es un dictamen de auditor,
ninguno de los dos es certificación. ISO/IEC 27001 sí se certifica, y hoy Careonys no la tiene.

**Qué es CeltaTech frente a cada norma.** CeltaTech desarrolla y licencia el software; quien presta
el servicio de cuidado es el Cliente. En el vocabulario de las normas, el Cliente es el responsable
del tratamiento —*covered entity* en Estados Unidos, *responsable*, *controlador* o *controlador* en
Latinoamérica— y CeltaTech es el encargado —*business associate*, *encargado*, *operador*,
*operador*—. Eso determina qué obligación es de cada uno, y está señalado en cada documento por país.

---

## Los documentos por país

| Documento | Protección de datos e historia clínica | Riesgo laboral |
|---|---|---|
| `argentina.md` | Relevado | Relevado |
| `brasil.md` | Relevado | Sin investigar |
| `chile.md` | Relevado | Sin investigar |
| `uruguay.md` | Relevado | Sin investigar |
| `mexico.md` | Relevado | Sin investigar |
| `colombia.md` | Relevado | Sin investigar |
| `peru.md` | Relevado | Sin investigar |
| `ecuador.md` | Relevado | Sin investigar |
| `costa_rica.md` | Relevado | Sin investigar |
| `panama.md` | Relevado | Sin investigar |
| `espana.md` | Relevado | Sin investigar |
| `estados_unidos.md` | Relevado | — |
| `union_europea.md` | Relevado | — |
| `alemania.md` | Relevado | — |
| `francia.md` | Relevado | — |
| `suecia.md` | Relevado | — |
| `paises_bajos.md` | Relevado | — |
| `bolivia.md` | Sin investigar | Sin investigar |
| `cuba.md` | Sin investigar | Sin investigar |
| `el_salvador.md` | Sin investigar | Sin investigar |
| `guatemala.md` | Sin investigar | Sin investigar |
| `honduras.md` | Sin investigar | Sin investigar |
| `nicaragua.md` | Sin investigar | Sin investigar |
| `paraguay.md` | Sin investigar | Sin investigar |
| `portugal.md` | Sin investigar | Sin investigar |
| `republica_dominicana.md` | Sin investigar | Sin investigar |
| `venezuela.md` | Sin investigar | Sin investigar |

Lo de `union_europea.md` vale además para cada país de la Unión: España, Alemania, Francia, Suecia,
Países Bajos y Portugal suman lo propio en su documento.

---

## Lo que comparten los diez países de Latinoamérica

**Las cinco exigencias que los diez comparten, y que el plan traduce a producto:**

1. **Consentimiento expreso para datos de salud** (Costa Rica art. 5, Panamá art. 8, Brasil art. 11,
   Argentina art. 8, Ecuador, Perú). **Cumple** la estructura; **en obra** los textos por país —
   paso 127.
2. **Acceso limitado a lo necesario.** La norma panameña no dice «mínimo privilegio»: el art. 8 del
   Decreto 285 se titula **principio de proporcionalidad**, y su párrafo final impone tres límites
   que se acumulan — **quién** accede (sólo quien lo necesita para su función), **cuánta**
   información recibe y **por cuánto tiempo** conserva ese acceso. El tercero es el que casi
   siempre falta. Y el deber recae expresamente sobre el custodio, no sólo sobre la Prestadora.
   **En obra** — plan de aislamiento.
3. **Registro de accesos con identidad y período de todas las personas que ingresaron** (Panamá
   Decreto 285 art. 35 num. 12; Costa Rica reglamento art. 47). La norma panameña pide sólo dos
   datos: quién ingresó y en qué período; no exige anotar la operación ni el registro tocado. Aun
   así conviene anotar la operación, porque el art. 38 obliga a documentar «los hechos y efectos»
   de toda violación y sin eso es imposible. **En obra** — paso 9. Hoy no se cumple: el registro
   anota escrituras, no lecturas.
4. **Corrección por nota aclaratoria, nunca por sobreescritura** (Brasil; Argentina; Uruguay
   Decreto 242/017 art. 13; Ecuador). **En obra** — tramo 7.
5. **Plazo de conservación y anonimización al vencer** (Costa Rica Ley art. 6.1, Panamá Decreto
   art. 7, Ecuador art. 31). **En obra** — paso 122.

**Transferencia internacional, y la pregunta previa que casi nadie hace.** Antes de preguntarse con
qué instrumento se transfiere, hay que preguntarse **si esto es una transferencia**. Y la respuesta
cambia de país en país, porque cada uno define la palabra a su manera. Lo que dice cada uno está en su documento, en la sección «Transferencia internacional».

---

## Los marcos de auditoría

Ninguno es ley, y todos los pide el mercado.

| Marco | Qué es | Qué dice sobre separar clientes | Estado |
|---|---|---|---|
| **BSI C5:2026** | Dictamen de auditor, no certificación. Condición legal en Alemania por §393 SGB V | `OPS-30.01B` exige políticas de separación atadas a un modelo documentado de capas, con medidas por capa, monitoreo y acción ante desvíos, y cubre **cliente-de-cliente y cliente-del-proveedor**. `OPS-31.02B`: datos «segura y estrictamente separados». `OPS-31.03B`: revisión ante cambios y **al menos anual**. `OPS-15.01B`: identificación del acceso **a nivel de cliente**. `COS-06.01B`: separación de red | **En obra** — pasos 9, 125 y 129 |
| **ISO/IEC 27017:2015** | Se audita junto con ISO/IEC 27001 | `CLD.9.5.1` — separación lógica de datos, aplicaciones, sistemas operativos, almacenamiento y red, **y separar la administración del proveedor de los recursos de los clientes** | **En obra** — plan de aislamiento |
| **CSA CCM v4** | Cuestionario de mercado | `IVS-06` — el acceso del proveedor y el de cada cliente segmentados, monitoreados y restringidos respecto de otros clientes | **En obra** |
| **SOC 2** | Atestación, no certificación | `CC6.1` es genérico. **No existe una regla de SOC 2 que diga «aísle a sus clientes»**: los controles los define la empresa. Sirve igual, porque es el sustituto de mercado del derecho de auditoría que HIPAA no da | No obtenido |
| **PCI DSS 4.0, Apéndice A1** | Aplica sólo si se procesan tarjetas | El único marco con separación entre clientes dura y con plazo: A1.1.1 a A1.1.3, y **A1.1.4 confirmación de la eficacia de la separación lógica al menos cada seis meses mediante pruebas de penetración**, exigible desde el 31 de marzo de 2025 | **No alcanza** hoy: el cobro lo hacen pasarelas de terceros |
| **ISO 27799** | Guía de seguridad en salud | **No se certifica** | — |
| **HITRUST** | Marco privado | No es requisito legal en ningún país | No obtenido |
| **TISAX** | Sector automotriz | **No alcanza** | — |

**La respuesta honesta a la pregunta que hace todo comprador.** Ninguna norma alcanzada exige que el
control de acceso viva fuera de la aplicación, ni base, esquema o instancia separados por cliente.
**La seguridad a nivel de fila sobre una sola base PostgreSQL es aceptable bajo todos estos marcos.
Lo que no es aceptable es no poder demostrarla**, y la demostración no es un documento de
arquitectura: es una prueba de penetración de tercero dirigida al acceso entre clientes, más una
prueba de aislamiento repetible que **pueda fallar**. Comprobar que una consulta devuelve vacío no
prueba nada, porque una política que niega todo devuelve exactamente lo mismo.

Y hay un hallazgo que deshace una historia de aislamiento por lo demás buena: **una credencial que
pueda leer a todos los clientes.** Hoy Careonys la tiene. Sacarla es el objeto entero de
la sección «Los cimientos» de `docs/PLAN_HASTA_PRODUCCION.md`, y es la condición previa de casi
todo lo de este documento.

---

## Lo que hoy cumple, sin obra pendiente

- Los secretos de las pasarelas de pago no están en claro en la base: viven en Supabase Vault.
- Once de los doce depósitos de archivos son privados y se sirven con enlace temporal.
- El consentimiento se registra con texto versionado, con quién consintió, por qué medio, desde
  cuándo y hasta cuándo.
- Existe la estructura de aviso legal por jurisdicción, con constancia de que se avisó.
- No se entrenan modelos con datos de los Clientes, y no se monetiza ningún dato de salud.
- El tráfico va cifrado.

---

## Lo que no se verificó

Se declara para que nadie lo tome por cumplido.

- **Los importes de sanción vigentes** no se consultaron, en ningún país. Ninguna cifra de multa se
  usa sin buscar la tabla del año.
- **Italia, Bélgica, Polonia, Dinamarca, Noruega y Finlandia** no se relevaron. El de Finlandia es
  el que más importa: la ley 784/2021 clasifica los sistemas en clase A o B con evaluación de
  conformidad por organismos aprobados.
- En Latinoamérica quedaron sin verificar los regímenes sancionatorios de casi todos los países,
  varios plazos de respuesta a derechos.
- **Este documento es relevamiento de fuentes públicas, no asesoramiento legal.** Antes de vender en
  un país, ese país tiene que tener su documento propio en `docs/legal/`, revisado por un
  profesional de esa jurisdicción.
