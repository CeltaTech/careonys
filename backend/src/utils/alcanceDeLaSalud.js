// Si la regla de salud deja a quien pide leer la información de salud de un Paciente.
//
// La regla vive en la base —la política `la_informacion_de_salud_la_ve_quien_atiende`— y es de
// `authenticated`: lo que el backend lee con el trabajo de la Prestadora no pasa por ella. Toda
// lectura de información de salud que se hace con el trabajo de la Prestadora para una persona
// pregunta antes acá, con la credencial de esa persona, y si la respuesta es no, no lee.
//
// Ante la duda, no: una pregunta que no se pudo contestar no deja leer.
export async function alcanzaLaInformacionDeSalud(db, pacienteId) {
  const { data, error } = await db.rpc('alcanza_la_informacion_de_salud_la_sesion', { p_paciente: pacienteId });
  if (error) {
    console.error('No se pudo comprobar el alcance de la información de salud:', error.message);
    return false;
  }
  return data === true;
}
