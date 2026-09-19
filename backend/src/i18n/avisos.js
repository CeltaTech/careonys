import {
  FUENTE_AVISO_TELEFONICO,
  FUENTE_AVISO_DEMORA_ASISTENTE,
  FUENTE_CALCULO_LLEGADA_TARDIA,
  FUENTE_SIN_AVISO_NI_SALIDA,
} from '../utils/fuentesAlertaTemprana.js';
import { IDIOMA_POR_DEFECTO, IDIOMAS_SOPORTADOS, normalizarIdioma } from './idiomas.js';
import { IDENTIDAD } from '../config/identidadProducto.js';
import { frase } from './mensajesDelSistema.js';

/* Cómo se arma cada aviso que sale del motor.
   ==========================================

   POR QUÉ EXISTE. Un aviso que sale por correo, por WhatsApp o al celular es texto visible, y el
   texto visible se traduce (`celtatech\CLAUDE.md` §8). Antes ese castellano estaba escrito adentro
   de cada archivo que mandaba el aviso —una docena de archivos—, así que el producto hablaba tres
   idiomas en la pantalla y uno solo apenas salía de ella.

   ACÁ NO HAY NINGUNA FRASE ESCRITA. Las frases viven en `mensajes_del_sistema`, que se edita desde
   afuera; este archivo decide cuál va, en qué orden, con qué número y en qué rama. La redacción es
   dato y el armado es código, porque en castellano el plazo se dice «hace 20 minutos» y en inglés
   «20 minutes ago», y los nombres de una lista se cierran con «y», con «and» o con «e»: eso no lo
   resuelve ningún marcador.

   QUIEN LLAMA NO ELIGE PALABRAS. Los emisores pasan hechos —una fecha, una cantidad, si el
   Asistente marcó su salida o no— y reciben el asunto y el texto ya armados. Ninguna decisión de
   redacción queda del lado del emisor, porque ahí volvería a existir en un solo idioma.

   UNA CLAVE QUE NO EXISTE SIGUE ROMPIENDO ACÁ, y a propósito: las claves de aviso son las de este
   archivo, no las de la tabla. Que las palabras se editen desde afuera no significa que alguien
   pueda inventar un aviso nuevo sin código que lo mande.

   SI FALTA UNA FRASE, no sale un hueco mudo: sale la marca que deja `mensajesDelSistema.js`, y
   queda avisado por consola. */

/** «Ana», «Ana y Luis», «Ana, Luis y Marta» — con la conjunción que use cada idioma. */
function unirNombres(nombres, conjuncion, siNoHayNinguno) {
  const limpios = (nombres ?? []).filter(Boolean);
  if (limpios.length === 0) return siNoHayNinguno;
  return [limpios.slice(0, -1).join(', '), limpios.at(-1)].filter(Boolean).join(` ${conjuncion} `);
}

/* Cuánto hace, en la unidad que se entiende de un vistazo. Por debajo de dos horas se dice en
   minutos y por encima en horas: «185 minutos» obliga a hacer la cuenta justo cuando quien lee
   tiene que decidir rápido. */
function enMinutosUHoras(minutos, t) {
  const redondeado = Math.round(minutos);
  return redondeado < 120
    ? `${redondeado} ${t('comun.minutos')}`
    : `${Math.round(redondeado / 60)} ${t('comun.horas')}`;
}

/* Escapa lo que venga de la base —un nombre, el nombre de fantasía de una Prestadora— antes de
   meterlo adentro del HTML. Un apellido con «&» o con «<» rompería el correo, y un texto cargado
   por alguien no puede convertirse en etiquetas. */
function comoTextoHTML(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* Un correo con un enlace para hacer clic, en vez de una dirección larga suelta en el texto.
   El enlace se ve con el estilo que cada programa de correo le da a un enlace: no se inventan
   acá colores ni tipografías (`celtatech\CLAUDE.md` §8, «Diseño sólo con el sistema propio»), y
   además cada programa de correo recorta el estilo a su manera.

   Quien lea el correo en un programa que no muestra formato recibe igual la versión en texto, que
   sí lleva la dirección escrita entera. */
function correoConBoton({ saludo, cuerpo, boton, link, pieDeAviso, marca }) {
  const partes = [
    `<p>${comoTextoHTML(saludo)}</p>`,
    `<p>${comoTextoHTML(cuerpo)}</p>`,
    `<p><a href="${comoTextoHTML(link)}">${comoTextoHTML(boton)}</a></p>`,
    `<p>${comoTextoHTML(pieDeAviso)}</p>`,
  ];
  if (marca) partes.push(`<hr><p>${comoTextoHTML(marca)}</p>`);
  return partes.join('\n');
}

// LA LÍNEA AL PIE. Todo correo dirigido a una Familia o a un Asistente lleva adelante la marca de
// la Prestadora y el nombre del producto en una sola línea al pie
// (`docs\REGLAS_PRODUCTOS_CAREONYS.md` §4). El nombre sale de `IDENTIDAD` y no de un parámetro:
// así ningún emisor puede olvidarse de pasarlo y quedarse sin el pie. Los dos correos con formato
// —activación y clave nueva— lo siguen recibiendo por parámetro, porque el pie va adentro del
// armado del HTML. El guion que separa no se traduce: es puntuación, no una frase.
function pie(t) {
  return `\n\n—\n${t('comun.marca', { producto: IDENTIDAD.nombre })}`;
}

/** La lista de Pacientes de una guardia, con la conjunción del idioma que corresponda. */
function pacientesDe(t, pacientes) {
  return unirNombres(pacientes, t('comun.conjuncion'), t('comun.paciente_sin_nombre'));
}

/** El renglón que abre casi todos los avisos de guardia: cuál es, cuándo y para quién. */
function lineaGuardia(t, d) {
  return t('comun.linea_guardia', {
    fecha: d.fecha,
    horaInicio: d.horaInicio,
    horaFin: d.horaFin,
    pacientes: pacientesDe(t, d.pacientes),
  });
}

/** «3 Asistentes», «1 Asistente» — el número y el sustantivo en el número que le toca. */
function cuantosAsistentes(t, n) {
  return `${n} ${t(n === 1 ? 'comun.asistente_uno' : 'comun.asistente_varios')}`;
}

/** El renglón de la ausencia, con fecha de vuelta o sin ella. */
function lineaDeAusencia(t, d) {
  const asistente = d.asistente ?? t('comun.un_asistente');
  return d.fechaFin
    ? t('comun.ausencia_desde_hasta', { asistente, fechaInicio: d.fechaInicio, fechaFin: d.fechaFin })
    : t('comun.ausencia_desde', { asistente, fechaInicio: d.fechaInicio });
}

/** «Empieza en 3 h» o «Tendría que haber empezado hace 3 h», según el caso. */
function lineaDeArranque(t, d) {
  return t(d.yaEmpezo ? 'comun.tendria_que_haber_empezado' : 'comun.empieza_en', { horas: d.horas });
}

// El aviso tiene que servir para actuar, no solo para enterarse. Por eso dice en qué punto está la
// búsqueda: si todavía no se ofreció a nadie, si se ofreció y nadie contestó, o si contestaron
// todos que no. Son tres situaciones con tres acciones distintas.
function estadoDeLaBusqueda(t, { ofrecida, invitados, sinContestar, aceptaron }) {
  if (!ofrecida) return t('guardia_sin_cubrir.sin_ofrecer');
  if (invitados === 0) return t('guardia_sin_cubrir.publicada_sin_invitar');
  if (sinContestar > 0) {
    return t(sinContestar === 1 ? 'guardia_sin_cubrir.sin_contestar_uno' : 'guardia_sin_cubrir.sin_contestar_varios', {
      invitados: cuantosAsistentes(t, invitados),
      sinContestar,
    });
  }
  if (aceptaron > 0) {
    return t(aceptaron === 1 ? 'guardia_sin_cubrir.aceptaron_uno' : 'guardia_sin_cubrir.aceptaron_varios', {
      aceptaron: cuantosAsistentes(t, aceptaron),
    });
  }
  return t(invitados === 1 ? 'guardia_sin_cubrir.rechazaron_uno' : 'guardia_sin_cubrir.rechazaron_varios', {
    invitados: cuantosAsistentes(t, invitados),
  });
}

/** De dónde salió la alerta temprana. La clave sale de la fuente; el texto, de la tabla. */
const CLAVE_POR_FUENTE = {
  [FUENTE_AVISO_TELEFONICO]: 'origen_de_alerta.aviso_telefonico',
  [FUENTE_AVISO_DEMORA_ASISTENTE]: 'origen_de_alerta.aviso_demora_asistente',
  [FUENTE_CALCULO_LLEGADA_TARDIA]: 'origen_de_alerta.calculo_llegada_tardia',
  [FUENTE_SIN_AVISO_NI_SALIDA]: 'origen_de_alerta.sin_aviso_ni_salida',
};

/** Los tres estados en que puede quedar una postulación. */
const CLAVE_POR_ESTADO_DE_POSTULACION = {
  en_revision: 'estado_postulacion.en_revision',
  aprobado: 'estado_postulacion.aprobado',
  rechazado: 'estado_postulacion.rechazado',
};

/* Cada aviso, armado. `t` es la frase en el idioma de quien lo va a leer, y ya trae resuelto el
   piso de la Prestadora cuando ella escribió el suyo. */
const ARMADORES = {
  origen_de_alerta: (t, { fuente }) => ({
    texto: t(CLAVE_POR_FUENTE[fuente] ?? 'origen_de_alerta.sin_registrar'),
  }),

  guardia_sin_cerrar: (t, d) => ({
    asunto: t('guardia_sin_cerrar.asunto'),
    texto: [
      lineaGuardia(t, d),
      t('comun.a_cargo', {
        asistente: d.asistente || t('comun.asistente_sin_asignar'),
        atraso: enMinutosUHoras(d.minutosDeAtraso, t),
      }),
      t(d.salidaMarcada ? 'guardia_sin_cerrar.salida_marcada' : 'guardia_sin_cerrar.salida_sin_marcar'),
      d.veces > 1 ? t('comun.aviso_repetido_guardia', { veces: d.veces }) : null,
    ].filter(Boolean).join('\n'),
  }),

  guardia_sin_cerrar_grave: (t, d) => ({
    asunto: t('guardia_sin_cerrar_grave.asunto'),
    texto: [
      lineaGuardia(t, d),
      t('comun.a_cargo', {
        asistente: d.asistente || t('comun.asistente_sin_asignar'),
        atraso: enMinutosUHoras(d.minutosDeAtraso, t),
      }),
      t('guardia_sin_cerrar_grave.hace_falta_autoridad'),
      t(d.salidaMarcada
        ? 'guardia_sin_cerrar_grave.salida_marcada'
        : 'guardia_sin_cerrar_grave.salida_sin_marcar'),
    ].join('\n'),
  }),

  // Lo mismo que arriba, contado para la Familia. Dice cuál es la guardia y qué pasó, y nada de
  // adentro: ni el escalón de la alarma, ni los minutos de la cuenta interna, ni ningún
  // identificador, ni el nombre de quien estaba asignado. Las claves terminan en `_familia` por lo
  // mismo que `incidente_relevo_familia`: son dos textos distintos sobre el mismo hecho, y tenerlos
  // separados es lo que impide que a la Familia le llegue el de adentro.
  guardia_sin_cerrar_familia: (t, d) => ({
    titulo: t('guardia_sin_cerrar_familia.titulo'),
    cuerpo: t('guardia_sin_cerrar_familia.cuerpo', {
      fecha: d.fecha,
      horaInicio: d.horaInicio,
      horaFin: d.horaFin,
      pacientes: pacientesDe(t, d.pacientes),
    }),
  }),

  guardia_sin_cerrar_grave_familia: (t, d) => ({
    titulo: t('guardia_sin_cerrar_grave_familia.titulo'),
    cuerpo: t('guardia_sin_cerrar_grave_familia.cuerpo', {
      fecha: d.fecha,
      horaInicio: d.horaInicio,
      horaFin: d.horaFin,
      pacientes: pacientesDe(t, d.pacientes),
    }),
  }),

  alerta_temprana_guardia_familia: (t, d) => ({
    titulo: t('alerta_temprana_guardia_familia.titulo'),
    cuerpo: t('alerta_temprana_guardia_familia.cuerpo', {
      fecha: d.fecha,
      horaInicio: d.horaInicio,
      horaFin: d.horaFin,
      pacientes: pacientesDe(t, d.pacientes),
    }),
  }),

  guardia_sin_cerrar_respaldo: (t, d) => ({
    texto: t('guardia_sin_cerrar_respaldo.texto', {
      fecha: d.fecha,
      horaInicio: d.horaInicio,
      horaFin: d.horaFin,
      minutos: Math.round(d.minutosDeAtraso),
    }),
  }),

  escalada_a_respaldo: (t) => ({ asunto: t('escalada_a_respaldo.asunto') }),

  // Los dos escalones que siguen. El asunto dice los minutos porque el cuerpo es el mismo que ya
  // recibió quien coordina: sin eso, quien lo lee no sabe por qué le está llegando a él.
  escalada_a_todos_los_coordinadores: (t, d) => ({
    asunto: t('escalada_a_todos_los_coordinadores.asunto', { minutos: d.minutos }),
  }),

  escalada_a_la_administracion: (t, d) => ({
    asunto: t('escalada_a_la_administracion.asunto', { minutos: d.minutos }),
  }),

  alerta_temprana_sin_resolver: (t, d) => ({
    asunto: t('alerta_temprana_sin_resolver.asunto'),
    // El origen va adelante del motivo a propósito: quien lee tiene que poder distinguir de un
    // vistazo un aviso que dio una persona de una cuenta que sacó el sistema.
    texto: [
      lineaGuardia(t, d),
      t('alerta_temprana_sin_resolver.detalle', {
        origen: d.origen,
        motivo: d.motivo ?? '—',
        minutos: Math.round(d.minutos),
      }),
    ].join('\n'),
  }),

  alerta_temprana_respaldo: (t, d) => ({
    texto: [
      lineaGuardia(t, d),
      t('alerta_temprana_respaldo.demora', { minutos: Math.round(d.minutos) }),
    ].join('\n'),
  }),

  aviso_demora_asistente: (t, d) => ({
    asunto: t('aviso_demora_asistente.asunto'),
    texto: t('aviso_demora_asistente.texto', {
      fecha: d.fecha,
      horaInicio: d.horaInicio,
      origen: d.origen,
      motivo: d.motivo,
    }),
  }),

  // Lo que escribió el Asistente no entra acá. Este mensaje sale por WhatsApp o por correo, y lo
  // escribió alguien que está mirando a un Paciente (`celtatech/CLAUDE.md` §6). El texto se lee
  // entrando al Panel, que es donde el permiso se comprueba.
  emergencia_en_guardia: (t, d) => ({
    asunto: t('emergencia_en_guardia.asunto'),
    texto: t('emergencia_en_guardia.texto', { fecha: d.fecha, horaInicio: d.horaInicio }),
  }),

  // Lo mismo: lo que escribió no entra acá. Y el texto no pide nada ni sugiere qué hacer — quien
  // decide es quien coordina.
  no_puede_continuar_la_extension: (t, d) => ({
    asunto: t('no_puede_continuar_la_extension.asunto'),
    texto: t('no_puede_continuar_la_extension.texto', {
      fecha: d.fecha,
      horaInicio: d.horaInicio,
      horaFin: d.horaFin,
    }),
  }),

  // El nivel de escalada no va en el texto: es una cuenta interna. Y este texto es sólo para quien
  // coordina: a la Familia le llega el suyo, `incidente_relevo_familia`.
  incidente_relevo_sin_resolver: (t, d) => ({
    asunto: t('incidente_relevo_sin_resolver.asunto'),
    texto: [
      lineaGuardia(t, d),
      t('incidente_relevo_sin_resolver.demora', { minutos: Math.round(d.minutos) }),
    ].join('\n'),
  }),

  incidente_relevo_respaldo: (t, d) => ({
    texto: [
      lineaGuardia(t, d),
      t('incidente_relevo_respaldo.demora', { minutos: Math.round(d.minutos) }),
    ].join('\n'),
  }),

  incidente_relevo_fase_automatica: (t, d) => ({
    asunto: t('incidente_relevo_fase_automatica.asunto'),
    texto: [
      `${lineaGuardia(t, d)} ${t('incidente_relevo_fase_automatica.sin_resolver_desde', { minutosUmbral: d.minutosUmbral })}`,
      d.sinNivel || d.sinOrden
        ? t('incidente_relevo_fase_automatica.sin_orden')
        : d.contactados > 0
          ? t(d.contactados === 1
            ? 'incidente_relevo_fase_automatica.contactados_uno'
            : 'incidente_relevo_fase_automatica.contactados_varios', { contactados: d.contactados })
          : t('incidente_relevo_fase_automatica.nadie_disponible'),
      d.quedaElFamiliar ? t('incidente_relevo_fase_automatica.queda_el_familiar') : null,
      t('incidente_relevo_fase_automatica.sigue_sin_nadie'),
    ].filter(Boolean).join('\n'),
  }),

  convocatoria_de_relevo: (t, d) => ({
    titulo: t('convocatoria_de_relevo.titulo', {
      fecha: d.fecha,
      horaInicio: d.horaInicio,
      horaFin: d.horaFin,
    }),
  }),

  // A la Familia se le dice lo que le toca saber y nada más: cuál es la guardia y que el relevo
  // todavía no llegó. Nada de adentro del funcionamiento, y con quién hablar si quiere preguntar.
  incidente_relevo_familia: (t, d) => ({
    titulo: t('incidente_relevo_familia.titulo'),
    cuerpo: t('incidente_relevo_familia.cuerpo', {
      fecha: d.fecha,
      horaInicio: d.horaInicio,
      horaFin: d.horaFin,
    }),
  }),

  cambio_de_asistente: (t, d) => {
    const unaSola = d.turnos.length === 1;
    return {
      asunto: t(unaSola ? 'cambio_de_asistente.asunto_uno' : 'cambio_de_asistente.asunto_varios'),
      texto: [
        d.asistenteAnterior
          ? t(unaSola ? 'cambio_de_asistente.cambio_uno' : 'cambio_de_asistente.cambio_varios', {
            anterior: d.asistenteAnterior,
            // Encabeza la oración en inglés, así que va con mayúscula donde ese idioma la pide.
            nuevo: d.asistenteNuevo ?? t('cambio_de_asistente.asistente_sin_nombre_encabezando'),
          })
          : t(unaSola ? 'cambio_de_asistente.pasa_uno' : 'cambio_de_asistente.pasa_varios', {
            nuevo: d.asistenteNuevo ?? t('cambio_de_asistente.asistente_sin_nombre'),
          }),
        ...d.turnos.map((turno) => t('cambio_de_asistente.linea_turno', {
          fecha: turno.fecha,
          horaInicio: turno.horaInicio,
          horaFin: turno.horaFin,
          pacientes: pacientesDe(t, turno.pacientes),
        })),
      ].join('\n'),
    };
  },

  cambio_de_asistente_familia: (t, d) => ({
    titulo: t('cambio_de_asistente_familia.titulo'),
    cuerpo: d.turnos.length === 1
      ? t('cambio_de_asistente_familia.cuerpo_uno', {
        fecha: d.turnos[0].fecha,
        horaInicio: d.turnos[0].horaInicio,
        horaFin: d.turnos[0].horaFin,
        nuevo: d.asistenteNuevo ?? t('cambio_de_asistente_familia.otro_asistente'),
      })
      : t('cambio_de_asistente_familia.cuerpo_varios', {
        cuantas: d.turnos.length,
        fecha: d.turnos[0].fecha,
        nuevo: d.asistenteNuevo ?? t('cambio_de_asistente_familia.otro_asistente'),
      }),
  }),

  ausencia_avisada_con_tiempo: (t, d) => ({
    asunto: t('ausencia_avisada_con_tiempo.asunto'),
    texto: [
      lineaDeAusencia(t, d),
      t(d.turnos === 1
        ? 'ausencia_avisada_con_tiempo.deja_turnos_uno'
        : 'ausencia_avisada_con_tiempo.deja_turnos_varios', {
        turnos: d.turnos,
        fecha: d.fecha,
        horaInicio: d.horaInicio,
        horaFin: d.horaFin,
        horas: d.horas,
      }),
      d.veces > 1 ? t('comun.aviso_repetido_ausencia', { veces: d.veces }) : null,
    ].filter(Boolean).join('\n'),
  }),

  ausencia_de_golpe: (t, d) => ({
    asunto: t(d.yaEmpezo ? 'ausencia_de_golpe.asunto_ya_empezo' : 'ausencia_de_golpe.asunto'),
    texto: [
      lineaDeAusencia(t, d),
      lineaGuardia(t, d),
      lineaDeArranque(t, d),
      d.turnos > 1
        ? t(d.turnos - 1 === 1 ? 'ausencia_de_golpe.ademas_uno' : 'ausencia_de_golpe.ademas_varios', {
          otras: d.turnos - 1,
        })
        : null,
      d.veces > 1 ? t('comun.aviso_repetido_ausencia', { veces: d.veces }) : null,
    ].filter(Boolean).join('\n'),
  }),

  guardia_sin_cubrir: (t, d) => ({
    asunto: t(d.yaEmpezo ? 'guardia_sin_cubrir.asunto_ya_empezo' : 'guardia_sin_cubrir.asunto'),
    texto: [
      lineaGuardia(t, d),
      lineaDeArranque(t, d),
      estadoDeLaBusqueda(t, d.busqueda),
      d.veces > 1 ? t('comun.aviso_repetido_guardia', { veces: d.veces }) : null,
    ].filter(Boolean).join('\n'),
  }),

  incidente_turno_sin_cubrir: (t, d) => ({
    asunto: t(d.yaEmpezo
      ? 'incidente_turno_sin_cubrir.asunto_ya_empezo'
      : 'incidente_turno_sin_cubrir.asunto'),
    texto: [
      lineaGuardia(t, d),
      lineaDeArranque(t, d),
      d.cubrenFrancos?.length
        ? t('incidente_turno_sin_cubrir.cubren_francos', {
          nombres: unirNombres(d.cubrenFrancos, t('comun.conjuncion'), ''),
        })
        : null,
      d.candidatos?.length
        ? t('incidente_turno_sin_cubrir.equipo', {
          nombres: unirNombres(d.candidatos, t('comun.conjuncion'), ''),
        })
        : t('incidente_turno_sin_cubrir.sin_equipo'),
      d.veces > 1 ? t('incidente_turno_sin_cubrir.recordatorio_repetido', { veces: d.veces }) : null,
    ].filter(Boolean).join('\n'),
  }),

  alerta_ia_coordinador: (t, d) => ({
    asunto: t(d.esRoja ? 'alerta_ia_coordinador.asunto_roja' : 'alerta_ia_coordinador.asunto_amarilla'),
    texto: t('alerta_ia_coordinador.texto'),
  }),

  alerta_ia_familia: (t, d) => ({
    titulo: t(d.esRoja ? 'alerta_ia_familia.titulo_roja' : 'alerta_ia_familia.titulo_amarilla'),
    cuerpo: t(d.esRoja ? 'alerta_ia_familia.cuerpo_roja' : 'alerta_ia_familia.cuerpo_amarilla'),
  }),

  vencimiento_documentos: (t, d) => ({
    asunto: t(d.documentos.length === 1
      ? 'vencimiento_documentos.asunto_uno'
      : 'vencimiento_documentos.asunto_varios', {
      etiqueta: d.etiqueta,
      cuantos: d.documentos.length,
    }),
    texto: `${t('vencimiento_documentos.encabezado', { etiqueta: d.etiqueta, dias: d.dias })}\n\n${
      d.documentos
        .map((x) => t('vencimiento_documentos.linea', {
          nombre: x.nombre,
          fechaVencimiento: x.fechaVencimiento,
        }))
        .join('\n')
    }`,
  }),

  mfa_codigo_recuperacion: (t, d) => ({
    asunto: t('mfa_codigo_recuperacion.asunto', { producto: d.producto }),
    texto: t('mfa_codigo_recuperacion.texto', { codigo: d.codigo, minutos: d.minutos }),
  }),

  codigo_instruccion_circulo: (t, d) => ({
    asunto: t('codigo_instruccion_circulo.asunto', { remite: d.remite }),
    texto: t('codigo_instruccion_circulo.texto', {
      codigo: d.codigo,
      minutos: d.minutos,
      remite: d.remite,
    }),
  }),

  activacion_cuenta: (t, d) => {
    const saludo = t('comun.saludo', { nombre: d.nombre });
    const cuerpo = t('activacion_cuenta.cuerpo', { empresa: d.empresa });
    const pieDeAviso = t('activacion_cuenta.pie_de_aviso', { dias: d.dias });
    const marca = t('comun.marca', { producto: d.producto });
    return {
      asunto: t('activacion_cuenta.asunto', { empresa: d.empresa }),
      texto: [
        saludo, '', cuerpo, '',
        t('activacion_cuenta.invitacion_al_enlace'), d.link, '',
        pieDeAviso, '', '—', marca,
      ].join('\n'),
      html: correoConBoton({
        saludo,
        cuerpo,
        boton: t('activacion_cuenta.boton'),
        link: d.link,
        pieDeAviso,
        marca,
      }),
    };
  },

  recuperacion_clave: (t, d) => {
    const saludo = t('comun.saludo', { nombre: d.nombre });
    const cuerpo = t('recuperacion_clave.cuerpo', { empresa: d.empresa });
    const pieDeAviso = t('recuperacion_clave.pie_de_aviso', { horas: d.horas });
    const marca = t('comun.marca', { producto: d.producto });
    return {
      asunto: t('recuperacion_clave.asunto', { empresa: d.empresa }),
      texto: [
        saludo, '', cuerpo, '',
        t('recuperacion_clave.invitacion_al_enlace'), d.link, '',
        pieDeAviso, '', '—', marca,
      ].join('\n'),
      html: correoConBoton({
        saludo,
        cuerpo,
        boton: t('recuperacion_clave.boton'),
        link: d.link,
        pieDeAviso,
        marca,
      }),
    };
  },

  /* No nombra ningún tipo de Asistente: los tipos salen de un catálogo que carga cada Prestadora,
     y escribir uno acá lo dejaría fijo en el código para todas. */
  estado_postulacion: (t, d) => {
    const claveDelEstado = CLAVE_POR_ESTADO_DE_POSTULACION[d.estado];
    return {
      asunto: t('estado_postulacion.asunto', { empresa: d.empresa }),
      texto: [
        t('comun.saludo', { nombre: d.nombre || '' }),
        '',
        claveDelEstado ? t(claveDelEstado, { empresa: d.empresa }) : '',
        '',
        t('estado_postulacion.firma', { empresa: d.empresa }),
      ].join('\n') + pie(t),
    };
  },

  // Los datos de quien se postula no salen en el cuerpo del correo, igual que en
  // `emergencia_en_guardia`: se leen entrando al Panel, que es donde el permiso se comprueba.
  nueva_postulacion_asistente: (t, d) => ({
    asunto: t('nueva_postulacion_asistente.asunto', { nombre: d.nombre }),
    texto: t('nueva_postulacion_asistente.texto', { nombre: d.nombre }),
  }),

  nueva_solicitud_servicio: (t, d) => ({
    asunto: t('nueva_solicitud_servicio.asunto', { nombre: d.nombre }),
    texto: t('nueva_solicitud_servicio.texto', {
      nombre: d.nombre,
      telefono: d.telefono,
      email: d.email,
      localidad: d.localidad,
      tipoServicio: d.tipoServicio,
      modalidad: d.modalidad,
      diasHorario: d.diasHorario,
      descripcion: d.descripcion ?? '—',
    }),
  }),

  mensaje_del_coordinador: (t) => ({ titulo: t('mensaje_del_coordinador.titulo') }),

  guardia_asignada: (t, d) => ({
    titulo: t('guardia_asignada.titulo'),
    cuerpo: t('guardia_asignada.cuerpo', { fecha: d.fecha, horaInicio: d.horaInicio }),
  }),

  recordatorio_de_guardia: (t, d) => ({
    titulo: t('recordatorio_de_guardia.titulo'),
    cuerpo: t('recordatorio_de_guardia.cuerpo', { fecha: d.fecha, horaInicio: d.horaInicio }),
  }),

  fin_periodo_sin_cargo: (t, d) => ({
    titulo: t('fin_periodo_sin_cargo.titulo'),
    cuerpo: t('fin_periodo_sin_cargo.cuerpo', { dia: d.dia, importe: d.importe }),
  }),

  cobro_no_realizado: (t, d) => ({
    titulo: t('cobro_no_realizado.titulo'),
    cuerpo: t('cobro_no_realizado.cuerpo', { importe: d.importe, dia: d.dia }),
  }),

  // No dice por qué se cerró el servicio: el motivo es del Paciente y de su Familia. Y no dice
  // nada del desempeño del Asistente, porque este aviso sale justamente cuando el cierre no
  // tuvo que ver con él.
  cese_de_servicio: (t) => ({
    titulo: t('cese_de_servicio.titulo'),
    cuerpo: t('cese_de_servicio.cuerpo'),
  }),

  /* Los tres avisos de la entrevista salen por correo, porque quien se postuló todavía no tiene
     ninguna aplicación instalada: lo único que dejó es su correo.

     EL ENLACE NO ES LA SALA. Lleva a una pantalla del producto, que comprueba que sea la hora
     antes de dejar entrar. Por eso el mismo enlace sigue sirviendo si la entrevista se
     reprograma, y por eso el aviso dice desde cuándo se puede entrar. */
  entrevista_agendada: (t, d) => ({
    titulo: t('entrevista_agendada.titulo', { prestadora: d.prestadora }),
    cuerpo: t('entrevista_agendada.cuerpo', {
      cuando: d.cuando,
      enlace: d.enlace,
      anticipo: d.anticipo,
    }) + pie(t),
  }),

  entrevista_reprogramada: (t, d) => ({
    titulo: t('entrevista_reprogramada.titulo', { prestadora: d.prestadora }),
    cuerpo: t('entrevista_reprogramada.cuerpo', {
      cuando: d.cuando,
      enlace: d.enlace,
      anticipo: d.anticipo,
    }) + pie(t),
  }),

  // No dice por qué se canceló. El motivo es de la Prestadora, y un aviso automático que lo
  // adelante contesta mal una pregunta que todavía no se hizo.
  entrevista_cancelada: (t, d) => ({
    titulo: t('entrevista_cancelada.titulo', { prestadora: d.prestadora }),
    cuerpo: t('entrevista_cancelada.cuerpo', { cuando: d.cuando }) + pie(t),
  }),

  // Los cuatro avisos de la seguridad de la cuenta. Salen siempre, sin que nadie los configure:
  // quien recibe uno que no reconoce es la única persona que puede darse cuenta de que alguien más
  // está entrando. Por eso cada uno dice qué hacer, y lo que hay que hacer es siempre lo mismo.
  // Ninguna Prestadora los reescribe, y eso está marcado en la propia tabla.
  //
  // NINGUNO LLEVA EL NÚMERO NI EL CÓDIGO. Son datos sensibles y no viajan por correo. El aviso dice
  // que el número cambió, no a cuál.
  clave_recuperada: (t, d) => ({
    asunto: t('clave_recuperada.asunto', { prestadora: d.prestadora }),
    texto: t('clave_recuperada.texto', { nombre: d.nombre, prestadora: d.prestadora }) + pie(t),
  }),

  telefono_cambiado: (t, d) => ({
    asunto: t('telefono_cambiado.asunto', { prestadora: d.prestadora }),
    texto: t('telefono_cambiado.texto', { nombre: d.nombre, prestadora: d.prestadora }) + pie(t),
  }),

  entrada_desde_equipo_nuevo: (t, d) => ({
    asunto: t('entrada_desde_equipo_nuevo.asunto', { prestadora: d.prestadora }),
    texto: t('entrada_desde_equipo_nuevo.texto', { nombre: d.nombre }) + pie(t),
  }),

  cambio_de_clave_habilitado: (t, d) => ({
    asunto: t('cambio_de_clave_habilitado.asunto', { prestadora: d.prestadora }),
    texto: t('cambio_de_clave_habilitado.texto', {
      nombre: d.nombre,
      prestadora: d.prestadora,
    }) + pie(t),
  }),
};

/** Las claves del catálogo, para que una prueba pueda recorrerlas sin que nadie las escriba dos veces. */
export const CLAVES_DE_AVISO = Object.keys(ARMADORES);

/** Los idiomas del catálogo, en el mismo orden en que los declara `idiomas.js`. */
export const IDIOMAS_DEL_CATALOGO = IDIOMAS_SOPORTADOS;

/**
 * Un aviso armado: `{ asunto, texto }` para los que salen por correo o WhatsApp, `{ titulo,
 * cuerpo }` para los que llegan al celular.
 *
 * Una clave que no existe rompe acá y no en el buzón de nadie: un aviso vacío que sale es peor que
 * un proceso que falla, porque el que sale nadie lo mira.
 *
 * @param {string} clave
 * @param {string|null|undefined} idioma
 * @param {object} [datos]
 * @param {string|null} [prestadoraId]  para que salga el texto propio de esa Prestadora, si escribió uno
 */
export function aviso(clave, idioma, datos = {}, prestadoraId = null) {
  const armar = ARMADORES[clave];
  if (!armar) throw new Error(`Aviso desconocido: ${clave}`);
  const idiomaFirme = normalizarIdioma(idioma);
  const t = (claveDelMensaje, valores) => frase(claveDelMensaje, idiomaFirme, valores, prestadoraId);
  return armar(t, datos);
}

export { IDIOMA_POR_DEFECTO };
