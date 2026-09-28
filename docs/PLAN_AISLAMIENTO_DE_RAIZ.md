# El aislamiento lo hace cumplir la base

Plan para que ninguna consulta de Careonys pueda alcanzar dos Prestadoras, y para que eso no
dependa de que nadie se equivoque al escribir una línea.

---

## 1. Qué hay hoy

Medido en la base en vivo y en el código, no en documentos.

**Una sola llave abre todo.** El backend entra a la base con `SUPABASE_SERVICE_ROLE_KEY`, que
alcanza las 182 tablas de todas las Prestadoras y se saltea la protección por fila. Se crea en un
solo lugar —`backend/src/db/connection.js`— y de ahí la importan 135 archivos. La nombran además
`backend/src/utils/cuentasPanel.js`, que la manda a mano en una cabecera HTTP, y
`backend/src/routes/appClientes.js`.

**Lo que separa una Prestadora de otra es un filtro escrito a mano.** `acotarAPrestadora` agrega
`prestadora_id = …` a la consulta, y se lo invoca en 71 renglones. De las 886 consultas del backend,
**111 no nombran la Prestadora**. De esas, **17 confían en un identificador que viene de afuera sin
comprobar de quién es**, y sólo en 1 se verificó que la comprobación exista. Si falta un filtro, la
base contesta igual: no tiene con qué darse cuenta.

**Los archivos más sensibles son los peor protegidos.** De los 11 depósitos, cuatro no tienen
ninguna política: `certificados-medicos`, `autorizaciones-monitoreo`, `documentos-cese` y
`fotos-identidad`. Ahí están los certificados médicos y las fotos de identidad. Los sirve el backend
con la llave maestra, y el aislamiento son **22 casos donde se compara a mano el comienzo de la ruta
del archivo** (`panelMedicacion.js:181`, `panelVitalesAutorizacion.js:79`).

**La protección por fila está puesta, pero hoy no protege de nada.** Las 182 tablas la tienen
encendida y 170 tienen política. Ninguna política depende de nada que aporte el backend: la
Prestadora la resuelve `interno.current_tenant()` sola, con la cuenta de quien entró. Es decir que
**la base ya sabe aislar y nadie le está preguntando.**

**Y hay trabajo que hoy no podría hacerse sin la llave maestra**, porque no tiene ninguna persona
detrás: 16 tareas programadas, 4 entradas que llaman terceros (dos pasarelas de pago, WhatsApp,
facturación y cobranza externas), el alta de cuentas y la recuperación de clave. Eso alcanza **9
tablas** que una sesión no toca de ninguna forma, **4 tablas** que tienen permiso pero cuya
protección por fila niega todo, **28 funciones** y los **4 depósitos sin políticas**.

---

## 2. Qué queda cuando esto termina

- **`SUPABASE_SERVICE_ROLE_KEY` no existe en el producto.** No está en el código, ni en el
  repositorio, ni en las variables de entorno del backend.
- **Todo pedido de una persona viaja con el pase de esa persona**, y la base decide qué filas
  contesta. Un filtro olvidado no devuelve datos de otra Prestadora: no devuelve nada.
- **El trabajo sin persona detrás tiene su propia credencial**, que alcanza sólo las tablas y
  funciones que ese trabajo necesita y **trabaja de a una Prestadora por vez**. Es la llave del
  cuarto de máquinas, no la del edificio.
- **`acotarAPrestadora` se borra.** Con la base decidiendo, un filtro en el código es una
  duplicación que puede contradecirla.
- **Los cuatro depósitos sin política tienen política**, y ningún archivo se autoriza comparando
  texto de una ruta.
- **El estado de la base se lee en un archivo, no en 150.** Esquema declarado más una migración
  maestra única, siempre al día.
- **Nadie puede volver a abrir la puerta sin que el automatismo lo pare.**

---

## 3. Los tramos, en orden

Cada tramo termina con su comprobación. No se empieza el siguiente sin que la del anterior pase.

### Tramo 1 — La credencial del trabajo sin persona

Es lo primero porque hasta que exista, quitar la llave maestra rompe la mitad del producto.

Se crea en la base un rol propio —`tarea_de_fondo`— con permiso **sólo** sobre las 9 tablas de la
entrada, las 4 de secretos y códigos, y las 28 funciones ya inventariadas. Nada más. El backend no
guarda una credencial de ese rol: **firma un pase corto, para una Prestadora y para un trabajo**, y
lo usa para ese trabajo.

`interno.current_tenant()` suma una tercera fuente, después de las dos que ya tiene: cuando quien
consulta es `tarea_de_fondo`, la Prestadora sale del pase que se firmó. Un pase sin Prestadora no
resuelve nada y la base niega todo: falla cerrado, igual que hoy.

Las 4 entradas que llaman terceros son el caso especial: llegan sin saber a qué Prestadora
corresponden. Primero se resuelve la Prestadora por la firma del mensaje —que ya se verifica—, y
recién con ese dato se firma el pase. Leer el secreto de firma es lo único que pasa por una función
que resuelve la Prestadora adentro.

**Comprobación:** con el pase de `tarea_de_fondo` de una Prestadora, se lee lo suyo y se pide algo de
la otra; lo segundo tiene que fallar. Y se intenta con ese pase una tabla que no está en la lista:
también tiene que fallar.

### Tramo 2 — Los archivos

Los cuatro depósitos sin política reciben política, con la Prestadora en el comienzo de la ruta
exigida por la base. Los 22 lugares donde el código compara texto de ruta se borran. Los archivos
se siguen sirviendo con enlace temporal y vencimiento.

**Comprobación:** con el pase de una persona de una Prestadora se pide un archivo de la otra, con la
ruta correcta y todo. Tiene que fallar en la base, no en el código.

### Tramo 3 — El pase de la persona en el backend

`connection.js` deja de exportar un cliente. Pasa a entregar **el cliente de quien está pidiendo**,
armado con el pase que viene en el pedido. Los 135 archivos cambian de qué importan, no de qué
hacen.

`requiereRolPanel.js` deja de validar el pase con la llave maestra: lo valida con la clave pública,
que es para lo que está. Y deja de leer `usuarios` sin filtro, porque con el pase de la persona la
base ya le contesta una sola fila: la suya.

Se hace **por grupos de rutas**, no de una. Al terminar cada grupo, `acotarAPrestadora` sale de esas
rutas.

**Comprobación:** las 1798 pruebas del backend, y las dos pruebas de aislamiento con dos
Prestadoras con datos cargados. Y una prueba nueva que hoy no existe: **quitarle el filtro a una
consulta a propósito y verificar que sigue sin traer datos de la otra Prestadora.** Si eso pasa, la
base está protegiendo. Si no, el tramo no está hecho.

### Tramo 4 — Se cierra la puerta

Sale `SUPABASE_SERVICE_ROLE_KEY` del backend y de sus variables de entorno. Se borra
`acotarAPrestadora`. Los 17 casos que confiaban en un identificador de afuera dejan de ser un riesgo
porque la base ya no les cree.

**Comprobación:** el producto funciona sin esa variable definida. Es la única prueba que no se puede
falsear.

### Tramo 5 — Un solo archivo dice el estado

Se funden las 150 migraciones en una maestra única y se enciende el esquema declarado
—`supabase/config.toml:64` ya tiene el renglón, vacío—. La maestra vuelve a fundirse con cada
migración nueva, así que siempre contiene todo el sistema.

**Comprobación:** se reconstruye la base desde cero con la maestra y se compara el esquema contra la
base de hoy. Si no son idénticos, la fundición está mal.

---

## 4. La documentación

Se revisaron 1363 archivos. **Lo que trababa el cambio estaba en dos archivos y ya salió:** la regla
de `CLAUDE.md` que declaraba la llave maestra como decisión tomada, y el grupo de
`docs/PLAN_HASTA_PRODUCCION.md` que la repetía como decisión a confirmar. En su lugar quedó escrito
lo que vale, y nada sobre por qué cambió.

Queda por hacer el resto. **127 renglones describen el estado de hoy y quedarán falsos** —18 en documentación y 109 en
comentarios de código—. Se corrigen en el tramo donde dejan de ser ciertos, no antes ni en un
barrido aparte.

**65 comentarios viven dentro de migraciones ya aplicadas y no se tocan.** Una migración es una
instrucción que ya se ejecutó: no manda, no se le contesta y no se la corrige. Cuando el esquema
declarado esté encendido, el estado se lee en un archivo y ninguna migración vieja se puede
confundir con el estado de hoy. Eso resuelve los 65 sin escribir nada.

Y hay una premisa caída afuera de este repositorio: `productos\Careonys-Marketplace\docs\PLAN.md:44-48`
apoya toda la etapa 2 de la fusión en que «Careonys protege por el servidor». **Ahí no se toca nada**,
así que queda señalado y se decide cuando la fusión llegue a esa etapa.

---

## 5. Para que no vuelva

Tres automatismos que cortan la publicación:

- **La llave maestra no entra.** Si `SUPABASE_SERVICE_ROLE_KEY` aparece en `backend/src`, el push no
  sale.
- **Ninguna tabla nace sin protección.** Una tabla en el esquema declarado sin protección por fila y
  sin al menos una política corta la publicación. Lo mismo un depósito de archivos sin política.
- **La prueba que puede fallar.** La prueba de aislamiento corre con el filtro del código quitado a
  propósito en una consulta. Si aprueba igual, es la base la que protege. Con esto, una prueba de
  aislamiento verde vuelve a significar algo.

---

## 6. Qué no hace este plan

No cambia ninguna pantalla, ningún texto visible ni ninguna regla de negocio. No cambia qué ve cada
rol. Nadie que use el producto nota nada, salvo que a partir de acá un error de programación no
puede filtrar datos de otra Prestadora.

**Y no cierra el aislamiento de adentro de la Prestadora, que Chile exige.** El art. 13 de la Ley
20.584 prohíbe ver la historia de una persona a quien no está vinculado a su atención, y aclara que
eso **incluye al personal de salud y administrativo de la propia Prestadora**. Es un segundo nivel:
no por rol, sino por vínculo con esa persona. Este plan deja la base decidiendo por Prestadora; el
segundo nivel decidiría por paciente, y es obra aparte con su propia decisión de alcance —qué rol
conserva vista del padrón completo y cuál no—. Queda nombrado acá para que no se lo confunda con lo
que este plan sí resuelve, y porque la arquitectura que sale de este plan es la que lo hace
posible: con la base decidiendo, agregar una condición más es una política, no una reescritura.
