import { useEffect, useState } from 'react'
import './capital.css'

const base = '/api/capital'
const format = n => n == null ? 'No estimable' : new Intl.NumberFormat('es-ES', { maximumFractionDigits: 4 }).format(n)
const rate = n => n == null ? 'No estimable' : `${format(n * 100)} %`
const colour = { FAVORABLE: 'green', DESFAVORABLE: 'red', NEUTRAL: 'grey', DESCONOCIDO: 'amber' }
function PriceChart({ bars }) {
  const xs = bars.filter(b => Number.isFinite(b.cierre) && b.cierre > 0)
  if (xs.length < 2) return <p className="muted">Hace falta más de una sesión para representar una evolución.</p>
  const min = Math.min(...xs.map(b => b.cierre)), max = Math.max(...xs.map(b => b.cierre)), span = max - min || 1
  const points = xs.map((b, i) => `${20 + i / (xs.length - 1) * 660},${150 - (b.cierre - min) / span * 125}`).join(' ')
  return <figure className="price-chart"><svg viewBox="0 0 700 180" role="img" aria-label={`Precios registrados de ${xs[0].fecha} a ${xs.at(-1).fecha}`}><line x1="20" y1="155" x2="680" y2="155" stroke="#c7d7df" /><polyline points={points} fill="none" stroke="#176c5b" strokeWidth="3" /></svg><figcaption>{xs[0].fecha} → {xs.at(-1).fecha} · {xs.length} sesiones registradas · cierre {format(xs.at(-1).cierre)} {xs.at(-1).moneda}. Ver estado de validación de cada observación.</figcaption></figure>
}
async function api(url, body, token, signal) {
  const r = await fetch(base + url, { signal, headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Capital-Review-Token': token } : {}) }, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) })
  const data = await r.json()
  if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`)
  return data
}
export default function CapitalApp() {
  const [search, setSearch] = useState('NVIDIA'), [companies, setCompanies] = useState([]), [id, setId] = useState('')
  const [date, setDate] = useState(() => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())), [period, setPeriod] = useState('')
  const [session, setSession] = useState(null), [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [benchmarks, setBenchmarks] = useState(null), [history, setHistory] = useState([]), [analysisId, setAnalysisId] = useState(null)
  const [run, setRun] = useState(''), [simulation, setSimulation] = useState(null), [ke, setKe] = useState('0'), [kd, setKd] = useState('0')
  const [serverProposals, setServerProposals] = useState([]), [reviewReason, setReviewReason] = useState('')
  const [periodPolicy, setPeriodPolicy] = useState('EXACT_PERIOD')
  useEffect(() => { api('/session').then(setSession).catch(e => setError(e.message)) }, [])
  useEffect(() => {
    const c = new AbortController()
    const t = setTimeout(() => api(`/companies?q=${encodeURIComponent(search)}`, null, null, c.signal).then(setCompanies).catch(e => { if (e.name !== 'AbortError') setError(e.message) }), 300)
    return () => { clearTimeout(t); c.abort() }
  }, [search])
  useEffect(() => {
    if (!id) return
    const c = new AbortController(); setBusy(true); setError(''); setData(null); setBenchmarks(null); setAnalysisId(null); setSimulation(null); setServerProposals([])
    api(`/companies/${id}?asOf=${date}${period ? `&periodEnd=${period}` : ''}`, null, null, c.signal).then(x => { setData(x); setRun(String(x.runs[0]?.id ?? '')) }).catch(e => { if (e.name !== 'AbortError') setError(e.message) }).finally(() => { if (!c.signal.aborted) setBusy(false) })
    api(`/companies/${id}/history`, null, null, c.signal).then(setHistory).catch(() => {})
    api(`/companies/${id}/proposals`, null, null, c.signal).then(setServerProposals).catch(() => {})
    return () => c.abort()
  }, [id, date, period])
  async function act(fn) { setBusy(true); setError(''); try { await fn() } catch (e) { setError(e.message) } finally { setBusy(false) } }
  async function save() {
    const x = await api(`/companies/${id}/evaluations`, { asOf: date, ...(period ? { periodEnd: period } : {}) }, session?.token)
    setAnalysisId(x.analysisId); setHistory(await api(`/companies/${id}/history`))
  }
  async function reject() {
    await api(`/analyses/${analysisId}/decisions`, { action: 'REJECTED', reason: 'Revisión humana: no aplicar ajustes financieros sin calibración validada', requestId: crypto.randomUUID(), previousDecisionId: history.find(x => x.id === analysisId)?.decision_id ?? null }, session?.token)
    setHistory(await api(`/companies/${id}/history`))
  }
  async function decideProposal(proposalId, action) {
    await api(`/analyses/${proposalId}/decisions`, { action, reason: reviewReason, requestId: crypto.randomUUID(), previousDecisionId: history.find(h => h.id === proposalId)?.decision_id ?? null }, session?.token)
    setHistory(await api(`/companies/${id}/history`))
  }
  async function simulate(event) {
    event.preventDefault()
    await act(async () => { const x = await api(`/runs/${run}/simulations`, { keBps: Number(ke), kdBps: Number(kd) }, session?.token); setSimulation(x); setAnalysisId(x.analysisId); setHistory(await api(`/companies/${id}/history`)) })
  }
  async function calculateAutomatic() {
    const x = await api(`/runs/${run}/automatic-premiums`, {}, session?.token)
    setSimulation(x); setAnalysisId(x.analysisId)
    setHistory(await api(`/companies/${id}/history`)); setServerProposals(await api(`/companies/${id}/proposals`))
  }
  const proposals = data?.propuestas.map(p => benchmarks?.benchmarks?.find(b => b.propuesta.indicador.id === p.indicador.id)?.propuesta ?? p) ?? []
  return <div className="workbench">
    <header><a href="/" className="brand">G2<span>EXCHANGE</span></a><span className="mode">Capital v2 · copia de desarrollo</span></header>
    <main>
      <div className="intro"><p className="eyebrow">VALORACIÓN · EVIDENCIA · TRAZABILIDAD</p><h1>Liquidez y tamaño empresarial</h1><p>Reconocer ventajas y riesgos. Aplicar ajustes únicamente cuando exista evidencia cuantitativa autorizada.</p></div>
      <section className="panel selection" aria-label="Selección de empresa">
        <label>Buscar empresa o ticker<input value={search} onChange={e => setSearch(e.target.value)} placeholder="NVIDIA, Apple, 2330…" /></label>
        <label>Empresa<select value={id} onChange={e => { setPeriod(''); setId(e.target.value) }}><option value="">Seleccionar empresa</option>{companies.map(c => <option key={c.id} value={c.id}>{c.nombre_empresa} · {c.ticker} · {c.codigo_iso}</option>)}</select></label>
        <label>Fecha de evaluación<input type="date" value={date} onChange={e => setDate(e.target.value)} required /></label>
      </section>
      {error && <div role="alert" className="notice red">{error}</div>}
      {busy && <p role="status">Consultando y validando evidencias…</p>}
      {!data && !busy && <section className="panel empty"><h2>Selecciona una empresa</h2><p>Consultarás informes y evidencias disponibles en la copia de desarrollo. Las empresas sin datos permanecen visibles.</p></section>}
      {data && <>
        <section className="company-head"><div><h2>{data.empresa.nombre_empresa}</h2><p>{data.empresa.codigo_iso} · Sector: {data.empresa.sectorEfectivo} · Familia: {data.empresa.familia}</p></div><span className={`badge ${data.bloqueo ? 'red' : 'amber'}`}>{data.bloqueo ? 'IDENTIDAD BLOQUEADA' : 'DIAGNÓSTICO'}</span></section>
        {data.bloqueo && <p className="notice red">{data.bloqueo}. Los registros originales se conservan y se excluyen de nuevas evaluaciones.</p>}
        <div className="metrics"><article className="panel"><span>Indicadores validados del periodo</span><strong>{data.cobertura.validados} / {data.cobertura.total}</strong><small>La presencia numérica no acredita calidad.</small></article><article className="panel"><span>Capitalización bursátil</span><strong className="status-text">{data.capitalizacion.estado.replaceAll('_', ' ')}</strong><small>Precio × acciones exige identidad, clase, fechas y cambios de capital conciliados.</small></article><article className="panel"><span>Propuestas aprobadas de la empresa</span><strong>{serverProposals.filter(p => p.decision === 'APPROVED').length}</strong><small>NO ESTIMABLE se conserva distinto de una prima de 0 %.</small></article></div>
        <section className="panel"><div className="section-head"><h2>Datos financieros y diagnóstico</h2><label>Ejercicio disponible<select value={period || data.periodoSeleccionado || ''} onChange={e => setPeriod(e.target.value)}>{data.periodos.map(p => <option key={p.informeId} value={p.periodo.fin}>{p.periodo.fin} · {p.moneda ?? '?'} · {p.basis ?? 'Consolidación desconocida'}</option>)}</select></label></div>
          <p className="muted">{data.cobertura.scope} · Favorable describe una comparación; no autoriza una reducción del WACC.</p>
          <div className="legend"><span className="badge green">Favorable</span><span className="badge red">Desfavorable</span><span className="badge grey">Neutral</span><span className="badge amber">Información insuficiente</span></div>
          <label>Comparabilidad de periodos<select value={periodPolicy} onChange={e => { setPeriodPolicy(e.target.value); setBenchmarks(null) }}><option value="EXACT_PERIOD">Periodo coincidente (criterio estricto)</option><option value="ANNUAL_CLOSE_YEAR">Cierres en el mismo año natural (sólo descriptivo)</option></select></label>
          <div className="table-scroll"><table><thead><tr><th>Indicador</th><th>Valor</th><th>Unidad</th><th>Referencia</th><th>Dirección</th><th>Ajuste</th><th>Evidencia y limitaciones</th></tr></thead><tbody>{proposals.map(p => <tr key={p.indicador.id}><th>{p.indicador.id.replaceAll('_', ' ')}</th><td>{format(p.indicador.valor)}</td><td>{p.indicador.moneda ?? p.indicador.unidad}</td><td>{format(p.referencia)}</td><td><span className={`badge ${colour[p.direccion]}`}>{p.direccion}</span></td><td>{p.estado}</td><td><details><summary>Ver evidencia</summary><p>{p.justificacion}</p><p>{p.indicador.formula}</p>{p.indicador.fuentes.map((f, i) => <p key={i}><a href={f.url} target="_blank" rel="noreferrer">{f.identificador}</a></p>)}<p>{p.limitaciones.join(' ')}</p><p>{p.posiblesDuplicidades.join(' ')}</p></details></td></tr>)}</tbody></table></div>
          {!proposals.length && <p className="notice amber">Sin indicadores acreditados. No se sustituyen por cero.</p>}
          <div className="actions"><button disabled={busy || !data.empresa.clasificacionResuelta || !session?.reviewEnabled} onClick={() => act(async () => { setBenchmarks(await api(`/companies/${id}/benchmarks`, { asOf: date, periodEnd: period || data.periodoSeleccionado, periodPolicy }, session?.token)); setHistory(await api(`/companies/${id}/history`)) })}>Comparar con el sector y guardar referencia</button><button disabled={busy || !session?.reviewEnabled} onClick={() => act(save)}>Guardar evaluación versionada</button></div>
          {benchmarks && <p role="status">{benchmarks.estado} · {benchmarks.motivo ?? `${benchmarks.universo?.length ?? 0} empresas candidatas; ver referencias y exclusiones.`}</p>}
          {benchmarks?.advertencias?.length > 0 && <p className="notice amber">{benchmarks.advertencias.join(' ')}</p>}
          {benchmarks?.benchmarks?.length > 0 && <details><summary>Comparables, reglas y exclusiones</summary><pre>{JSON.stringify(benchmarks, null, 2)}</pre></details>}
        </section>
        <section className="panel"><h2>Primas automáticas</h2><p>El ajuste operativo es numérico. Un 0 % con estado NO_ESTIMABLE no es una estimación de riesgo cero. Las primas calculadas no nulas requieren aprobación individual.</p><div className="table-scroll"><table><thead><tr><th>Factor</th><th>Prima calculada</th><th>Ajuste operativo</th><th>Estado financiero</th><th>Motivo</th></tr></thead><tbody>{(simulation?.primasAutomaticas ?? data.primasAutomaticas)?.primas.map(p => <tr key={p.factor}><th>{p.factor}</th><td>{p.primaCalculada == null ? 'NO ESTIMABLE' : rate(p.primaCalculada)}</td><td>{rate(p.ajusteOperativo)}</td><td><span className={`badge ${p.estadoFinanciero === 'NO_ESTIMABLE' ? 'amber' : 'grey'}`}>{p.estadoFinanciero} · {p.estadoAplicacion}</span></td><td>{p.motivo}{p.fuenteCoeficientes && <p><a href={p.fuenteCoeficientes}>Fuente de coeficientes</a></p>}</td></tr>)}</tbody></table></div></section>
        <section className="panel"><h2>Liquidez bursátil</h2><p>Series separadas por instrumento, fuente y feed. Las sesiones ausentes no se cuentan como días sin negociación.</p>{!data.bursatil.length && <p className="notice amber">Sin serie bursátil conciliada en el almacén histórico.</p>}{data.bursatil.map(b => <article key={`${b.instrumentoId}-${b.source}-${b.feed}`}><PriceChart bars={b.precios} /><h3>{b.source} · {b.feed} · {b.precios.length} sesiones</h3><div className="metrics">{b.ventanas.map(w => <div key={w.ventana}><strong>{w.ventana} sesiones</strong><p>Amihud: {format(w.amihud)}</p><small>{w.estado} · {w.sesiones.length} utilizadas · {w.descartadas.length} descartadas</small></div>)}</div><details><summary>Observaciones y exclusiones</summary><pre>{JSON.stringify(b, null, 2)}</pre></details></article>)}</section>
        <section className="panel"><h2>Dimensiones del tamaño</h2><p>Operativo: ingresos {format(data.tamano.operativo.ingresos)} · EBITDA {format(data.tamano.operativo.ebitda)} · EBIT {format(data.tamano.operativo.ebit)} · Activos {format(data.tamano.operativo.activosTotales)} {data.tamano.operativo.moneda}</p><p>Financiero: deuda bruta {format(data.tamano.financiero.deudaBruta)} · Deuda neta {format(data.tamano.financiero.deudaNeta)} · Margen EBIT {rate(data.tamano.rentabilidad.margenEbit)}</p><p>{data.tamano.interpretacion}</p><details><summary>Capitalización, diversificación y acceso a financiación</summary><pre>{JSON.stringify({ capitalizacion: data.capitalizacion, tamano: data.tamano }, null, 2)}</pre></details></section><section className="panel"><h2>WACC e impacto sobre la valoración</h2><p>Una ejecución congelada frente a una hipótesis manual. Se mantienen los flujos originales y se recalculan Ke, Kd y WACC.</p>
          {!data.runs.length ? <p className="notice amber">Sin ejecución congelada en esta copia.</p> : <form onSubmit={simulate} className="simulation-form"><label>Ejecución original<select value={run} onChange={e => setRun(e.target.value)}>{data.runs.map(r => <option key={r.id} value={r.id}>Run {r.id} · Plantilla {r.template_code} · {r.valuation_method_family}</option>)}</select></label><label>Hipótesis ΔKe (puntos básicos)<input type="number" step="any" value={ke} onChange={e => setKe(e.target.value)} required /></label><label>Hipótesis ΔKd (puntos básicos)<input type="number" step="any" value={kd} onChange={e => setKd(e.target.value)} required /></label><button disabled={busy}>Simular sin aplicar</button><button type="button" disabled={busy || !session?.reviewEnabled} onClick={() => act(calculateAutomatic)}>Calcular primas automáticas y exportar</button></form>}
          {simulation && <><p className="notice amber">{simulation.uso === 'AUTOMATICO_PRIMAS' ? 'AUTOMÁTICO: consultar estados y aprobación. El 0 operativo NO_ESTIMABLE conserva la base financiera.' : 'MANUAL: HIPÓTESIS, NO ES UNA PRIMA AUTORIZADA'}</p><div className="table-scroll"><table><thead><tr><th>Escenario</th><th>Ke base → hipótesis</th><th>Kd base → hipótesis</th><th>WACC financiero → hipótesis</th><th>Valor/acción original → hipótesis</th><th>Diferencia</th></tr></thead><tbody>{simulation.escenarios.map(s => <tr key={s.escenario}><th>{s.escenario}</th><td>{rate(s.keBase)} → {rate(s.keAjustado)}</td><td>{rate(s.kdBase)} → {rate(s.kdAjustado)}</td><td>{s.waccAplicable ? `${rate(s.waccBase)} → ${rate(s.waccAjustado)}` : 'NO APLICABLE · modelo equity'}</td><td>{format(s.impacto.original?.fair_value)} → {format(s.impacto.ajustado?.fair_value)}</td><td>{rate(s.impacto.diferenciaPorcentual)}</td></tr>)}</tbody></table></div><details><summary>EV, Equity y trazabilidad</summary><pre>{JSON.stringify(simulation, null, 2)}</pre></details></>}
        </section>
        <section className="panel"><h2>Revisión y documentos</h2>
          <p>Sin metodología calibrada y autorizada, la aprobación financiera permanece bloqueada.</p>
          <label>Justificación de revisión<input value={reviewReason} onChange={e => setReviewReason(e.target.value)} placeholder="Motivo de aprobación o rechazo" /></label>
          {serverProposals.map(p => <article key={p.id}><h3>Propuesta #{p.id} · {p.methodologyStatus}</h3><p>{p.payload.factor} · {p.payload.component} · {rate(p.payload.delta)}</p><button disabled={busy || !p.canRequestApproval || reviewReason.trim().length < 3} onClick={() => act(() => decideProposal(p.id, 'APPROVED'))}>Solicitar aprobación financiera</button><button disabled={busy || reviewReason.trim().length < 3} onClick={() => act(() => decideProposal(p.id, 'REJECTED'))}>Rechazar propuesta</button></article>)}
          <div className="actions"><button disabled title="Requiere propuesta cuantitativa y metodología aprobada">Aprobar ajuste · bloqueado sin propuesta validada</button><button disabled={!analysisId || busy || simulation?.analysisId === analysisId} onClick={() => act(reject)}>Rechazar ajuste de esta evaluación</button>{analysisId && <><a className="button" href={`${base}/analyses/${analysisId}/export/xlsx`}>Descargar Excel</a><a className="button secondary" href={`${base}/analyses/${analysisId}/export/pdf`}>Descargar PDF</a></>}</div>
          <details><summary>Metodologías y fuentes verificables</summary>{data.metodologias.map(m => <p key={m.id}><a href={m.url} target="_blank" rel="noreferrer">{m.id}</a> · {m.clase} · Cuantificación no autorizada</p>)}</details><h3>Historial de evaluaciones y decisiones</h3><ul className="history">{history.map((h, n) => <li key={`${h.id}-${h.decision_id}-${n}`}>#{h.id} · {h.kind} · {h.as_of} · {h.action ?? 'PROPUESTO / SIN DECISIÓN'} {h.actor ?? ''} {h.reason ?? ''}</li>)}</ul>
        </section>
      </>}
      <footer>G2EXCHANGE · Datos sin acreditar permanecen desconocidos. Valoraciones congeladas y maestros originales conservados.</footer>
    </main>
  </div>
}
