# Marca del producto y de cada Prestadora

> Describe la marca del producto, la de cada Prestadora y dónde vive cada una. El producto no
> tiene isotipo ni logotipo diseñados. El dominio es `careonys.com`, declarado en
> `backend/src/config/identidadProducto.js`.

## 0. Antes que nada: acá hay tres marcas, no una

| Marca | Qué es | Quién la ve |
|---|---|---|
| **CeltaTech** | La empresa dueña del software | Nadie, dentro del producto |
| **Careonys** | El producto | Quien trabaja **en** la Prestadora (Admin_prestadora, Coordinador) y sabe qué software usa |
| **La de cada Prestadora** | El nombre propio de la empresa que presta el cuidado, por ejemplo «Cuidar del Sur» | El **Cliente** y el **Asistente** |

Todo este documento habla de la segunda. **No confundirla con la tercera.**

Un Cliente contrató a la Prestadora, no a CeltaTech, y probablemente no sepa que Careonys
existe. Un Asistente trabaja para la Prestadora. Para los dos, la marca que tiene sentido es
la de la Prestadora — `prestadoras.nombre_fantasia`, que existe en la base desde el diseño
inicial y que el diseño multi-tenant definió como la marca que ven el Cliente y el
Paciente.

**La regla:** en toda pantalla, email o notificación dirigida a un Cliente o a un Asistente,
la marca **principal** la pone la Prestadora, nunca `identidadProducto.js`.

**El modelo es co-branding**, decidido por el Desarrollador después de mirar qué hace la
industria. No es marca blanca total: la marca de la Prestadora va primera y
grande, y el producto queda en una línea discreta al pie, *"con la tecnología de
{{producto}}"*. Esa línea es el **único** lugar donde la marca del producto puede aparecer
ante un Cliente o un Asistente, y **va siempre**: es el crédito de quién hizo el software, no
una función que se venda. El producto no pregunta qué contrató nadie.

**Esa dirección es un recurso del sistema, no de la Prestadora.** Existe para que el sistema
mande, y para nada más. La Prestadora nunca entra a esa casilla, nunca la usa y no necesita saber
que existe: no se le muestra en ninguna pantalla y no viaja en ninguna respuesta del backend hacia
el Panel. Lo único suyo es **adónde quiere que le lleguen las respuestas**, y eso sí lo configura.

**Cada Prestadora manda desde su propia dirección de correo, bajo el dominio del producto.** Al
dar de alta una Prestadora se le crea `[prestadora]@careonys.com`, y de ahí salen todos sus
mensajes. Esa dirección sólo manda: **las respuestas se reenvían a la casilla que la Prestadora
declare**, que es la suya y vive donde ella quiera.

El nombre de esa dirección es el código de la Prestadora, que elige CeltaTech al darla de alta:
el código `cuidardelsur` da `cuidardelsur@careonys.com`.

**Se fija en el alta y no cambia nunca**, porque ya quedó escrita en todos los correos que se
mandaron. Es un nombre guardado, no una marca.

Va bajo el dominio del producto y no bajo el de cada Prestadora porque la autorización para
mandar —SPF y DKIM— se carga una sola vez, en `careonys.com`, y de ahí cuelgan todas las
direcciones. Pedirle eso a cada Prestadora sería pedirle un trabajo que una Prestadora chica no
va a hacer, y sus mensajes terminarían en correo no deseado.

Dos cosas que la decisión **descartó** explícitamente, para que nadie las reabra sin motivo:

- **Nada de marca blanca total.** Si el producto es invisible, nadie sabe que existe.
- **El nombre y el ícono de la PWA instalada se quedan con la marca del producto.** Hay un
  solo build para todas las Prestadoras. Es el punto donde el límite técnico y el estándar de
  la industria coinciden.

**La regla se cumple.** Las dos aplicaciones muestran la marca de la Prestadora arriba y la del
producto al pie. El nombre de fantasía y el logo los carga y los cambia el Administrador de la
Prestadora en Configuración › La Prestadora (`panel/src/pages/configuracion/LaPrestadora.jsx`). La
razón social, el número fiscal y el país no, porque son datos del contrato y los informa CeltaTech
en el alta.

**El nombre de fantasía se guarda una sola vez**, en `prestadoras.nombre_fantasia`, y de ahí lo
leen el Panel, las dos aplicaciones, los correos y los avisos. **El logo** es una imagen PNG, JPG o
WEBP de hasta 2 MB, y es el que se ve en internet; SVG no entra, porque puede llevar programas
adentro y se sirve con dirección pública. Los dos controles los hace el backend
(`backend/src/routes/panelConfiguracion.js:217-218`), porque el depósito no tiene tope de tamaño
ni de tipo.

**El logo para impresión es otro archivo, opcional.** Es el que llevan los documentos que se
imprimen —presupuestos, facturas, correspondencia—: PNG o JPG de hasta 2 MB, en el depósito
privado `logos-para-impresion`, ruta `<id de la Prestadora>/logo.<extensión>`, guardado en
`prestadoras.logo_impresion_ruta` y servido con enlace temporal. SVG tampoco entra: es texto que
puede llevar programas adentro, y revisarlo no da certeza.

**Qué logo lleva un documento** lo decide `logoParaDocumentos`, en
`backend/src/utils/logoParaImpresion.js:47`, y lo entrega `backend/src/routes/panelMembrete.js`: el de
impresión si está cargado; si no, el de internet cuando es PNG o JPG; si es WEBP, el documento sale
sin logo, con el nombre escrito.

**El membrete se dibuja en un solo lugar**, `panel/src/lib/membrete.js`: `prepararMembrete()` baja
el logo que contesta `/api/panel/membrete/logo` y `dibujarMembrete()` pone
el logo, el nombre de la Prestadora y el título del documento. Un documento nuevo lo suma con esas
dos llamadas. Lo usa la constancia de ausencia (`panel/src/lib/constanciaDeAusencia.js`).

**Dónde viven los archivos de marca de la Prestadora.** En el depósito `marca-prestadoras`, y
cada Prestadora tiene su carpeta, que se llama como su identificador:

    marca-prestadoras/<id de la Prestadora>/logo.png

No es un nombre bonito: es de lo que se agarran las reglas del depósito para saber de quién es
cada archivo. Leer lo puede cualquiera —un logo está en la puerta del local—, pero escribir
solo dentro de la carpeta propia.

**El logo es opcional.** Sin logo la pantalla no se rompe: muestra el nombre de la Prestadora
escrito.

**La marca de la Prestadora aparece después de entrar.** Asistentes y Clientes entran a las
aplicaciones con un nombre de usuario que es único en todo el sistema, así que la pantalla de
ingreso no pregunta de qué Prestadora es la cuenta ni muestra ninguna marca: la trae
`context/PerfilContext.jsx` al abrirse la sesión. **El Panel no mira la dirección de la página**:
la coordinación entra con su nombre de usuario, `parte_código`, y el código dice de qué
Prestadora es.

**Ese código no lo elige Careonys: lo elige CeltaTech** y llega con el alta de la Prestadora.
Careonys lo guarda y no lo cambia nunca, porque forma
parte del nombre de usuario de toda su coordinación, y de él sale también la casilla desde la que
manda (`backend/src/utils/casillaDeEnvio.js`). Que ninguno se repita y que ninguno cambie lo hace
cumplir la base, no la pantalla.

## 1. Los dos nombres, y por qué importa la diferencia

| | Qué es | ¿Cambia si se renombra el producto? |
|---|---|---|
| **Isotipo** | El símbolo solo, sin texto | Sí |
| **Logotipo** | El símbolo junto al nombre escrito | Sí |

El isotipo es el que va en los lugares chicos y cuadrados: el ícono de la app en el teléfono,
la pestaña del navegador, la notificación push. El logotipo va donde hay ancho: el
encabezado del Panel, la firma de un email.

## 2. Nombre, colores y manifiesto

- **El nombre en texto** no necesita ningún archivo: sale de `identidadProducto.js` y se
  reparte solo por los marcadores `{{producto}}` / `{{productoCorto}}`.
- **El nombre de la Prestadora adentro de una frase** tiene su propio marcador,
  `{{prestadora}}`, que funciona igual y vive en `src/i18n/marcaEnElTexto.js` (original en el
  Panel, copia idéntica en las dos aplicaciones). Lo alimentan `PerfilContext.jsx` en las
  aplicaciones y `EmpresaContext.jsx` en el Panel; mientras no hay Prestadora anotada el marcador
  cae al nombre del producto. La marca **dibujada** no pasa por acá y sigue saliendo
  de `useMarca()`: un marcador reemplaza texto, y una imagen no es texto.
- **Los colores** (`colorPrimario`, `colorFondo`) ya salen de ahí, y de ahí los toma el
  manifiesto de las dos PWA.
- **El nombre del manifiesto y el `<title>`** de las PWA ya se arman desde la identidad.

## 3. Íconos y favicon

`identidadProducto.js` apunta `isotipo` a `/favicon.svg` (el archivo provisorio que ya existe
en las tres apps) y deja `logotipo` en `null`. **Ningún archivo lee esos dos campos.** Las rutas
de los íconos están escritas a mano: el manifiesto de las dos PWA (`vite.config.js`) declara
`icon-192.png`, `icon-512.png`, `icon-maskable-192.png` e `icon-maskable-512.png`, y el
`index.html` de cada app apunta a `favicon.svg` y, en las dos PWA, a `icon-192.png` como
`apple-touch-icon`. Son los archivos provisorios que viven en `public/`.
