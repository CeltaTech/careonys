// Una identidad inventada y coherente para sembrar un Asistente de prueba: el CUIL lleva adentro
// el DNI y cierra con su dígito verificador, que es lo que la base exige para guardar un Legajo.
// Nunca se usa con datos de una persona real.
const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

function digitoVerificador(diez) {
  const suma = [...diez].reduce((total, cifra, i) => total + Number(cifra) * PESOS[i], 0);
  const resto = 11 - (suma % 11);
  return resto === 11 ? 0 : resto;
}

export function identidadInventada(dni, genero) {
  const ocho = String(dni).padStart(8, '0');
  let prefijo = genero === 'masculino' ? '20' : '27';
  let digito = digitoVerificador(prefijo + ocho);
  // Cuando el dígito da diez, el organismo fiscal cambia el prefijo a 23.
  if (digito === 10) {
    prefijo = '23';
    digito = digitoVerificador(prefijo + ocho);
  }
  return {
    documento_tipo: 'cuil',
    documento_numero: `${prefijo}${ocho}${digito}`,
    dni: String(Number(ocho)),
    genero,
  };
}
