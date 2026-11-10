// Cómo se escribe un renglón del registro de accesos a la información de salud, en la Ficha del
// Cliente y en la descarga del año que se va a borrar: las mismas columnas en los dos lados.
export function encabezadosDelRegistroDeAccesos(t) {
  const textos = t.clientes.accesos_salud;
  return [textos.col_momento, textos.col_persona, textos.col_paciente, textos.col_informacion, textos.col_lugar];
}

export function renglonDelRegistroDeAccesos(acceso, t, locale) {
  const textos = t.clientes.accesos_salud;
  return [
    new Date(acceso.momento).toLocaleString(locale),
    acceso.persona ?? textos.sistema,
    acceso.paciente ?? '—',
    (acceso.categorias ?? []).map((c) => t.clientes.accesos_salud.categorias[c] ?? textos.categorias.otra).join(', '),
    t.clientes.accesos_salud.lugares[acceso.lugar] ?? textos.lugares.sistema,
  ];
}
