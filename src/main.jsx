import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { supabase } from "./supabase";
import "./styles.css";

const L = {
  summer: "Letnja",
  winter: "Zimska",
  all_season: "Celogodišnja",
  available: "Dostupno",
  reserved: "Rezervisano",
  sold: "Prodato",
};
const empty = {
  brand: "",
  model: "",
  width: "",
  profile: "",
  diameter: "",
  season: "summer",
  tread_depth_mm: "",
  quantity: 4,
  sale_price: "",
  purchase_price: "",
  note: "",
  dot: "",
  location: "",
  is_commercial: false,
  photoFiles: [],
  images: [],
  removedImageIds: [],
};
const sizes = {
  width: [
    135, 145, 155, 165, 175, 185, 195, 205, 215, 225, 235, 245, 255, 265, 275,
    285, 295, 305, 315,
  ],
  profile: [25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85],
  diameter: [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22],
};

async function shrink(file) {
  const image = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
  const c = document.createElement("canvas");
  c.width = Math.round(image.width * scale);
  c.height = Math.round(image.height * scale);
  c.getContext("2d").drawImage(image, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, "image/webp", 0.78));
  return new File([blob], "tyre.webp", { type: "image/webp" });
}
const photoUrl = (p) =>
  p
    ? supabase.storage.from("tyre-images").getPublicUrl(p).data.publicUrl
    : null;
const imagesFor = (tyre) =>
  tyre.images?.length
    ? tyre.images
    : tyre.photo_path
      ? [{ id: "legacy", path: tyre.photo_path }]
      : [];
const formatDateTime = (value) =>
  new Intl.DateTimeFormat("sr-RS", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Belgrade",
  }).format(new Date(value));

function useScrollLock(locked) {
  useEffect(() => {
    if (!locked) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [locked]);
}

function App() {
  const [session, setSession] = useState(null),
    [profile, setProfile] = useState(null),
    [tyres, setTyres] = useState([]),
    [view, setView] = useState("inventory"),
    [filters, setFilters] = useState({
      width: "",
      profile: "",
      diameter: "",
      c: false,
      from: "",
      to: "",
    }),
    [reportFilters, setReportFilters] = useState({ from: "", to: "" }),
    [form, setForm] = useState(null),
    [selected, setSelected] = useState(null),
    [operation, setOperation] = useState(null),
    [msg, setMsg] = useState(""),
    [saving, setSaving] = useState(false),
    [locations, setLocations] = useState([]);
  useScrollLock(Boolean(form || selected || operation));
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (session) load();
  }, [session]);
  async function load() {
    const { data: p } = await supabase
      .from("profiles")
      .select("full_name,role")
      .single();
    setProfile(p);
    const q =
      p?.role === "admin"
        ? supabase
            .from("tyres")
            .select("*")
            .order("created_at", { ascending: false })
        : supabase.rpc("employee_inventory");
    const [{ data, error }, { data: loc }, { data: imageRows, error: imagesError }] = await Promise.all([
      q,
      supabase
        .from("warehouse_locations")
        .select("code,name")
        .eq("active", true)
        .order("code"),
      supabase
        .from("tyre_images")
        .select("id,tyre_id,path,sort_order,created_at")
        .order("sort_order")
        .order("created_at"),
    ]);
    if (error) setMsg(error.message);
    else {
      const byTyreId = new Map();
      (imageRows || []).forEach((image) => {
        byTyreId.set(image.tyre_id, [...(byTyreId.get(image.tyre_id) || []), image]);
      });
      setTyres((data || []).map((tyre) => ({ ...tyre, images: byTyreId.get(tyre.id) || [] })));
    }
    if (imagesError) setMsg("Pokrenite SQL migraciju 008_tyre_image_gallery.sql, pa osvežite stranicu.");
    setLocations(loc || []);
  }
  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    try {
    const { photoFiles = [], images = [], removedImageIds = [], id, photo_path: oldPhotoPath, ...fields } = form;
    const keptImages = images.filter((image) => !removedImageIds.includes(image.id));
    if (keptImages.length + photoFiles.length > 6)
      return setMsg("Maksimalno je dozvoljeno 6 fotografija po gumi.");
    const row = {
      ...fields,
      width: +fields.width,
      profile: +fields.profile,
      diameter: +fields.diameter,
      quantity: +fields.quantity,
      sale_price: +fields.sale_price,
      tread_depth_mm: fields.tread_depth_mm ? +fields.tread_depth_mm : null,
      purchase_price: fields.purchase_price ? +fields.purchase_price : null,
    };
    const result = id
      ? await supabase.from("tyres").update(row).eq("id", id).select("id").single()
      : await supabase.from("tyres").insert({ ...row, created_by: session.user.id }).select("id").single();
    if (result.error) return setMsg(result.error.message);
    const tyreId = result.data.id;
    const removedImages = images.filter((image) => removedImageIds.includes(image.id));
    if (removedImages.length) {
      await supabase.storage.from("tyre-images").remove(removedImages.map((image) => image.path));
      const removableIds = removedImages.filter((image) => image.id !== "legacy").map((image) => image.id);
      if (removableIds.length) await supabase.from("tyre_images").delete().in("id", removableIds);
    }
    const uploadedImages = [];
    for (const [index, file] of photoFiles.entries()) {
      const path = `${session.user.id}/${crypto.randomUUID()}.webp`;
      const optimized = await shrink(file);
      const { error: uploadError } = await supabase.storage
        .from("tyre-images")
        .upload(path, optimized, { contentType: "image/webp" });
      if (uploadError) return setMsg(uploadError.message);
      uploadedImages.push({ tyre_id: tyreId, path, sort_order: keptImages.length + index });
    }
    if (uploadedImages.length) {
      const { error: imageError } = await supabase.from("tyre_images").insert(uploadedImages);
      if (imageError) return setMsg(imageError.message);
    }
    const coverPath = keptImages[0]?.path || uploadedImages[0]?.path || null;
    if (coverPath !== oldPhotoPath || removedImages.length)
      await supabase.from("tyres").update({ photo_path: coverPath }).eq("id", tyreId);
    setForm(null);
    setMsg("Sačuvano.");
    load();
    } catch (error) {
      setMsg(error?.message || "Slike nisu uspešno sačuvane. Pokušajte ponovo.");
    } finally {
      setSaving(false);
    }
  }
  async function remove(t) {
    if (!confirm(`Obrisati ${t.brand} ${t.width}/${t.profile} R${t.diameter}?`))
      return;
    const imagePaths = [...new Set([...imagesFor(t).map((image) => image.path), t.photo_path].filter(Boolean))];
    if (imagePaths.length) await supabase.storage.from("tyre-images").remove(imagePaths);
    const { error } = await supabase.from("tyres").delete().eq("id", t.id);
    if (error) return setMsg(error.message);
    setSelected(null);
    load();
  }
  async function applyOperation(data) {
    const { t, status, shipment_required, ...customer } = data;
    if (status === "sold" && !(await removeTyreImages(t))) return;
    const payload = { status, shipment_required, ...customer };
    if (status === "sold") payload.sold_at = new Date().toISOString();
    if (status === "reserved") payload.reserved_at = new Date().toISOString();
    const { error } = await supabase
      .from("tyres")
      .update(payload)
      .eq("id", t.id);
    if (error) return setMsg(error.message);
    setOperation(null);
    setSelected(null);
    load();
  }
  async function completeShipping(t) {
    if (!(await removeTyreImages(t))) return;
    const { error } = await supabase
      .from("tyres")
      .update({
        status: "sold",
        shipment_required: false,
        sold_at: new Date().toISOString(),
      })
      .eq("id", t.id);
    if (error) return setMsg(error.message);
    setSelected(null);
    load();
  }
  async function cancelShipping(t) {
    const { error } = await supabase
      .from("tyres")
      .update({
        status: "available",
        shipment_required: false,
        customer_name: null,
        customer_phone: null,
        customer_address: null,
        reserved_at: null,
      })
      .eq("id", t.id);
    if (error) return setMsg(error.message);
    setSelected(null);
    load();
  }
  async function removeTyreImages(t) {
    const paths = [...new Set([...imagesFor(t).map((image) => image.path), t.photo_path].filter(Boolean))];
    if (!paths.length) return true;
    const { error } = await supabase.storage.from("tyre-images").remove(paths);
    if (error) {
      setMsg(error.message);
      return false;
    }
    return true;
  }
  const visible = useMemo(
    () =>
      tyres.filter((t) => {
        if (
          view === "shipping" &&
          !(t.status === "reserved" && t.shipment_required)
        )
          return false;
        if (view === "sold" && t.status !== "sold") return false;
        if (view === "inventory" && (t.status === "sold" || t.shipment_required)) return false;
        if (filters.width && String(t.width) !== filters.width) return false;
        if (filters.profile && String(t.profile) !== filters.profile)
          return false;
        if (filters.diameter && String(t.diameter) !== filters.diameter)
          return false;
        if (filters.c && !t.is_commercial) return false;
        if (
          filters.from &&
          (!t.sold_at || t.sold_at.slice(0, 10) < filters.from)
        )
          return false;
        if (filters.to && (!t.sold_at || t.sold_at.slice(0, 10) > filters.to))
          return false;
        return true;
      }),
    [tyres, view, filters],
  );
  if (!session) return <Login onSession={setSession} />;
  const admin = profile?.role === "admin";
  return (
    <main className="app-shell">
      <header className="topbar">
        <Brand
          onHome={() => {
            setView("inventory");
            setSelected(null);
            setForm(null);
            setOperation(null);
          }}
        />
        <nav className="app-nav">
          <button
            className={view === "inventory" ? "is-active" : ""}
            aria-current={view === "inventory" ? "page" : undefined}
            onClick={() => setView("inventory")}
          >
            Lager
          </button>
          <button
            className={view === "shipping" ? "is-active" : ""}
            aria-current={view === "shipping" ? "page" : undefined}
            onClick={() => setView("shipping")}
          >
            Za slanje
          </button>
          {admin && (
            <button
              className={view === "sold" ? "is-active" : ""}
              aria-current={view === "sold" ? "page" : undefined}
              onClick={() => setView("sold")}
            >
              Prodate
            </button>
          )}
          {admin && (
            <button
              className={view === "reports" ? "is-active" : ""}
              aria-current={view === "reports" ? "page" : undefined}
              onClick={() => setView("reports")}
            >
              Izveštaji
            </button>
          )}
          {admin && <Warehouse locations={locations} reload={load} />}
        </nav>
        <div className="profile">
          <span className="avatar">
            {(profile?.full_name || session.user.email)[0]}
          </span>
          <span>
            <b>{profile?.full_name || session.user.email}</b>
            <small>{admin ? "Admin" : "Zaposleni"}</small>
          </span>
          <button
            className="text-button"
            onClick={() => supabase.auth.signOut()}
          >
            Odjava
          </button>
        </div>
      </header>
      {msg && <p className="notice">{msg}</p>}
      <section className="intro">
        <div>
          <p className="eyebrow">
            {view === "shipping"
              ? "ISPORUKE"
              : view === "sold"
                ? "IZVEŠTAJ PRODAJE"
                : view === "reports"
                  ? "PREGLED POSLOVANJA"
                : "LAGER GUMA"}
          </p>
          <h1>
            {view === "shipping"
              ? "Gume za slanje"
              : view === "sold"
                ? "Prodate gume"
                : view === "reports"
                  ? "Izveštaji"
                : "Gume na stanju"}
          </h1>
        </div>
        {view === "inventory" && (
          <button className="primary" onClick={() => { setMsg(""); setForm({ ...empty }); }}>
            + Unesi gume
          </button>
        )}
      </section>
      {view === "reports" ? (
        <Reports tyres={tyres} filters={reportFilters} setFilters={setReportFilters} />
      ) : (
        <>
          <Filters f={filters} setF={setFilters} sold={view === "sold"} />
          <div className="cards">
            {visible.map((t) => (
              <Card key={t.id} tyre={t} open={() => setSelected(t)} />
            ))}
            {!visible.length && (
              <div className="empty">Nema stavki za izabrani pregled.</div>
            )}
          </div>
        </>
      )}
      {form && (
        <TyreForm
          form={form}
          setForm={setForm}
          save={save}
          close={() => setForm(null)}
          locations={locations}
          admin={admin}
          saving={saving}
          message={msg}
        />
      )}{" "}
      {selected && (
        <Details
          tyre={selected}
          admin={admin}
          view={view}
          completeShipping={completeShipping}
          cancelShipping={cancelShipping}
          close={() => setSelected(null)}
          edit={() => {
            setSelected(null);
            setForm({ ...selected, photoFiles: [], removedImageIds: [] });
          }}
          remove={() => remove(selected)}
          operate={setOperation}
        />
      )}{" "}
      {operation && (
        <CustomerOperation
          operation={operation}
          close={() => setOperation(null)}
          save={applyOperation}
        />
      )}
    </main>
  );
}
function Brand({ onHome }) {
  return (
    <a
      className="brand"
      href="/"
      onClick={(event) => {
        if (!onHome) return;
        event.preventDefault();
        onHome();
      }}
    >
      <span>TZ</span>
      <strong>TyreZ</strong>
    </a>
  );
}
function Login({ onSession }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [signup, setSignup] = useState(false),
    [name, setName] = useState(""),
    [msg, setMsg] = useState("");
  async function go(e) {
    e.preventDefault();
    const r = signup
      ? await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name } },
        })
      : await supabase.auth.signInWithPassword({ email, password });
    if (r.error) setMsg(r.error.message);
    else if (r.data.session) onSession(r.data.session);
    else setMsg("Potvrdite email, pa se prijavite.");
  }
  return (
    <main className="login-page">
      <section className="login-card">
        <Brand />
        <p className="eyebrow">TYREZ RADIONICA</p>
        <h1>{signup ? "Kreiraj nalog" : "Prijava"}</h1>
        <form onSubmit={go}>
          {signup && (
            <label>
              Ime
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}
          <label>
            Email
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Lozinka
            <input
              required
              type="password"
              minLength="6"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {msg && <p className="form-message">{msg}</p>}
          <button className="primary full">
            {signup ? "Kreiraj" : "Prijavi se"}
          </button>
        </form>
        <button
          className="text-button auth-switch"
          onClick={() => setSignup(!signup)}
        >
          {signup ? "Prijavi se" : "Kreiraj nalog"}
        </button>
      </section>
    </main>
  );
}
function Filters({ f, setF, sold }) {
  const reset = () =>
    setF({ width: "", profile: "", diameter: "", c: false, from: "", to: "" });
  return (
    <section className="panel filters-panel">
      <div className="filters-heading">
        <span>Pretraga po dimenziji</span>
        <button type="button" className="text-button reset-filters" onClick={reset}>
          Resetuj filtere
        </button>
      </div>
      <div className="filters">
        {[
          ["Širina", "width"],
          ["Visina", "profile"],
          ["Prečnik", "diameter"],
        ].map(([l, k]) => (
          <label key={k}>
            {l}
            <select
              value={f[k]}
              onChange={(e) => setF({ ...f, [k]: e.target.value })}
            >
              <option value="">Sve</option>
              {sizes[k].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
        ))}
        <label className="checkbox">
          <input
            type="checkbox"
            checked={f.c}
            onChange={(e) => setF({ ...f, c: e.target.checked })}
          />
          Samo C
        </label>
        {sold && (
          <>
            <label>
              Od
              <input
                type="date"
                value={f.from}
                onChange={(e) => setF({ ...f, from: e.target.value })}
              />
            </label>
            <label>
              Do
              <input
                type="date"
                value={f.to}
                onChange={(e) => setF({ ...f, to: e.target.value })}
              />
            </label>
          </>
        )}
      </div>
    </section>
  );
}
function Reports({ tyres, filters, setFilters }) {
  const inPeriod = (tyre) => {
    const date = tyre.sold_at?.slice(0, 10);
    return (
      date &&
      (!filters.from || date >= filters.from) &&
      (!filters.to || date <= filters.to)
    );
  };
  const sold = tyres.filter((tyre) => tyre.status === "sold" && inPeriod(tyre));
  const stock = tyres.filter(
    (tyre) => tyre.status !== "sold" && !tyre.shipment_required,
  );
  const reservations = tyres.filter(
    (tyre) => tyre.status === "reserved" && !tyre.shipment_required,
  );
  const shipping = tyres.filter(
    (tyre) => tyre.status === "reserved" && tyre.shipment_required,
  );
  const groupBy = (items, key) =>
    [...items.reduce((groups, item) => {
      const group = key(item);
      const current = groups.get(group) || { label: group, quantity: 0, rows: 0 };
      current.quantity += Number(item.quantity || 0);
      current.rows += 1;
      groups.set(group, current);
      return groups;
    }, new Map()).values()].sort((a, b) => b.quantity - a.quantity);
  const byWarehouse = groupBy(stock, (tyre) => tyre.location || "Bez lokacije");
  const byDimension = groupBy(
    stock,
    (tyre) => `${tyre.width}/${tyre.profile} R${tyre.diameter}${tyre.is_commercial ? " C" : ""}`,
  );
  const topSoldDimensions = groupBy(
    sold,
    (tyre) => `${tyre.width}/${tyre.profile} R${tyre.diameter}${tyre.is_commercial ? " C" : ""}`,
  ).slice(0, 5);
  const oldestStock = [...stock]
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .slice(0, 5);
  const soldQuantity = sold.reduce((sum, tyre) => sum + Number(tyre.quantity || 0), 0);
  const turnover = sold.reduce(
    (sum, tyre) => sum + Number(tyre.quantity || 0) * Number(tyre.sale_price || 0),
    0,
  );
  const reset = () => setFilters({ from: "", to: "" });
  return (
    <div className="reports">
      <section className="panel report-period">
        <div>
          <h2>Period prodaje</h2>
          <p>Izaberi period za prodajne pokazatelje i najprodavanije dimenzije.</p>
        </div>
        <div className="report-period-fields">
          <label>Od<input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></label>
          <label>Do<input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></label>
          <button type="button" className="text-button" onClick={reset}>Resetuj</button>
        </div>
      </section>
      <section className="report-summary">
        <div><small>Prodate stavke</small><strong>{sold.length}</strong></div>
        <div><small>Prodate gume</small><strong>{soldQuantity} kom.</strong></div>
        <div><small>Promet od prodaje</small><strong>{turnover.toLocaleString("sr-RS")} €</strong></div>
        <div><small>Trenutno rezervisano</small><strong>{reservations.length} stavki</strong></div>
        <div><small>Za slanje</small><strong>{shipping.length} stavki</strong></div>
      </section>
      <div className="report-grid">
        <ReportTable title="Stanje po magacinu" rows={byWarehouse} empty="Nema guma na stanju." />
        <ReportTable title="Stanje po dimenziji" rows={byDimension.slice(0, 8)} empty="Nema guma na stanju." />
        <ReportTable title="Najprodavanije dimenzije" rows={topSoldDimensions} empty="Nema prodaje za izabrani period." />
        <section className="panel report-table">
          <h2>Najstarije na lageru</h2>
          {oldestStock.length ? (
            <div className="report-rows">
              {oldestStock.map((tyre) => {
                const days = Math.max(0, Math.floor((Date.now() - new Date(tyre.created_at)) / 86400000));
                return <div key={tyre.id}><span>{tyre.brand} {tyre.model} · {tyre.width}/{tyre.profile} R{tyre.diameter}</span><strong>{days} dana</strong></div>;
              })}
            </div>
          ) : <p className="muted">Nema guma na stanju.</p>}
        </section>
        <section className="panel report-table">
          <h2>Rezervisane gume</h2>
          {reservations.length ? (
            <div className="report-rows">
              {reservations.slice(0, 5).map((tyre) => <div key={tyre.id}><span>{tyre.width}/{tyre.profile} R{tyre.diameter} · {tyre.customer_name || "Kupac nije unet"}</span><strong>{tyre.quantity} kom.</strong></div>)}
            </div>
          ) : <p className="muted">Nema rezervisanih guma.</p>}
        </section>
        <section className="panel report-table">
          <h2>Gume za slanje</h2>
          {shipping.length ? (
            <div className="report-rows">
              {shipping.slice(0, 5).map((tyre) => <div key={tyre.id}><span>{tyre.width}/{tyre.profile} R{tyre.diameter} · {tyre.customer_name || "Kupac nije unet"}</span><strong>{tyre.quantity} kom.</strong></div>)}
            </div>
          ) : <p className="muted">Nema guma za slanje.</p>}
        </section>
      </div>
    </div>
  );
}
function ReportTable({ title, rows, empty }) {
  return (
    <section className="panel report-table">
      <h2>{title}</h2>
      {rows.length ? (
        <div className="report-rows">
          {rows.map((row) => <div key={row.label}><span>{row.label}</span><strong>{row.quantity} kom.</strong></div>)}
        </div>
      ) : <p className="muted">{empty}</p>}
    </section>
  );
}
function Card({ tyre, open }) {
  const p = photoUrl(imagesFor(tyre)[0]?.path);
  return (
    <article className="tyre-card">
      {p ? (
        <img className="tyre-photo" src={p} />
      ) : (
        <div className="tyre-icon">◉</div>
      )}
      <div className="tyre-info">
        <p className="tyre-name">
          {tyre.brand} <span>{tyre.model}</span>
        </p>
        <h3>
          {tyre.width}/{tyre.profile} R{tyre.diameter}{" "}
          {tyre.is_commercial && "C"}
        </h3>
        <p className="details">
          {L[tyre.season]} · {tyre.quantity} kom. ·{" "}
          {tyre.location || "Bez lokacije"}
        </p>
        {tyre.dot && <p className="tyre-dot">DOT: {tyre.dot}</p>}
        <div className="price-row">
          <strong>{tyre.sale_price} €</strong>
          <button className="card-action" onClick={open}>
            Detalji
          </button>
        </div>
      </div>
    </article>
  );
}
function TyreForm({ form, setForm, save, close, locations, admin, saving, message }) {
  const profileRef = useRef(null);
  const diameterRef = useRef(null);
  const treadRef = useRef(null);
  const dotRef = useRef(null);
  const existingImages = imagesFor(form);
  const pendingImages = form.photoFiles || [];
  const visibleImages = existingImages.filter(
    (image) => !form.removedImageIds?.includes(image.id),
  );
  const addPhotos = (files) => {
    const combined = [...pendingImages, ...files];
    const allowed = Math.max(0, 6 - visibleImages.length);
    setForm({ ...form, photoFiles: combined.slice(0, allowed) });
  };
  const I = (l, k, p = {}) => (
    <label>
      {l}
      <input
        value={form[k] ?? ""}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
        {...p}
      />
    </label>
  );
  const Dimension = (label, key, length, nextRef, list) => (
    <label>
      {label}
      <input
        value={form[key] ?? ""}
        list={list}
        inputMode="numeric"
        maxLength={length}
        required
        onChange={(event) => {
          const value = event.target.value.replace(/\D/g, "").slice(0, length);
          setForm({ ...form, [key]: value });
          if (value.length === length)
            requestAnimationFrame(() => nextRef.current?.focus());
        }}
      />
    </label>
  );
  return (
    <div className="backdrop">
      <form className="modal" onSubmit={save} aria-busy={saving}>
        <div className="modal-heading">
          <h2>{form.id ? "Uredi gumu" : "Dodaj gume"}</h2>
          <button type="button" className="close" onClick={close}>
            ×
          </button>
        </div>
        {message && <p className="form-message modal-message">{message}</p>}
        <div className="form-grid">
          {I("Marka", "brand", { required: true })}
          {I("Model", "model")}
          {Dimension("Širina", "width", 3, profileRef, "widths")}
          <label>
            Visina
            <input
              ref={profileRef}
              value={form.profile ?? ""}
              list="profiles"
              inputMode="numeric"
              maxLength="2"
              required
              onChange={(event) => {
                const value = event.target.value.replace(/\D/g, "").slice(0, 2);
                setForm({ ...form, profile: value });
                if (value.length === 2)
                  requestAnimationFrame(() => diameterRef.current?.focus());
              }}
            />
          </label>
          <label>
            Prečnik
            <input
              ref={diameterRef}
              value={form.diameter ?? ""}
              list="diameters"
              inputMode="numeric"
              maxLength="2"
              required
              onChange={(event) => {
                const value = event.target.value.replace(/\D/g, "").slice(0, 2);
                setForm({ ...form, diameter: value });
                if (value.length === 2)
                  requestAnimationFrame(() => treadRef.current?.focus());
              }}
            />
          </label>
          <label>
            Šara (mm)
            <input
              ref={treadRef}
              type="number"
              step=".1"
              value={form.tread_depth_mm ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                setForm({ ...form, tread_depth_mm: value });
                if (/^\d{1,2}\.\d$/.test(value))
                  requestAnimationFrame(() => dotRef.current?.focus());
              }}
            />
          </label>
          <label>
            DOT (4 cifre)
            <input
              ref={dotRef}
              value={form.dot ?? ""}
              inputMode="numeric"
              maxLength="4"
              pattern="[0-9]{4}"
              placeholder="npr. 2424"
              onChange={(event) =>
                setForm({
                  ...form,
                  dot: event.target.value.replace(/\D/g, "").slice(0, 4),
                })
              }
            />
          </label>
          <label>
            Sezona
            <select
              value={form.season}
              onChange={(e) => setForm({ ...form, season: e.target.value })}
            >
              <option value="summer">Letnja</option>
              <option value="winter">Zimska</option>
              <option value="all_season">Celogodišnja</option>
            </select>
          </label>
          {I("Količina", "quantity", { type: "number", min: "1" })}
          {I("Prodajna cena po komadu (€)", "sale_price", {
            type: "number",
            required: true,
          })}
          {admin && I("Nabavna cena (€)", "purchase_price", { type: "number" })}
          <label>
            Lokacija
            <select
              value={form.location || ""}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            >
              <option value="">Izaberi lokaciju</option>
              {locations.map((x) => (
                <option key={x.code}>{x.code}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="note-field">
          Napomena
          <textarea
            value={form.note ?? ""}
            maxLength="500"
            placeholder="Npr. jedna guma ima manje oštećenje na bočnoj strani."
            onChange={(event) => setForm({ ...form, note: event.target.value })}
          />
        </label>
        <datalist id="widths">
          {sizes.width.map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
        <datalist id="profiles">
          {sizes.profile.map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
        <datalist id="diameters">
          {sizes.diameter.map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
        <label className="photo-upload">
          Fotografije <small>(najviše 6)</small>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={(e) => addPhotos(Array.from(e.target.files || []))}
          />
          <span>Fotografiši ili izaberi slike ({visibleImages.length + pendingImages.length}/6)</span>
        </label>
        {(visibleImages.length > 0 || pendingImages.length > 0) && (
          <div className="image-editor-list">
            {visibleImages.map((image) => (
              <div key={image.id} className="image-editor-item">
                <img src={photoUrl(image.path)} alt="Fotografija gume" />
                <button
                  type="button"
                  aria-label="Ukloni fotografiju"
                  onClick={() =>
                    setForm({
                      ...form,
                      removedImageIds: [...(form.removedImageIds || []), image.id],
                    })
                  }
                >
                  ×
                </button>
              </div>
            ))}
            {pendingImages.map((file, index) => (
              <div key={`${file.name}-${index}`} className="image-editor-item pending-image">
                <span>{file.name}</span>
                <button
                  type="button"
                  aria-label="Ukloni novu fotografiju"
                  onClick={() =>
                    setForm({
                      ...form,
                      photoFiles: pendingImages.filter((_, fileIndex) => fileIndex !== index),
                    })
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <label className="checkbox">
          <input
            type="checkbox"
            checked={form.is_commercial}
            onChange={(e) =>
              setForm({ ...form, is_commercial: e.target.checked })
            }
          />
          C / teretna guma
        </label>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={close} disabled={saving}>
            Odustani
          </button>
          <button className="primary" disabled={saving}>
            {saving ? <><span className="button-spinner" aria-hidden="true" />Otpremanje slika…</> : "Sačuvaj"}
          </button>
        </div>
      </form>
    </div>
  );
}
function Details({ tyre, admin, view, completeShipping, cancelShipping, close, edit, remove, operate }) {
  const images = imagesFor(tyre);
  const [activeImage, setActiveImage] = useState(0);
  const tyreFacts = [
    ["Status", L[tyre.status]],
    ["Cena", `${tyre.sale_price} € / kom.`],
    ["Šara", tyre.tread_depth_mm ? `${tyre.tread_depth_mm} mm` : "Nije uneta"],
    ["Količina", `${tyre.quantity} kom.`],
    ["Sezona", L[tyre.season]],
    ["Tip", tyre.is_commercial ? "C / teretna" : "Putnička"],
    ["Magacin", tyre.location || "Nije unet"],
    tyre.dot && ["DOT", tyre.dot],
    tyre.note && ["Napomena", tyre.note],
    admin && tyre.purchase_price != null && ["Nabavna cena", `${tyre.purchase_price} € / kom.`],
  ].filter(Boolean);
  const customerFacts =
    tyre.status === "available"
      ? []
      : [
          ["Kupac", tyre.customer_name || "Nije unet"],
          ["Telefon", tyre.customer_phone || "Nije unet"],
          tyre.customer_address && ["Adresa", tyre.customer_address],
          tyre.shipment_required && ["Za slanje", "Da"],
          tyre.reserved_at && ["Rezervisano", tyre.reserved_at.slice(0, 10)],
          tyre.sold_at && ["Prodato", formatDateTime(tyre.sold_at)],
        ].filter(Boolean);
  return (
    <div className="backdrop">
      <section className="modal">
        <div className="modal-heading">
          <h2>
            {tyre.brand} {tyre.model}
          </h2>
          <button className="close" onClick={close}>
            ×
          </button>
        </div>
        {images.length > 0 && (
          <div className="image-gallery">
            <img
              className="detail-photo"
              src={photoUrl(images[activeImage]?.path || images[0].path)}
              alt={`${tyre.brand} ${tyre.model || "guma"}`}
            />
            {images.length > 1 && (
              <div className="gallery-thumbnails">
                {images.map((image, index) => (
                  <button
                    key={image.id || image.path}
                    type="button"
                    className={index === activeImage ? "is-active" : ""}
                    aria-label={`Prikaži fotografiju ${index + 1}`}
                    onClick={() => setActiveImage(index)}
                  >
                    <img src={photoUrl(image.path)} alt="" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <h3 className="tyre-detail-size">
          {tyre.width}/{tyre.profile} R{tyre.diameter}
        </h3>
        <dl className="detail-list">
          {[...tyreFacts, ...customerFacts].map(([a, b]) => (
            <div key={a}>
              <dt>{a}</dt>
              <dd>{b}</dd>
            </div>
          ))}
        </dl>
        <div className="modal-actions">
          {view === "shipping" ? (
            <>
              <button className="secondary" onClick={() => cancelShipping(tyre)}>Kupac odustao</button>
              <button className="primary" onClick={() => completeShipping(tyre)}>Prodato</button>
            </>
          ) : tyre.status !== "sold" && (
            <>
              <button
                className="secondary"
                onClick={() => operate({ type: "reserve", t: tyre })}
              >
                Rezerviši
              </button>
              <button
                className="secondary"
                onClick={() => operate({ type: "shipping", t: tyre })}
              >
                Za slanje
              </button>
              <button
                className="primary"
                onClick={() => operate({ type: "sale", t: tyre })}
              >
                Prodaj
              </button>
            </>
          )}
          <button className="secondary" onClick={edit}>
            Uredi
          </button>
          {admin && (
            <button className="danger" onClick={remove}>
              Obriši
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
function CustomerOperation({ operation, close, save }) {
  const shipping = operation.type === "shipping";
  const reserve = operation.type === "reserve";
  const [f, setF] = useState({
    customer_name: "",
    customer_phone: "",
    customer_address: "",
  });
  function submit(e) {
    e.preventDefault();
    save({
      t: operation.t,
      status: reserve || shipping ? "reserved" : "sold",
      shipment_required: shipping,
      ...f,
    });
  }
  return (
    <div className="backdrop">
      <form className="modal" onSubmit={submit}>
        <div className="modal-heading">
          <h2>
            {reserve
              ? "Rezervacija"
              : shipping
                ? "Priprema za slanje"
                : "Prodaja"}
          </h2>
          <button type="button" className="close" onClick={close}>
            ×
          </button>
        </div>
        <div className="form-grid">
          <label>
            Ime kupca
            <input
              required={reserve || shipping}
              value={f.customer_name}
              onChange={(e) => setF({ ...f, customer_name: e.target.value })}
            />
          </label>
          <label>
            Telefon
            <input
              required={reserve || shipping}
              value={f.customer_phone}
              onChange={(e) => setF({ ...f, customer_phone: e.target.value })}
            />
          </label>
          {!reserve && (
            <label>
              Adresa
              <input
                required={shipping}
                value={f.customer_address}
                onChange={(e) =>
                  setF({ ...f, customer_address: e.target.value })
                }
              />
            </label>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={close}>
            Odustani
          </button>
          <button className="primary">Sačuvaj</button>
        </div>
      </form>
    </div>
  );
}
function Warehouse({ locations, reload }) {
  const [open, setOpen] = useState(false),
    [f, setF] = useState({ code: "", name: "" }),
    [catalog, setCatalog] = useState([]),
    [editing, setEditing] = useState(null),
    [message, setMessage] = useState("");
  useScrollLock(open);
  async function loadCatalog() {
    const { data, error } = await supabase
      .from("warehouse_locations")
      .select("id,code,name,active")
      .order("code");
    if (error) setMessage(error.message);
    else setCatalog(data || []);
  }
  async function openCatalog() {
    setOpen(true);
    setMessage("");
    await loadCatalog();
  }
  async function saveLocation(e) {
    e.preventDefault();
    const code = f.code.trim().toUpperCase();
    const name = f.name.trim();
    if (!code || !name) return;
    const request = editing
      ? supabase
          .from("warehouse_locations")
          .update({ code, name })
          .eq("id", editing.id)
      : supabase.from("warehouse_locations").insert({ code, name });
    const { error } = await request;
    if (error) return setMessage(error.message);
    if (editing && editing.code !== code) {
      const { error: tyreError } = await supabase
        .from("tyres")
        .update({ location: code })
        .eq("location", editing.code);
      if (tyreError) return setMessage(tyreError.message);
    }
    setF({ code: "", name: "" });
    setEditing(null);
    setMessage("Sačuvano.");
    reload();
    loadCatalog();
  }
  async function removeLocation(location) {
    if (!confirm(`Obrisati magacin „${location.code}“? Gume zadržavaju istorijsku oznaku lokacije.`)) return;
    const { error } = await supabase
      .from("warehouse_locations")
      .delete()
      .eq("id", location.id);
    if (error) return setMessage(error.message);
    setMessage("Magacin je obrisan.");
    reload();
    loadCatalog();
  }
  return (
    <>
      <button onClick={openCatalog}>Magacin</button>
      {open && (
        <div className="backdrop">
          <form className="modal warehouse-modal" onSubmit={saveLocation}>
            <div className="modal-heading">
              <h2>Šifarnik magacina</h2>
              <button
                className="close"
                type="button"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </div>
            {message && <p className="form-message modal-message">{message}</p>}
            <div className="warehouse-list">
              {!catalog.length && <p className="muted">Nema unetih magacina.</p>}
              {catalog.map((location) => (
                <div key={location.id} className="warehouse-row">
                  <div>
                    <strong>{location.code}</strong>
                    <span>{location.name}</span>
                  </div>
                  <div className="warehouse-actions">
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        setEditing(location);
                        setF({ code: location.code, name: location.name });
                        setMessage("");
                      }}
                    >
                      Uredi
                    </button>
                    <button type="button" className="danger" onClick={() => removeLocation(location)}>
                      Obriši
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="form-grid">
              <label>
                Šifra {editing && "magacina"}
                <input
                  required
                  value={f.code}
                  onChange={(e) => setF({ ...f, code: e.target.value })}
                />
              </label>
              <label>
                Naziv
                <input
                  required
                  value={f.name}
                  onChange={(e) => setF({ ...f, name: e.target.value })}
                />
              </label>
            </div>
            <div className="modal-actions">
              {editing && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setEditing(null);
                    setF({ code: "", name: "" });
                  }}
                >
                  Odustani
                </button>
              )}
              <button className="primary">{editing ? "Sačuvaj izmene" : "Dodaj lokaciju"}</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
