"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fechaCivil = fechaCivil;
/** SQL DATE es una fecha civil, nunca un instante ni un Date de JavaScript. */
function fechaCivil(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
        || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
        throw new Error('DATE_CIVIL_REQUERIDA: usar dateStrings; no convertir instantes a fechas de cierre');
    }
    return value;
}
//# sourceMappingURL=fecha.js.map