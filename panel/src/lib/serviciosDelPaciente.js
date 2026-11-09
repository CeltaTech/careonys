// Qué Servicios acepta la base para un Paciente.
//
// La regla no se inventa acá: es la misma que aplica la base en
// `interno.exigir_paciente_y_servicio_del_mismo_contratante`, que llaman los disparadores de
// `prestaciones`, `guardias`, `guardia_pacientes` y `cierres_servicio_paciente`: **el Paciente
// tiene que ser del mismo Cliente que el Servicio**.
//
// Está en un archivo aparte porque la usan dos pantallas —el alta de Prestaciones y el alta de
// Guardias— y una regla repetida en dos lugares se despega en el tercero. Que a qué Prestadora
// pertenece cada Servicio ya lo resuelve la protección por fila, así que acá no se vuelve a
// preguntar.

export function servicioSirveParaCliente(servicio, clienteId) {
  return Boolean(clienteId) && servicio?.cliente_id === clienteId;
}

// Un turno puede cubrir a más de un Paciente, y la base los controla a todos. Así que el
// Servicio se puede ofrecer sólo si le sirve a cada uno de los que cubre.
export function serviciosParaClientes(servicios, clienteIds) {
  if (clienteIds.length === 0) return [];
  return servicios.filter((s) => clienteIds.every((clienteId) => servicioSirveParaCliente(s, clienteId)));
}
