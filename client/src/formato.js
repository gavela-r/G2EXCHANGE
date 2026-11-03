// Formato de números, fechas y nombres compartido por la landing y el screener

export const SIN_DATOS = 'Sin datos';

export const decimal = (n, d = 2) =>
    new Intl.NumberFormat('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);

export const moneda = (n, codigo = 'USD') => n == null ? SIN_DATOS :
    new Intl.NumberFormat('es-ES', { style: 'currency', currency: codigo || 'USD' }).format(n);

export const porcentaje = (n, d = 2) => n == null ? SIN_DATOS : `${n > 0 ? '+' : ''}${decimal(n, d)}%`;

export const fecha = (iso, opciones = { day: '2-digit', month: '2-digit', year: 'numeric' }) => iso == null ? SIN_DATOS :
    new Intl.DateTimeFormat('es-ES', { ...opciones, timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

export function importeGrande(n, codigo = 'USD') {
    if (n == null) return SIN_DATOS;
    if (n >= 1e12) return `${decimal(n / 1e12)} billones ${codigo}`;
    if (n >= 1e9) return `${decimal(n / 1e9, 1)} mil M ${codigo}`;
    if (n >= 1e6) return `${decimal(n / 1e6, 1)} M ${codigo}`;
    return `${decimal(n, 0)} ${codigo}`;
}

// En la BD muchos nombres están en mayúsculas (p. ej. "NVIDIA CORP")
export function nombreLegible(nombre = '') {
    if (nombre !== nombre.toUpperCase()) return nombre;
    return nombre.toLowerCase().replace(/(^|[\s(&.-])(\p{L})/gu, (_, sep, letra) => sep + letra.toUpperCase());
}
