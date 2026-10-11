import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const URL = (import.meta.env.VITE_SUPABASE_URL || "").trim(), KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();
const db = createClient(URL || "http://localhost", KEY || "missing");
const CUR = import.meta.env.VITE_CURRENCY || "NGN";
const BANK = import.meta.env.VITE_BANK_DETAILS || "Our bank details will be sent to you right after you order.";
const money = (n) => new Intl.NumberFormat(undefined, { style: "currency", currency: CUR, maximumFractionDigits: 0 }).format(n || 0);
const fail = (e) => (e ? (alert(e.message), true) : false);
const STATUS = ["pending", "confirmed", "shipped", "delivered", "cancelled"];
const when = (t) => new Date(t).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

export default function Root() {
  if (URL && KEY) return <App />;
  return <div className="center"><h1 className="brand" style={{ color: "#1b1f4b" }}>OJEHLC E-CART</h1>
    <p>The shop cannot connect to its database yet. Still missing: {[!URL && "VITE_SUPABASE_URL", !KEY && "VITE_SUPABASE_ANON_KEY"].filter(Boolean).map((n) => <code key={n}> {n} </code>)}</p>
    <p className="muted small">Put them in a file named exactly <code>.env</code> next to package.json (not .env.example or .env.txt), then stop and restart <code>npm run dev</code>.</p></div>;
}

function Auth({ close }) {
  const [up, setUp] = useState(false), [f, setF] = useState({ name: "", email: "", password: "" }), [msg, setMsg] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const go = async () => {
    setMsg("");
    const r = up ? await db.auth.signUp({ email: f.email.trim(), password: f.password, options: { data: { full_name: f.name.trim() } } })
      : await db.auth.signInWithPassword({ email: f.email.trim(), password: f.password });
    if (r.error) return setMsg(r.error.message);
    if (up && !r.data.session) return setMsg("Account created. Confirm your email, then sign in.");
    close();
  };
  return <div className="modal" onClick={close}><div className="sheet" onClick={(e) => e.stopPropagation()}>
    <h2>{up ? "Create your account" : "Sign in"}</h2>
    {up && <input placeholder="Full name" value={f.name} onChange={set("name")} />}
    <input placeholder="Email" type="email" value={f.email} onChange={set("email")} />
    <input placeholder="Password (at least 6 characters)" type="password" value={f.password} onChange={set("password")} onKeyDown={(e) => e.key === "Enter" && go()} />
    <button className="primary" onClick={go}>{up ? "Create account" : "Sign in"}</button>
    <p className="err">{msg}</p>
    <button className="link" onClick={() => setUp(!up)}>{up ? "I already have an account" : "New here? Create an account"}</button>
  </div></div>;
}

function Shop({ q, add }) {
  const [rows, setRows] = useState(null), [cat, setCat] = useState("All");
  useEffect(() => { db.from("products").select("*").eq("active", true).order("created_at", { ascending: false }).then(({ data, error }) => { fail(error); setRows(data || []); }); }, []);
  const cats = ["All", ...new Set((rows || []).map((p) => p.category))];
  const list = (rows || []).filter((p) => (cat === "All" || p.category === cat) && (p.name + " " + p.description).toLowerCase().includes(q.toLowerCase()));
  if (!rows) return <p className="muted pad">Loading products…</p>;
  return <div>
    <div className="chips">{cats.map((c) => <button key={c} className={"chip" + (c === cat ? " on" : "")} onClick={() => setCat(c)}>{c}</button>)}</div>
    {!list.length && <p className="muted pad">{rows.length ? "No products match your search." : "No products yet. The store owner is still stocking up."}</p>}
    <div className="grid">{list.map((p) => <article className="tile" key={p.id}>
      <div className="pic">{p.image_url ? <img src={p.image_url} alt={p.name} loading="lazy" /> : <span>{p.name[0]}</span>}<b className="tag">{money(p.price)}</b></div>
      <h3>{p.name}</h3>
      <p className="muted small">{p.category}{p.stock > 0 && p.stock <= 5 ? ` — only ${p.stock} left` : ""}</p>
      <button className="primary" disabled={p.stock < 1} onClick={() => add(p)}>{p.stock < 1 ? "Sold out" : "Add to cart"}</button>
    </article>)}</div>
  </div>;
}

function Cart({ cart, setCart, close, checkout }) {
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const qty = (id, d) => setCart(cart.map((i) => (i.id === id ? { ...i, qty: Math.max(1, Math.min(i.stock, i.qty + d)) } : i)));
  return <div className="modal right" onClick={close}><aside className="drawer" onClick={(e) => e.stopPropagation()}>
    <div className="row"><h2>Your cart</h2><button className="link" onClick={close}>Close</button></div>
    {!cart.length && <p className="muted">Your cart is empty. Add something you like.</p>}
    {cart.map((i) => <div className="line" key={i.id}><div><b>{i.name}</b><div className="muted small">{money(i.price)} each</div></div>
      <div className="qty"><button onClick={() => qty(i.id, -1)}>−</button><span>{i.qty}</span><button onClick={() => qty(i.id, 1)}>+</button>
        <button className="link" onClick={() => setCart(cart.filter((x) => x.id !== i.id))}>Remove</button></div></div>)}
    {!!cart.length && <><div className="row total"><span>Total</span><b>{money(total)}</b></div><button className="primary" onClick={checkout}>Go to checkout</button></>}
  </aside></div>;
}

function Checkout({ cart, me, done, signIn }) {
  const [f, setF] = useState({ name: me?.full_name || "", phone: me?.phone || "", address: "", note: "" }), [method, setMethod] = useState("pay_on_delivery"), [busy, setBusy] = useState(false), [ok, setOk] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const place = async () => {
    setBusy(true);
    const { data, error } = await db.rpc("place_order", { items: cart.map((i) => ({ id: i.id, qty: i.qty })), cust: f, method });
    setBusy(false);
    if (!fail(error)) setOk({ id: data, method });
  };
  if (ok) return <div className="panel"><h2>Order placed</h2><p>Your order number is <b>{ok.id.slice(0, 8).toUpperCase()}</b>. {ok.method === "bank_transfer" ? <>Pay by bank transfer: <b>{BANK}</b>. We confirm your order as soon as the payment is received.</> : "You pay when your order arrives."}</p><button className="primary" onClick={() => done(true)}>View my orders</button></div>;
  if (!me) return <div className="panel"><h2>Sign in to check out</h2><p className="muted">Your cart is saved. Sign in or create an account to place your order.</p><button className="primary" onClick={signIn}>Sign in</button></div>;
  if (!cart.length) return <div className="panel"><p className="muted">Your cart is empty.</p><button className="primary" onClick={() => done(false)}>Back to shop</button></div>;
  return <div className="panel"><h2>Checkout</h2>
    <input placeholder="Full name" value={f.name} onChange={set("name")} /><input placeholder="Phone number" value={f.phone} onChange={set("phone")} />
    <textarea rows="3" placeholder="Delivery address" value={f.address} onChange={set("address")} /><input placeholder="Note for the seller (optional)" value={f.note} onChange={set("note")} />
    <label className="radio"><input type="radio" checked={method === "pay_on_delivery"} onChange={() => setMethod("pay_on_delivery")} /> Pay on delivery</label>
    <label className="radio"><input type="radio" checked={method === "bank_transfer"} onChange={() => setMethod("bank_transfer")} /> Bank transfer</label>
    <p className="muted">{cart.length} item(s) · prices are confirmed by the store when you order.</p>
    <button className="primary" disabled={busy} onClick={place}>{busy ? "Placing order…" : `Place order · ${money(total)}`}</button></div>;
}

function Orders({ me }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { db.from("orders").select("*,order_items(*)").eq("user_id", me.id).order("created_at", { ascending: false }).then(({ data, error }) => { fail(error); setRows(data || []); }); }, []);
  if (!rows) return <p className="muted pad">Loading…</p>;
  return <div className="panel"><h2>My orders</h2>{!rows.length && <p className="muted">You have not ordered anything yet.</p>}
    {rows.map((o) => <div className="order" key={o.id}><div className="row"><b>#{o.id.slice(0, 8).toUpperCase()}</b><span className={"badge " + o.status}>{o.status}</span></div>
      <div className="muted small">{when(o.created_at)} · {o.payment_method === "bank_transfer" ? "Bank transfer" : "Pay on delivery"} · {o.payment_status}</div>
      {o.order_items.map((i) => <div className="row small" key={i.id}><span>{i.qty} × {i.name}</span><span>{money(i.price * i.qty)}</span></div>)}
      <div className="row total"><span>Total</span><b>{money(o.total)}</b></div></div>)}</div>;
}

function ProductForm({ init, done }) {
  const [f, setF] = useState(init), [file, setFile] = useState(null), [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    if (!f.name.trim() || f.price === "" || +f.price < 0) return alert("Enter a product name and a price.");
    setBusy(true);
    let image_url = f.image_url;
    if (file) {
      if (!file.type.startsWith("image/") || file.size > 2e6) { setBusy(false); return alert("Choose an image smaller than 2 MB."); }
      const path = crypto.randomUUID() + "." + file.name.split(".").pop().toLowerCase();
      const up = await db.storage.from("products").upload(path, file);
      if (up.error) { setBusy(false); return alert(up.error.message); }
      image_url = db.storage.from("products").getPublicUrl(path).data.publicUrl;
    }
    const row = { name: f.name.trim(), description: f.description, price: +f.price, stock: parseInt(f.stock) || 0, category: f.category.trim() || "General", image_url, active: f.active };
    const r = f.id ? await db.from("products").update(row).eq("id", f.id) : await db.from("products").insert(row);
    setBusy(false);
    if (!fail(r.error)) done();
  };
  return <div className="panel"><h3>{f.id ? "Edit product" : "Add product"}</h3>
    <input placeholder="Product name" value={f.name} onChange={set("name")} />
    <div className="two"><input type="number" min="0" placeholder="Price" value={f.price} onChange={set("price")} /><input type="number" min="0" placeholder="Stock" value={f.stock} onChange={set("stock")} /></div>
    <input placeholder="Category e.g. Phones" value={f.category} onChange={set("category")} />
    <textarea rows="2" placeholder="Description" value={f.description} onChange={set("description")} />
    <label className="muted small">Picture (max 2 MB){f.image_url && !file ? " — current picture kept unless you choose a new one" : ""}</label>
    <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0])} />
    <label className="radio"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Visible in the shop</label>
    <button className="primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save product"}</button>
    {f.id && <button className="link" onClick={() => done(true)}>Cancel</button>}</div>;
}

function Admin() {
  const [tab, setTab] = useState("Overview"), [prods, setProds] = useState([]), [orders, setOrders] = useState([]), [edit, setEdit] = useState(null);
  const blank = { name: "", price: "", stock: "", category: "", description: "", image_url: "", active: true };
  const load = async () => {
    const [p, o] = await Promise.all([db.from("products").select("*").order("created_at", { ascending: false }), db.from("orders").select("*,order_items(*)").order("created_at", { ascending: false })]);
    fail(p.error || o.error); setProds(p.data || []); setOrders(o.data || []);
  };
  useEffect(() => { load(); }, []);
  const upd = async (o, st, pay) => { if (!fail((await db.rpc("admin_update_order", { oid: o.id, st, pay })).error)) load(); };
  const del = async (p) => { if (window.confirm(`Delete ${p.name}? Past orders keep its name.`) && !fail((await db.from("products").delete().eq("id", p.id)).error)) load(); };
  const live = orders.filter((o) => o.status !== "cancelled");
  return <div><div className="chips">{["Overview", "Products", "Orders"].map((t) => <button key={t} className={"chip" + (t === tab ? " on" : "")} onClick={() => { setTab(t); setEdit(null); }}>{t}</button>)}</div>
    {tab === "Overview" && <div className="stats">
      <div><b>{money(live.filter((o) => o.payment_status === "paid").reduce((s, o) => s + +o.total, 0))}</b><span>Paid sales</span></div>
      <div><b>{orders.filter((o) => o.status === "pending").length}</b><span>Orders waiting</span></div>
      <div><b>{live.length}</b><span>Orders (not cancelled)</span></div>
      <div><b>{prods.filter((p) => p.stock <= 5).length}</b><span>Products low or out of stock</span></div></div>}
    {tab === "Products" && <>
      {edit ? <ProductForm key={edit.id || "new"} init={edit} done={(cancel) => { setEdit(null); if (cancel !== true) load(); }} /> : <button className="primary" onClick={() => setEdit(blank)}>Add product</button>}
      <div className="panel"><div className="scroll"><table><thead><tr><th>Product</th><th>Price</th><th>Stock</th><th>Shop</th><th></th></tr></thead><tbody>
        {prods.map((p) => <tr key={p.id}><td>{p.name}<div className="muted small">{p.category}</div></td><td>{money(p.price)}</td><td className={p.stock <= 5 ? "err" : ""}>{p.stock}</td><td>{p.active ? "Visible" : "Hidden"}</td>
          <td className="nowrap"><button className="link" onClick={() => setEdit(p)}>Edit</button><button className="link" onClick={() => del(p)}>Delete</button></td></tr>)}</tbody></table></div></div></>}
    {tab === "Orders" && <div className="panel">{!orders.length && <p className="muted">No orders yet.</p>}
      {orders.map((o) => <div className="order" key={o.id}>
        <div className="row"><b>#{o.id.slice(0, 8).toUpperCase()} · {o.name}</b><b>{money(o.total)}</b></div>
        <div className="muted small">{when(o.created_at)} · {o.phone} · {o.address}{o.note ? ` · Note: ${o.note}` : ""}</div>
        {o.order_items.map((i) => <div className="small" key={i.id}>{i.qty} × {i.name}</div>)}
        <div className="two">
          <select value={o.status} disabled={o.status === "cancelled"} onChange={(e) => upd(o, e.target.value, o.payment_status)}>{STATUS.map((s) => <option key={s}>{s}</option>)}</select>
          <select value={o.payment_status} onChange={(e) => upd(o, o.status, e.target.value)}><option value="unpaid">unpaid ({o.payment_method === "bank_transfer" ? "bank transfer" : "on delivery"})</option><option value="paid">paid</option></select></div>
      </div>)}</div>}
  </div>;
}

function App() {
  const [me, setMe] = useState(null), [view, setView] = useState("shop"), [auth, setAuth] = useState(false), [cartOpen, setCartOpen] = useState(false), [q, setQ] = useState("");
  const [cart, setCart] = useState(() => { try { return JSON.parse(localStorage.getItem("ojehlc-cart")) || []; } catch { return []; } });
  useEffect(() => { try { localStorage.setItem("ojehlc-cart", JSON.stringify(cart)); } catch {} }, [cart]);
  const loadMe = async (s) => { if (!s) return setMe(null); const { data } = await db.from("profiles").select("*").eq("id", s.user.id).single(); setMe(data); };
  useEffect(() => {
    db.auth.getSession().then(({ data }) => loadMe(data.session));
    const { data: l } = db.auth.onAuthStateChange((_e, s) => setTimeout(() => loadMe(s), 0));
    return () => l.subscription.unsubscribe();
  }, []);
  const add = (p) => setCart((c) => { const x = c.find((i) => i.id === p.id); return x ? c.map((i) => (i.id === p.id ? { ...i, qty: Math.min(p.stock, i.qty + 1) } : i)) : [...c, { id: p.id, name: p.name, price: +p.price, stock: p.stock, qty: 1 }]; });
  const count = cart.reduce((s, i) => s + i.qty, 0);
  const go = (v) => { setView(v); window.scrollTo(0, 0); };
  return <>
    <header><button className="brand" onClick={() => go("shop")}>OJEHLC E-CART</button>
      <input className="search" placeholder="Search products" value={q} onChange={(e) => { setQ(e.target.value); setView("shop"); }} />
      <nav>{me?.role === "admin" && <button className="link" onClick={() => go("admin")}>Admin</button>}
        {me ? <><button className="link" onClick={() => go("orders")}>My orders</button><button className="link" onClick={() => { db.auth.signOut(); go("shop"); }}>Sign out</button></> : <button className="link" onClick={() => setAuth(true)}>Sign in</button>}
        <button className="cartbtn" onClick={() => setCartOpen(true)}>Cart {count > 0 && <b>{count}</b>}</button></nav></header>
    <main>
      {view === "shop" && <><section className="hero"><h1>Everything you need, delivered to your door.</h1><p>Browse, add to cart, and pay on delivery or by bank transfer.</p></section><Shop q={q} add={add} /></>}
      {view === "checkout" && <Checkout cart={cart} me={me} signIn={() => setAuth(true)} done={(toOrders) => { if (toOrders) setCart([]); go(toOrders ? "orders" : "shop"); }} />}
      {view === "orders" && me && <Orders me={me} />}
      {view === "admin" && me?.role === "admin" && <Admin />}
    </main>
    <footer>Built by {new Date().getFullYear()} REXX HUB</footer>
    {cartOpen && <Cart cart={cart} setCart={setCart} close={() => setCartOpen(false)} checkout={() => { setCartOpen(false); go("checkout"); }} />}
    {auth && <Auth close={() => setAuth(false)} />}
  </>;
}
