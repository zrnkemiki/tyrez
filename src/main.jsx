import { useEffect, useMemo, useState } from "react";
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
    [form, setForm] = useState(null),
    [selected, setSelected] = useState(null),
    [operation, setOperation] = useState(null),
    [msg, setMsg] = useState(""),
    [saving, setSaving] = useState(false),
    [locations, setLocations] = useState([]);
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
                : "LAGER GUMA"}
          </p>
          <h1>
            {view === "shipping"
              ? "Gume za slanje"
              : view === "sold"
                ? "Prodate gume"
                : "Gume na stanju"}
          </h1>
        </div>
        {view === "inventory" && (
          <button className="primary" onClick={() => { setMsg(""); setForm({ ...empty }); }}>
            + Unesi gume
          </button>
        )}
      </section>
      <Filters f={filters} setF={setFilters} sold={view === "sold"} />
      <div className="cards">
        {visible.map((t) => (
          <Card key={t.id} tyre={t} open={() => setSelected(t)} />
        ))}
        {!visible.length && (
          <div className="empty">Nema stavki za izabrani pregled.</div>
        )}
      </div>
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
  return (
    <section className="panel filters-panel">
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
          {I("Širina", "width", {
            list: "widths",
            inputMode: "numeric",
            required: true,
          })}
          {I("Visina", "profile", {
            list: "profiles",
            inputMode: "numeric",
            required: true,
          })}
          {I("Prečnik", "diameter", {
            list: "diameters",
            inputMode: "numeric",
            required: true,
          })}
          {I("Šara (mm)", "tread_depth_mm", { type: "number", step: ".1" })}
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
          {I("Prodajna cena (€)", "sale_price", {
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
    [f, setF] = useState({ code: "", name: "" });
  async function add(e) {
    e.preventDefault();
    await supabase
      .from("warehouse_locations")
      .insert({ ...f, code: f.code.toUpperCase() });
    setF({ code: "", name: "" });
    reload();
  }
  return (
    <>
      <button onClick={() => setOpen(true)}>Magacin</button>
      {open && (
        <div className="backdrop">
          <form className="modal" onSubmit={add}>
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
            <div className="form-grid">
              <label>
                Šifra
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
              <button className="primary">Dodaj lokaciju</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
