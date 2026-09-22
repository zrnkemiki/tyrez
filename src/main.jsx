import { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const initialTyres = [
  { id: 1, brand: 'Michelin', model: 'Alpin 6', width: '205', profile: '55', diameter: '16', season: 'Zimska', tread: '6.5 mm', quantity: 4, price: 68, commercial: false, status: 'Dostupno' },
  { id: 2, brand: 'Continental', model: 'PremiumContact 6', width: '225', profile: '45', diameter: '17', season: 'Letnja', tread: '5.8 mm', quantity: 2, price: 75, commercial: false, status: 'Dostupno' },
  { id: 3, brand: 'Goodyear', model: 'Cargo Vector 2', width: '195', profile: '75', diameter: '16', season: 'Celogodišnja', tread: '7.1 mm', quantity: 4, price: 82, commercial: true, status: 'Rezervisano' },
]

function App() {
  const [tyres, setTyres] = useState(initialTyres)
  const [filters, setFilters] = useState({ width: '', profile: '', diameter: '', commercial: false })
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ brand: '', model: '', width: '', profile: '', diameter: '', season: 'Letnja', tread: '', quantity: 4, price: '', commercial: false })

  const filtered = useMemo(() => tyres.filter((tyre) =>
    (!filters.width || tyre.width === filters.width) &&
    (!filters.profile || tyre.profile === filters.profile) &&
    (!filters.diameter || tyre.diameter === filters.diameter) &&
    (!filters.commercial || tyre.commercial)
  ), [tyres, filters])

  function addTyre(event) {
    event.preventDefault()
    setTyres((items) => [...items, { ...form, id: crypto.randomUUID(), price: Number(form.price), quantity: Number(form.quantity), status: 'Dostupno' }])
    setForm({ brand: '', model: '', width: '', profile: '', diameter: '', season: 'Letnja', tread: '', quantity: 4, price: '', commercial: false })
    setShowForm(false)
  }

  return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href="#top" aria-label="TyreZ početna"><span>TZ</span><strong>TyreZ</strong></a>
      <div className="profile"><span className="avatar">A</span><span><b>Admin</b><small>Radionica</small></span></div>
    </header>
    <section className="intro" id="top">
      <div><p className="eyebrow">LAGER GUMA</p><h1>Gume na stanju</h1><p className="muted">Brzo pronađite odgovarajuću dimenziju ili unesite novi komplet.</p></div>
      <button className="primary" onClick={() => setShowForm(true)}>+ Unesi gume</button>
    </section>
    <section className="summary">
      <div><small>Kompleta na stanju</small><strong>{tyres.reduce((sum, tyre) => sum + Math.ceil(tyre.quantity / 4), 0)}</strong></div>
      <div><small>Ukupno komada</small><strong>{tyres.reduce((sum, tyre) => sum + tyre.quantity, 0)}</strong></div>
      <div><small>Rezervisano</small><strong>{tyres.filter((tyre) => tyre.status === 'Rezervisano').reduce((sum, tyre) => sum + tyre.quantity, 0)}</strong></div>
    </section>
    <section className="panel">
      <div className="panel-heading"><div><h2>Pretraga po dimenziji</h2><p>Odaberite širinu, visinu i prečnik gume.</p></div><button className="text-button" onClick={() => setFilters({ width: '', profile: '', diameter: '', commercial: false })}>Obriši filtere</button></div>
      <div className="filters">
        <Filter label="Širina" value={filters.width} onChange={(width) => setFilters({ ...filters, width })} options={['195', '205', '225']} />
        <Filter label="Visina" value={filters.profile} onChange={(profile) => setFilters({ ...filters, profile })} options={['45', '55', '75']} />
        <Filter label="Prečnik" value={filters.diameter} onChange={(diameter) => setFilters({ ...filters, diameter })} options={['16', '17']} />
        <label className="checkbox"><input type="checkbox" checked={filters.commercial} onChange={(event) => setFilters({ ...filters, commercial: event.target.checked })} /><span>Samo C / teretne gume</span></label>
      </div>
    </section>
    <section className="results">
      <div className="results-heading"><h2>Rezultati <span>{filtered.length}</span></h2><p>Prikazane su dostupne i rezervisane stavke iz lagera.</p></div>
      <div className="cards">{filtered.map((tyre) => <TyreCard key={tyre.id} tyre={tyre} />)}{filtered.length === 0 && <div className="empty">Nema guma za izabranu dimenziju.</div>}</div>
    </section>
    {showForm && <div className="backdrop" role="presentation"><form className="modal" onSubmit={addTyre}><div className="modal-heading"><div><p className="eyebrow">NOVI UNOS</p><h2>Dodaj gume</h2></div><button type="button" className="close" onClick={() => setShowForm(false)} aria-label="Zatvori">×</button></div><div className="form-grid"><Input label="Marka" field="brand" form={form} setForm={setForm} required /><Input label="Model" field="model" form={form} setForm={setForm} /><Input label="Širina" field="width" form={form} setForm={setForm} required /><Input label="Visina" field="profile" form={form} setForm={setForm} required /><Input label="Prečnik (R)" field="diameter" form={form} setForm={setForm} required /><Input label="Dubina šare" field="tread" form={form} setForm={setForm} placeholder="npr. 6.2 mm" /><label>Sezona<select value={form.season} onChange={(e) => setForm({ ...form, season: e.target.value })}><option>Letnja</option><option>Zimska</option><option>Celogodišnja</option></select></label><Input label="Količina" field="quantity" type="number" form={form} setForm={setForm} required /><Input label="Prodajna cena (€)" field="price" type="number" form={form} setForm={setForm} required /></div><label className="checkbox form-check"><input type="checkbox" checked={form.commercial} onChange={(event) => setForm({ ...form, commercial: event.target.checked })} /><span>C / teretna guma</span></label><div className="modal-actions"><button type="button" className="secondary" onClick={() => setShowForm(false)}>Odustani</button><button className="primary" type="submit">Sačuvaj gume</button></div></form></div>}
  </main>
}

function Filter({ label, value, onChange, options }) { return <label>{label}<select value={value} onChange={(event) => onChange(event.target.value)}><option value="">Sve</option>{options.map((option) => <option key={option}>{option}</option>)}</select></label> }
function Input({ label, field, form, setForm, ...props }) { return <label>{label}<input value={form[field]} onChange={(event) => setForm({ ...form, [field]: event.target.value })} {...props} /></label> }
function TyreCard({ tyre }) { return <article className="tyre-card"><div className="tyre-icon">◉</div><div className="tyre-info"><div className="card-top"><div><p className="tyre-name">{tyre.brand} <span>{tyre.model}</span></p><h3>{tyre.width} / {tyre.profile} R{tyre.diameter} {tyre.commercial && <em>C</em>}</h3></div><span className={`status ${tyre.status === 'Rezervisano' ? 'reserved' : ''}`}>{tyre.status}</span></div><p className="details">{tyre.season} · Šara {tyre.tread} · {tyre.quantity} kom.</p><div className="price-row"><strong>{tyre.price} € <small>/ kom.</small></strong><button className="card-action">Detalji</button></div></div></article> }

createRoot(document.getElementById('root')).render(<App />)
