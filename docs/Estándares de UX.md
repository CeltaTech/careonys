# Estándares de UX

### Estándares de UX/UI y Especificación: Careonys / CeltaTech

Guía unificada de diseño de interfaz, arquitectura de datos y terminología B2B

Basándonos en las guías de estilo de Microsoft (Fluent Design) y Google (Material Design) como se denomina el listado donde están los clientes? y como se denominan las personas que pertenecen a un cliente determinado, por ejemplo en una organización como la que queremos gestionar?

Basándonos en las guías de estilo de **Microsoft (Fluent** **Design** **/ Microsoft Content Style** **Guide)** y **Google (Material** **Design)** para aplicaciones empresariales (B2B/SaaS), los términos estándar para estos dos elementos se estructuran de la siguiente manera:

**1. ¿Cómo se denomina el listado donde están los clientes?**

En los patrones de diseño de Microsoft y Material Design, la vista principal que agrupa entidades se nombra de forma **directa, plural y sustantiva**, evitando palabras superfluas como "Gestión de..." o "Módulo de...".
- **Nombre de la vista / Etiqueta de navegación:**
- **Clientes** (Clients): Es la opción primaria y recomendada por su claridad y brevedad.
- **Directorio de clientes** (Client directory): Recomendado en Microsoft cuando se enfatiza la búsqueda y consulta de fichas comerciales.
- **Cuentas** (Accounts): Estándar alternativo en sistemas B2B/CRM cuando el "cliente" representa a una empresa u organización.
- **Nombre técnico del componente visual (UI** **Component):**
- **Tabla de datos** (Data Table) en Material Design.
- **Lista de entidades** (DetailsList / Data Grid) en Microsoft Fluent Design.

**2. ¿Cómo se denominan las personas que pertenecen a un cliente determinado?**

Cuando un cliente es una entidad global (por ejemplo, una familia o una organización) y dentro conviven diferentes personas con distintos roles, las guías de UX Writing de Microsoft y Material Design recomiendan los siguientes términos según la relación:
- **Miembros** (Members):
- **Uso estándar:** Es el término principal en Microsoft y Material Design para las personas que forman parte o están integradas dentro de un grupo, cuenta u organización cliente.
- **Contactos** o **Contactos asociados** (Contacts / Associated contacts):
- **Uso estándar:** Se utiliza cuando el cliente es una persona jurídica/empresa y se listar a los interlocutores (familiares, representantes, apoderados).
- **Personas** / **Integrantes** (People / Account members):
- **Uso alternativo:** Término neutro para listados o pestañas secundarias dentro de la ficha del cliente (ej. Pestaña "Personas").

**Vinculación con** **el** **Glosario de** **Careonys**

Para mantener la coherencia con la arquitectura y **no contradecir los estándares**:
- **El listado principal en la UI:** Puede llamarse **Clientes** o **Directorio de clientes** (estándar de Microsoft/Material Design) y al hacer clic te lleva a la **Ficha del cliente**.
- **Las personas dentro del cliente:** En la interfaz genérica puedes etiquetar la sección o pestaña interna como **Miembros** o **Personas asociadas**, mientras que en la lógica interna de Careonys cada una de esas personas mantiene su rol específico (**Contratante**, **Paciente**, **Pagador**).

**3. ¿Cómo se denominan las personas que cumplen el rol de asistentes (cuidador, enfermero, kinesiólogo, etc.)?**

**A. Según los estándares de interfaz (Microsoft / Material** **Design)**

En los patrones de UI/UX genéricos para plataformas B2B/SaaS, las personas que ejecutan tareas o brindan servicios en el campo se categorizan bajo los siguientes conceptos generales:
- **Personal / Equipo de trabajo (Staff /** **Team):** Término general de Microsoft para la gestión de recursos humanos en la interfaz.
- **Proveedores de servicio / Operadores (Service** **Providers** **/ Field** **Workers):** Término genérico en guías de diseño de gestión de servicios.

**B. Según** **el** **Glosario de Dominio (Careonys)**

Para tu sistema de gestión de cuidados, la regla de dominio es estricta:
- **Término general obligatorio:** **Asistente**.
- Es el único término genérico que deben usar el código, la base de datos y la interfaz.
- **Tipo de Asistente:** Es la clasificación de **qué es** esa persona dentro del sistema (ej. cuidador/a, enfermero/a, kinesiólogo/a, médico/a).
- **Términos prohibidos por el glosario:** Empleado/a, trabajador/a, o usar el nombre de un tipo (como "cuidador") para referirse al grupo general.

**Resumen para el desarrollo e interfaz**

| **Concepto de Negocio** | **Estándar de Interfaz (Microsoft / Material)** | **Término Obligatorio en** **Careonys** |
|---|---|---|
| **Listado global de clientes** | List View / Data Table / Directory | **Directorio** **de Clientes** |
| **Ficha individual del grupo cliente** | Account Overview / Details View | **Ficha del cliente** |
| **Denominación del grupo de trabajadores** | Staff / Field Workers | **Asistentes** |
| **Tipo de Asistente (cuidador, enfermero)** | Role / Category | **Tipo de Asistente** |

A continuación tienes el **mapa completo y detallado de todas las personas, roles y entidades** que conforman el ecosistema de **Careonys** **/** **CeltaTech**, estructurado según sus niveles de responsabilidad, interacción con el sistema y reglas del glosario:

**1. Entidades Corporativas e Infraestructura (Nivel Empresa y Plataforma)**

| **Entidad / Actor** | **Definición en el Ecosistema** | **Naturaleza / Ámbito** | **Reglas de Uso y Nomenclatura** |
|---|---|---|---|
| **CeltaTech** | Empresa desarrolladora y proveedora del software. | Entidad Corporativa | Prohibido usar nombres anteriores o frases como "software de CeltaTech" al referirse al producto. |
| **Careonys** | Nombre oficial del producto principal de gestión de cuidados. | Producto SaaS | Es el único nombre para el producto. No lleva variantes. |
| **Careonys** **Match** (o **Match**) | Producto/módulo de intermediación entre quienes necesitan cuidado y Asistentes. | Producto / Modalidad | **No lleva artículo**: se escribe "en Match", nunca "en el Match". |
| **Prestadora** (o **Empresa prestadora**) | Cliente B2B directo de CeltaTech que contrata Careonys para prestar servicios de cuidado. | Empresa Cliente (B2B) | Sinónimo aceptado en contexto de contrato SaaS: Cliente. **Prohibido:** "empresa" a secas, "empresa cliente" u "organización comercial". |
| **Empresa subcontratada /** **tercerizada** | Empresa externa a la que la Prestadora encarga cubrir una prestación con su propio personal. | Proveedor B2B | Es un recurso operativo de la prestación directa, no una modalidad ni una Prestadora. **Prohibido:** "proveedor", "contratista" o "la cooperativa". |
| **Organización** | Entidad técnica en la arquitectura multitenant. | Código / Arquitectura | Uso estrictamente técnico de base de datos/infraestructura. No usar para hablar de la Prestadora en texto de negocio. |

**2. Estructura del "Cliente" (Roles de la Contratación)**

En Careonys, el **Cliente** no es una sola persona, sino la **cuenta global** que reúne a todas las partes involucradas en una contratación de cuidados:

┌────────────────────────────────────────────────────────┐

│                    CLIENTE (Cuenta)                    │

│   CeltaTech NO tiene vínculo directo con este grupo    │

└───────────────────────────┬────────────────────────────┘

┌────────────────────────────┼────────────────────────────┐

▼                            ▼                            ▼

CONTRATANTE                   PAGADOR                      PACIENTE

(Firma/Responsable)        (Obligación de pago)        (Recibe la atención)

• Familiar                  • Mismo Contratante          • Persona asistida

• Empresa / Prepaga         • Obra Social / Prepaga      • Titular de la HCE

| **Rol / Persona** | **Definición y Responsabilidad** | **Tipo de Legajo** | **Reglas de Nomenclatura** |
|---|---|---|---|
| **Cliente** | El conjunto de todas las partes de una contratación (Contratante + Pagador + Paciente + Autorizados). Es propiedad de la Prestadora. | Grupo / Cuenta Comercial | **Prohibido:** "usuario", "Cliente Contratante" o usarse para nombrar a una sola persona. |
| **Contratante** | Persona física o jurídica que **firma la contratación y responde legalmente/comercialmente** ante la Prestadora. | Registro individual. Forma parte y es integrante del cliente y por lo tanto ha de estar incluido en la Ficha del Cliente. | Se escribe igual en pantalla y código: contratante. **Prohibido:** "responsable legal" o "Cliente" a secas. |
| **Pagador** | Persona física o jurídica que **asume la obligación de pagar el servicio y firma su consentimiento**. | Registro individual. Forma parte y es integrante del cliente y por lo tanto ha de estar incluido en la Ficha del Cliente. | Identificador en código: pagador. Puede ser el mismo Contratante o un tercero (Obra Social, prepaga, familiar). **Prohibido:** "financiador". |
| **Paciente** | Persona física que **recibe el cuidado o la atención médica**. Es el titular de la Historia Clínica Electrónica (HCE). | Registro individual. Forma parte y es integrante del cliente y por lo tanto ha de estar incluido en la Ficha del Cliente. | **Prohibido:** "adulto mayor" (salvo contexto clínico específico). |
| **Personas autorizadas** | Familiares o allegados que tienen permiso de la Ficha del Cliente para recibir novedades o acompañar al Paciente. | Registro individual. Forma parte y es integrante del cliente y por lo tanto ha de estar incluido en la Ficha del Cliente. | Forman parte de la Ficha del Cliente junto con el Contratante, Pagador y Paciente. |
| **Prospecto** | Persona externa que muestra interés inicial en los servicios (1ª etapa comercial). | Registro Comercial | **Prohibido:** "solicitud", "lead" o "prospect". |
| **Oportunidad** | Prospecto que tiene un Presupuesto de servicio en negociación sin firmar (2ª etapa comercial). | Registro Comercial | Pasa a ser Cliente al firmar; si fracasa vuelve a ser Prospecto. |

**3. Personal Operativo, de Cuidado y Supervisión**

| **Rol / Persona** | **Definición y Función** | **Tipo de Clasificación** | **Reglas de Nomenclatura** |
|---|---|---|---|
| **Asistente** | Término **genérico universal** para todo el personal que brinda atención. Es el único usado en código y tablas (asistente). | Personal de Cuidados | **Prohibido:** "empleado/a", "trabajador/a" o usar el nombre de un tipo ("cuidador") como genérico. |
| **Tipo de Asistente** | Clasificación funcional de **qué es** esa persona (ej. cuidador/a, enfermero/a, kinesiólogo/a, médico/a). | Catálogo de 2 niveles: Tipo y Especialidad (Ver Nota) | Define sus tres listas de Tareas y qué documentos se le piden, entre ellos la Matrícula. **Prohibido:** "puesto" o "rol". |
| **Coordinador** (o **Supervisor**) | Persona a cargo de armar los equipos, supervisar guardias y coordinar las atenciones. | Personal de Gestión | En el código el identificador del rol se mantiene como coordinador. **Prohibido:** "jefe" o "encargado". |
| **Franquera** **/** **franquero** | Asistente asignado al equipo de un Paciente para cubrir días francos y emergencias. | Rol de Cobertura | Slang del rubro permitido. En código/base se guarda por su función: cubre francos. **Prohibido:** "suplente", "volante" o "comodín". |
| **Equipo de un Paciente** | Grupo integrado por las Asistentes habituales asignadas a un Paciente más su Coordinador/a. | Estructura Operativa | Se arma con quienes tienen turnos habituales. **Prohibido:** "plantel", "grupo" o "los asignados". |

**4. Entidades del Sistema de Registro e Identificación**

| **Entidad / Registro** | **Función en el Sistema** | **Alcance / Duración** | **Reglas de Nomenclatura** |
|---|---|---|---|
| **Padrón** | Registro centralizado y exclusivo de todo el personal operativo de cuidado (cuidadores, enfermeros, kinesiólogos, etc.) vinculado a una Prestadora. | Por Prestadora | **Prohibido:** "fichero", "base de asistentes", "listado" o "la lista de Careonys". |
| **Directorio de Clientes** | Registro centralizado de todas las cuentas comerciales gestionadas por la Prestadora. | Por Prestadora | Prohibido: fichero, base de clientes, lista de clientes. |
| **Contactos** | Registro único de todas las personas físicas y jurídicas de los Clientes de la Prestadora: quien contrata, quien recibe el cuidado, quien paga, la obra social. Cada una se guarda una sola vez y los roles la citan. | Por Prestadora | Prohibido: Directorio de Personas. |
| **Legajo del Asistente** | Expediente de un Asistente en el Padrón. Guarda su historial laboral, matrículas, tipo de Asistente y especialidades, capacitaciones, documentación, evaluaciones, etc. | Permanente e Histórico | Prohibido: ficha, perfil, alta o file. |
| **Ficha del Cliente** | Expediente que agrupa a los integrantes de una cuenta (Contratante, Pagador, Paciente, Autorizados). Así como observaciones y otras informaciones que correspondan al cliente | Permanente e Histórico | **Prohibido:** legajo de cliente, perfil de cliente. |
| **Número de Legajo** | Identificador numérico e inmutable asignado a un Asistente en su Legajo laboral. | Único por Prestadora | Arranca en 1 por Prestadora. En inglés: record number. **Prohibido:** "código", "número de ficha" o confundir con Número de cliente. |
| **Número de Cliente** | Identificador único de la Ficha del Cliente. | Único por Cuenta | Antepone a los nombres visibles para distinguir cuando dos clientes coinciden y facilitar busquedas. |
| **Desarrollador** | Persona que dirige el desarrollo del software y aprueba decisiones elevadas. | Técnico / Gestión | No es un rol de usuario dentro del sistema. **Prohibido:** usar nombres propios como stand-in genérico. |

**Notas:** **Estructura del Catálogo de 2 Niveles para el Padrón de Asistentes**

El **Catálogo de 2 niveles** es una estructura exclusiva para la clasificación del personal en el **Padrón de Asistentes** (no aplica al Directorio ni a las Fichas de Clientes). Significa que en la base de datos y en la interfaz de la aplicación el perfil profesional de una persona no se guarda como un texto libre ni como una lista simple, sino con una **jerarquía de dos capas relacionadas**: Tipo de Asistente y Especialidad.

**Cómo** **se estructura el Catálogo de 2 niveles**
- **Nivel 1: Tipo de Asistente**
- Es qué es el Asistente.
- Ejemplos: **Cuidador/a**, **Acompañante terapéutico/a**, **Kinesiólogo/a**, **Terapista Ocupacional**, **Fonoaudiólogo/a**. Los tipos de fábrica no se renombran ni se borran; cada Prestadora agrega los suyos.
- **Nivel 2: Especialidad**
- Ejemplos: **en Cuidador/a, Cuidado paliativo o Movilidad reducida; en Kinesiólogo/a, Estimulación cognitiva**. Cada Prestadora las agrega, las renombra y las borra, también en los tipos de fábrica.

**¿Por qué esta estructura es fundamental en el software?**
- **Valida la Matrícula Legal:** Cada Tipo de Asistente define qué documentos se le piden, entre ellos la Matrícula. Una Especialidad puede pedir su propia matrícula. **Si falta o vence un documento que la Prestadora marcó como impedimento para trabajar, no se le puede asignar trabajo** a esa persona.
- **Determina las Tareas automáticas:** Cada Tipo de Asistente trae sus tres listas de **Tareas**: las que le corresponden, las que no le tocan y las prohibidas. Sólo la prohibida impide asignarla.
- **Filtros en el Padrón:** Permite a la Prestadora filtrar el Padrón por Tipo de Asistente (Nivel 1).
