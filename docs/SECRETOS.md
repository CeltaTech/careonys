# Mapa de secretos — Careonys

**Acá no hay ningún valor, y no lo va a haber.** Este documento dice qué secreto existe, para qué
sirve, dónde vive y cuándo se rotó. El valor se mira en el lugar donde vive, por quien tenga el
acceso: escribirlo acá convertiría el repositorio en la caja fuerte que este documento viene a
evitar (`celtatech/CLAUDE.md`, sección «Seguridad, privacidad y auditoría»: «toda credencial vive en
variable de entorno»).

**Para qué sirve tenerlo escrito.** Contesta las tres preguntas que importan el día que algo se
filtra: qué hay que rotar, a quién se le rompe el servicio mientras se rota, y qué queda sin rotar
porque nadie se acordó de que existía.

**Qué NO es un secreto, aunque viaje por el mismo camino.** La mayoría de las variables de entorno
del backend son configuración: direcciones de servicios, topes, el nombre del modelo de IA. Están
listadas al final, aparte, justamente para que nadie las rote creyendo que lo son ni las trate con
el cuidado que hace falta para las otras.

---

## 1. Dónde puede vivir un secreto

Son cinco lugares, y ninguno se superpone con otro:

| Lugar | Qué guarda | Quién lo lee |
|---|---|---|
| **Railway** — variables del servicio del backend | Todo lo que el backend necesita para funcionar en producción | El backend, en ejecución |
| **Secretos del repositorio en GitHub** | Lo que necesitan los automatismos: publicar, desplegar, respaldar y comprobar los textos | Los archivos de `.github/workflows/` |
| **La caja fuerte de la base** (`vault` de Supabase) | Lo de **cada Prestadora**: su pasarela, su correo, su WhatsApp | El backend, con el trabajo sin persona de esa Prestadora, a través de funciones `SECURITY DEFINER` |
| **El panel de cada proveedor** | El valor original, que es de donde sale la copia que va a los otros lugares | Quien tenga la cuenta |
| **La máquina del Desarrollador** — `backend/.env` y la caja fuerte local | Lo mismo que Railway, pero apuntando al ambiente de desarrollo | El backend corriendo en local |

**La caja fuerte local no se abre** (`F:\proyectos\CLAUDE.md`): ni para verificar, ni para
completar este documento. Lo que este mapa sabe de ella es qué nombres espera el código, que se
lee en el código.

---

## 2. Los secretos del backend (Railway, y `backend/.env` en desarrollo)

Cada uno con el archivo que lo usa, para no tener que buscarlo.

| Secreto | Para qué sirve | Si falta | Última rotación |
|---|---|---|---|
| `CONTRASENAS_DE_LAS_CUENTAS_AUTOMATICAS` | Las contraseñas de las cuentas con las que entra a la base lo que trabaja sin la sesión de una persona —una tarea programada, la dirección que llama otro software, el respaldo nocturno—, una cuenta por Prestadora y por trabajo. `backend/src/db/connection.js`. El mismo texto arma además, al ingresar, la dirección que se devuelve para un usuario que no existe, para que no se distinga de uno que sí (`backend/src/routes/ingreso.js`) | Falla todo trabajo sin persona en el momento de entrar a la base, y el respaldo nocturno | Sin registro |
| `SECRETO_DE_LOS_CODIGOS` | Calcula el identificador de verificación de cada código de un solo uso, para que la base no guarde el código. Tiene que tener 32 caracteres o más. `backend/src/utils/codigoDeUnSoloUso.js` | El backend no arranca (`backend/src/server.js`) | Sin registro |
| `ANTHROPIC_API_KEY` | Todo lo que hace la IA: leer un aviso de ausencia, redactar plantillas de WhatsApp, interpretar una importación, resumir | Cada función de IA devuelve «sin respuesta» y el resto del producto sigue andando | Sin registro |
| `RESEND_API_KEY` | El acceso al despachante por el que sale todo el correo del producto. Va junto con `REMITENTE_AVISOS`, que no es secreta y dice desde qué dirección sale. `backend/src/utils/email.js` | No se manda ningún correo, en silencio | Sin registro |
| `CLOUDFLARE_EMAIL_ROUTING_TOKEN` | Abrir y cortar el reenvío de las respuestas de cada Prestadora. Va junto con `CLOUDFLARE_ACCOUNT_ID` y `CLOUDFLARE_ZONE_ID`, que no son secretos y dicen sobre qué cuenta y qué dominio se trabaja. **Es un token propio, con permiso de Email Routing: no es el que publica las pantallas** (§3), que está acotado a Pages y DNS. `backend/src/utils/reenvioDeRespuestas.js` | No se abre ningún reenvío, el alta sigue andando y las respuestas se pierden. Se avisa en el Panel | Sin registro |
| `SMTP_USER` y `SMTP_PASSWORD` | La casilla de correo de la máquina de desarrollo. Es el camino que se usa mientras no haya acceso al despachante; en Railway no entrega nada, porque los puertos de correo están bloqueados. `backend/src/utils/email.js` | En desarrollo no se manda ningún correo, en silencio | Sin registro |
| `VAPID_PRIVATE_KEY` | Firma los mensajes al celular. Va de a pares con `VAPID_PUBLIC_KEY`, que no es secreta y se compila adentro de las pantallas. `backend/src/utils/push.js` | No llega ningún mensaje al celular | Sin registro |
| `R2_ACCESS_KEY_ID` y `R2_SECRET_ACCESS_KEY` | Copiar cada certificado médico que se sube al depósito de Cloudflare R2, como espejo (`backend/src/routes/panelAusencias.js`), y el respaldo nocturno de los datos y de los archivos (`backend/src/utils/respaldoDeLosDatos.js`, `backend/src/utils/copiaDeLosArchivos.js`). Van junto con `R2_ENDPOINT` y `R2_BUCKET` | El respaldo falla, queda en el registro del servidor, y lo demás sigue andando | Sin registro |
| `B2_KEY_ID` y `B2_APPLICATION_KEY` | El mismo respaldo nocturno, al espejo de Backblaze. Van junto con `B2_ENDPOINT` y `B2_BUCKET`. Railway los recibe de los secretos del repositorio en cada publicación del backend (`deploy-backend.yml`) | El respaldo falla esa noche y queda en el registro del servidor | Sin registro |
| `COBRANZA_EFECTIVO_SECRETO_FIRMA_WEBHOOK`, `DEBIN_SECRETO_FIRMA_WEBHOOK`, `MODO_SECRETO_FIRMA_WEBHOOK` | Comprobar que el cobro informado viene de la pasarela y no de cualquiera que conozca la dirección. **Son el respaldo del ambiente:** el secreto que manda es el de esa Prestadora, guardado en la caja fuerte de la base (§4) | El cobro informado se rechaza, que es lo correcto: mejor no cobrar que dar por cobrado lo que no se cobró | Sin registro |

---

## 3. Los secretos de los automatismos (secretos del repositorio en GitHub)

Estos no los usa el producto: los usan los automatismos de `.github/workflows/`. **Ninguno está
en la máquina del Desarrollador**, y eso es a propósito — si un automatismo es la única forma de
publicar, el token de publicar no tiene por qué andar dando vueltas en una computadora.

| Secreto | Para qué sirve | Quién lo usa |
|---|---|---|
| `RAILWAY_TOKEN` | Subir el backend a Railway en cada push que toca `backend/` | `deploy-backend.yml` |
| `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID` | Publicar el Panel, las dos aplicaciones y la página raíz. El token está acotado a Pages y DNS | `publicar-pantallas.yml` |
| `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Subir la copia del código al depósito principal | `backup-diario.yml` |
| `B2_ENDPOINT`, `B2_BUCKET`, `B2_KEY_ID`, `B2_APPLICATION_KEY` | Subir la misma copia del código al espejo de Backblaze, y pasarle a Railway los mismos valores para el respaldo nocturno | `backup-diario.yml`, `deploy-backend.yml` |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`, `VITE_SITE_URL`, `VITE_VAPID_PUBLIC_KEY` | Los valores que se compilan adentro de cada pantalla. **No son secretos** —quedan a la vista de cualquiera que abra la aplicación— y están acá únicamente porque los archivos `.env.production` no se versionan | `publicar-pantallas.yml` |

**La clave anónima de Supabase no es una contraseña.** Es pública por diseño: lo que decide qué
puede hacer quien la usa son las políticas de protección por fila, no el hecho de conocerla.
Rotarla no protege nada y rompe todas las pantallas publicadas.

---

## 4. Los secretos de cada Prestadora (la caja fuerte de la base)

Estos no son de CeltaTech ni del producto: son de cada Prestadora, los carga ella y **nadie los
vuelve a ver, ni ella misma**. No viven en ninguna tabla: lo que la tabla guarda es el número de
referencia de una caja de `vault`, y adentro de esa caja está el texto cifrado.

| Caja | Qué guarda | Funciones que la abren |
|---|---|---|
| `pasarela_<proveedor>_<prestadora>` | El acceso con el que esa Prestadora cobra por esa pasarela | `guardar_credencial_pasarela_pago` / `leer_credencial_pasarela_pago` |
| `pasarela_firma_<proveedor>_<prestadora>` | El secreto con el que esa pasarela firma lo que informa de sus cobros | `guardar_secreto_firma_pasarela_pago` / `leer_secreto_firma_pasarela_pago` |
| `whatsapp_token_<prestadora>` | El token con el que manda mensajes por WhatsApp | `guardar_token_whatsapp` / `leer_token_whatsapp` |
| `whatsapp_app_secret_<prestadora>` | Con qué se comprueba la firma de lo que llega de Meta | `guardar_app_secret_whatsapp` / `leer_app_secret_whatsapp` |
| `whatsapp_verify_token_<prestadora>` | Con qué se contesta el saludo de enganche de Meta | `guardar_verify_token_whatsapp` / `leer_verify_token_whatsapp` |

**Las diez funciones son `SECURITY DEFINER` y sólo las alcanza el trabajo sin persona**, o sea el
backend, de a una Prestadora por vez.
Ni el Superadmin ni el Admin de la propia Prestadora llegan al texto. Rotar uno de estos secretos
no es trabajo de CeltaTech: la Prestadora lo vuelve a cargar desde Configuración, y el cambio
reemplaza el contenido de la caja en vez de abrir otra.

---

## 5. Qué se rota cuando se filtra qué

Sirve el día que pasa, que es el día en que nadie tiene tiempo de leer código.

- **Se filtró un token de publicación** (Railway o Cloudflare) → se rota en su panel y se reemplaza
  el secreto del repositorio. No se cae nada; lo que no anda hasta reemplazarlo es publicar.
- **Se filtraron las llaves del respaldo** (R2 o B2) → se rotan en su panel y se reemplazan los
  secretos del repositorio. Lo que se pudo bajar de los datos y los archivos está cifrado con la
  clave de cada Prestadora y no se lee sin ella; la copia del código, no.
- **Se filtró la clave de la API de IA** → se rota en el panel de Anthropic. Cada función de IA
  queda sin respuesta hasta reemplazarla; ninguna otra cosa se rompe.
- **Se filtró un secreto de una Prestadora** → lo vuelve a cargar ella desde Configuración. Si la
  que avisó usa la misma pasarela que otras, se revisa en todas: un defecto que aparece en una
  Prestadora es del producto, no de ella (`celtatech/CLAUDE.md`, sección «Las reglas de desarrollo»).

---

## 6. Por qué la columna «última rotación» está vacía

**Porque no se rotó ninguno, no porque falte averiguarlo.** Todos los secretos de §2 y §3 son los
originales, de cuando se dio de alta cada servicio. La rotación de a uno es el paso 97 de
`docs/PLAN_HASTA_PRODUCCION.md`.

**Al rotar uno, la fecha se anota acá**, en su renglón. Un mapa que dice dónde está cada secreto y
no dice cuándo se cambió sirve la mitad.

---

## 7. Lo que no es secreto

Variables de entorno del backend que son configuración, no secretos. **No se rotan.** Se listan
para que nadie las confunda con las de arriba, ni al revés.

- **Direcciones de servicios ajenos:** `SUPABASE_URL`, `GEOREF_API_BASE`, `MERCADOPAGO_API_BASE`,
  `MERCADOPAGO_BACK_URL`, `STRIPE_API_BASE`, `MODO_API_BASE`, `DEBIN_API_BASE`,
  `DEBIN_PSP_API_BASE`, `COBRANZA_EFECTIVO_API_BASE`, `CLOUDFLARE_API_BASE`, `R2_ENDPOINT`,
  `R2_BUCKET`, `SMTP_HOST`, `SMTP_PORT`.
- **Identificadores públicos:** `SUPABASE_ANON_KEY` (la clave anónima, ver §3), `CLOUDFLARE_ACCOUNT_ID`,
  `CLOUDFLARE_ZONE_ID`, `REMITENTE_AVISOS`, `VAPID_PUBLIC_KEY`, `CORREO_DE_LAS_ALARMAS`.
- **Las claves públicas de los respaldos:** `CLAVES_PUBLICAS_DE_LOS_RESPALDOS`, con las que se
  cifra el respaldo de cada Prestadora. Sirven para cifrar y no para abrir: la privada no la tiene
  el sistema.
- **Direcciones propias:** `PANEL_URL`, `PWA_CLIENTES_URL`, `PWA_ASISTENTES_URL`, `PORT`.
- **Decisiones de funcionamiento:** `MODELO_IA` (el nombre del modelo, que vive en un solo lugar y
  se puede pisar por entorno), `TOPE_PEDIDOS_POR_MINUTO`, `TOPE_PEDIDOS_DE_CLAVE_POR_HORA`,
  `TOPE_CODIGOS_AL_TELEFONO_POR_HORA`, `MINUTOS_DEL_CODIGO_AL_TELEFONO`,
  `MINUTOS_DEL_CAMBIO_DE_CLAVE_HABILITADO`, `MINUTOS_ENTRE_ENTRADAS_REGISTRADAS`,
  `DIAS_DE_VALIDEZ_DEL_ENLACE_DE_ACTIVACION`, `DIAS_HASTA_EL_RECORDATORIO_DE_ACTIVACION`,
  `VAPID_SUBJECT`, `NODE_ENV`.
- **Retención de respaldos:** `RESPALDOS_DIAS_DIARIOS` y `RESPALDOS_MESES_MENSUALES`, que lee
  `backend/src/utils/retencionDeRespaldos.js` cuando el respaldo de los datos borra los viejos.
- **Sólo para correr cosas en la máquina propia:** `CONTENEDOR_BASE`, `URL_BACKEND`.
- **Sólo para las pruebas:** `ANTHROPIC_BASE_URL`, para no salir a la API de verdad.
