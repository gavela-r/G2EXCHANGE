/** Civil dates and source-aware numeric normalization. No database writes. */
export function fechaCivil(value: unknown): string {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error('Fecha inválida');
    return fechaCivil(`${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`);
  }
  const s = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(s+'T00:00:00Z')) || new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s) throw new Error(`Fecha civil inválida: ${s}`);
  return s;
}
export function numeroDato(value: unknown, name: string, optional=false): number | undefined {
  if (value===null || value===undefined || value==='') {
    if (optional) return undefined;
    throw new Error(`DATO_AUSENTE: ${name}`);
  }
  if ((typeof value!=='number' && typeof value!=='string') || (typeof value==='string' && !value.trim()) || !Number.isFinite(Number(value))) throw new Error(`DATO_INVALIDO: ${name}`);
  return Number(value);
}
export function conceptoDAValido(concepto: string): boolean {
  // Reserve reversals and impairments are not depreciation cash-flow addbacks.
  const local=concepto.split(':').pop()!.toLowerCase();
  return !/reversal|reserve|impairment|accretion/.test(local);
}
