import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight, BadgeDollarSign, Boxes, CalendarDays,
  Check, CheckCircle2, ChevronDown, CircleUserRound, ClipboardList,
  CreditCard, Eye, EyeOff, Home, LogOut, Menu, Package, Plus, Receipt,
  RotateCcw, Save, ShoppingBasket, Sparkles, Truck, Users, X
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
const productImage = `${import.meta.env.BASE_URL}maxpoder-producto.png`;
const wallpaperStyle = { "--system-watermark": `url("${productImage}")` };

const money = (value) => new Intl.NumberFormat("es-GT", {
  style: "currency", currency: "GTQ", minimumFractionDigits: 2
}).format(Number(value) || 0);

const dateOnly = (value = new Date()) => {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const shortDate = (value) => {
  if (!value) return "Sin fecha";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("es", { dateStyle: "medium" }).format(date);
};

const dateTime = (value) => value
  ? new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : "";

const navItems = [
  { id: "inicio", label: "Inicio", icon: Home },
  { id: "catalogo", label: "Catálogo", icon: Boxes },
  { id: "pedidos", label: "Pedidos", icon: ClipboardList },
  { id: "cobros", label: "Cobros", icon: CreditCard },
  { id: "informe", label: "Informe diario", icon: Receipt }
];

const emptyData = { clients: [], products: [], orders: [], payments: [] };

function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState("login");
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState("inicio");
  const [data, setData] = useState(emptyData);
  const [dataLoading, setDataLoading] = useState(false);
  const [notice, setNotice] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);
  const [selectedClient, setSelectedClient] = useState(null);
  const [reportDate, setReportDate] = useState(dateOnly());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showIntro, setShowIntro] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowIntro(false), 2900);
    return () => window.clearTimeout(timer);
  }, []);

  const flash = useCallback((message, type = "success") => {
    setNotice({ message, type });
    window.setTimeout(() => setNotice(null), 4200);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return undefined;
    }
    let active = true;
    supabase.auth.getSession().then(({ data: sessionData, error }) => {
      if (!active) return;
      if (error) setAuthError(error.message);
      setUser(sessionData.session?.user ?? null);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const loadData = useCallback(async () => {
    if (!supabase || !user) return;
    setDataLoading(true);
    const [clientsResult, productsResult, ordersResult, paymentsResult] = await Promise.all([
      supabase.from("clients").select("*").order("created_at", { ascending: false }),
      supabase.from("products").select("*").eq("active", true).order("name"),
      supabase.from("orders")
        .select("*, client:clients(name), order_items(*)")
        .order("created_at", { ascending: false }),
      supabase.from("payments").select("*").order("created_at", { ascending: false })
    ]);
    const error = clientsResult.error || productsResult.error || ordersResult.error || paymentsResult.error;
    if (error) {
      flash(`No se pudieron cargar los datos: ${error.message}`, "error");
      setDataLoading(false);
      return;
    }
    setData({
      clients: clientsResult.data || [],
      products: productsResult.data || [],
      orders: (ordersResult.data || []).map((order) => ({
        ...order,
        items: (order.order_items || []).map((item) => ({
          ...item,
          unitPrice: Number(item.unit_price),
          quantity: Number(item.quantity)
        }))
      })),
      payments: paymentsResult.data || []
    });
    setDataLoading(false);
  }, [flash, user]);

  useEffect(() => { void loadData(); }, [loadData]);

  const clientBalance = useCallback((clientId) => {
    const orderTotal = data.orders
      .filter((order) => order.client_id === clientId)
      .reduce((sum, order) => sum + Number(order.total), 0);
    const paid = data.payments
      .filter((payment) => payment.client_id === clientId)
      .reduce((sum, payment) => sum + Number(payment.amount), 0);
    return Math.max(0, Math.round((orderTotal - paid) * 100) / 100);
  }, [data.orders, data.payments]);

  const todayOrders = useMemo(
    () => data.orders.filter((order) => order.order_date === dateOnly()),
    [data.orders]
  );
  const totalOutstanding = useMemo(
    () => data.clients.reduce((sum, client) => sum + clientBalance(client.id), 0),
    [clientBalance, data.clients]
  );
  const pendingDeliveries = useMemo(
    () => data.orders.filter((order) => !order.delivered_at).length,
    [data.orders]
  );

  const submitAuth = async (event) => {
    event.preventDefault();
    setAuthError("");
    setAuthMessage("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim().toLowerCase();
    const password = String(form.get("password") || "");
    try {
      if (!supabase) throw new Error("Falta configurar Supabase. Sigue los pasos de README.md.");
      if (authMode === "register") {
        if (password !== form.get("confirmPassword")) throw new Error("Las contraseñas no coinciden.");
        const { data: result, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (!result.session) {
          setAuthMessage("Cuenta creada. Revisa tu correo para confirmar la dirección e iniciar sesión.");
        } else {
          setAuthMessage("Tu cuenta está lista. Bienvenido.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error) {
      setAuthError(error.message || "No fue posible completar el acceso.");
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) flash(`No se pudo cerrar la sesión: ${error.message}`, "error");
    else {
      setData(emptyData);
      setPage("inicio");
    }
  };

  const changePage = (nextPage) => {
    setPage(nextPage);
    setMobileMenuOpen(false);
    setNotice(null);
    setEditingProduct(null);
  };

  const saveClient = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const name = String(form.get("name") || "").trim();
    if (!name) return flash("Escribe el nombre del cliente.", "error");
    const { error } = await supabase.from("clients").insert({
      user_id: user.id,
      name,
      phone: String(form.get("phone") || "").trim() || null,
      notes: String(form.get("notes") || "").trim() || null
    });
    if (error) return flash(`No se pudo guardar el cliente: ${error.message}`, "error");
    flash("Cliente guardado con su fecha de registro.");
    formElement.reset();
    await loadData();
  };

  const saveProduct = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const price = Number(form.get("price"));
    if (!name || !Number.isFinite(price) || price < 0) return flash("Ingresa nombre y precio válidos.", "error");
    const request = editingProduct
      ? supabase.from("products").update({ name, unit_price: price }).eq("id", editingProduct.id)
      : supabase.from("products").insert({ user_id: user.id, name, unit_price: price });
    const { error } = await request;
    if (error) return flash(`No se pudo guardar el producto: ${error.message}`, "error");
    flash(editingProduct ? "Producto actualizado; los pedidos anteriores conservan su precio." : "Producto agregado.");
    setEditingProduct(null);
    await loadData();
  };

  const saveOrder = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const lines = [...event.currentTarget.querySelectorAll(".order-line")].map((line) => ({
      product_id: line.querySelector("[name=product_id]").value,
      quantity: Number(line.querySelector("[name=quantity]").value)
    }));
    if (lines.some((line) => !line.product_id || !Number.isInteger(line.quantity) || line.quantity < 1)) {
      return flash("Selecciona productos y cantidades válidas de cajas.", "error");
    }
    if (new Set(lines.map((line) => line.product_id)).size !== lines.length) {
      return flash("No repitas un producto en el mismo pedido.", "error");
    }
    const { error } = await supabase.rpc("create_order", {
      p_client_id: form.get("client_id"),
      p_delivery_date: form.get("delivery_date"),
      p_order_date: dateOnly(),
      p_observations: String(form.get("observations") || "").trim(),
      p_items: lines
    });
    if (error) return flash(`No se pudo guardar el pedido: ${error.message}`, "error");
    flash("Pedido guardado y agregado al saldo del cliente.");
    await loadData();
  };

  const savePayment = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const { error } = await supabase.rpc("record_payment", {
      p_client_id: form.get("client_id"),
      p_amount: Number(form.get("amount")),
      p_kind: form.get("kind")
    });
    if (error) return flash(`No se pudo registrar el cobro: ${error.message}`, "error");
    setSelectedClient(null);
    flash("Pago registrado y saldo actualizado.");
    await loadData();
  };

  const markDelivered = async (orderId) => {
    const { error } = await supabase.rpc("mark_order_delivered", { p_order_id: orderId });
    if (error) return flash(`No se pudo actualizar la entrega: ${error.message}`, "error");
    flash("Pedido marcado como entregado.");
    await loadData();
  };

  if (authLoading) {
    return <><div className="screen-loader"><span className="loader" />Cargando...</div>{showIntro && <IntroSplash />}</>;
  }
  if (!user) {
    return (
      <>
        <AuthScreen
          mode={authMode}
          onModeChange={(mode) => { setAuthMode(mode); setAuthError(""); setAuthMessage(""); }}
          onSubmit={submitAuth}
          error={authError}
          message={authMessage}
          busy={busy}
          configured={Boolean(supabase)}
          style={wallpaperStyle}
        />
        {showIntro && <IntroSplash />}
      </>
    );
  }

  const selectedClientData = data.clients.find((client) => client.id === selectedClient);

  return (
    <>
    <div className="app-layout" style={wallpaperStyle}>
      <aside className={`sidebar ${mobileMenuOpen ? "sidebar-open" : ""}`}>
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); changePage("inicio"); }}>
          <span className="brand-icon"><ShoppingBasket size={19} /></span>
          <span>Punto<span className="brand-light"> de Pedido</span></span>
        </a>
        <div className="sidebar-label">MENÚ PRINCIPAL</div>
        <nav className="side-nav" aria-label="Navegación principal">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button type="button" className={`side-link ${page === id ? "side-link-active" : ""}`} onClick={() => changePage(id)} key={id}>
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="profile-chip"><span className="avatar"><CircleUserRound size={19} /></span><span className="profile-copy"><strong>{user.email?.split("@")[0]}</strong><small>Cuenta activa</small></span><ChevronDown size={15} /></div>
          <button type="button" className="side-link logout-link" onClick={signOut}><LogOut size={18} /><span>Cerrar sesión</span></button>
        </div>
      </aside>
      {mobileMenuOpen && <button className="sidebar-scrim" aria-label="Cerrar menú" onClick={() => setMobileMenuOpen(false)} />}
      <main className="main-area">
        <header className="mobile-header">
          <button className="icon-button mobile-menu-button" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Abrir menú"><Menu size={21} /></button>
          <span className="brand-icon"><ShoppingBasket size={18} /></span>
          <strong>Punto de Pedido</strong>
          <button className="icon-button mobile-logout" onClick={signOut} aria-label="Cerrar sesión"><LogOut size={18} /></button>
        </header>
        <div className="main-content">
          <div className="page-topline">
            <div className="breadcrumb">Negocio <span>/</span> {navItems.find((item) => item.id === page)?.label}</div>
            <div className="today-pill"><CalendarDays size={15} />{shortDate(dateOnly())}</div>
          </div>
          {notice && <div className={`toast toast-${notice.type}`} role="status">{notice.type === "error" ? <X size={17} /> : <CheckCircle2 size={17} />}{notice.message}</div>}
          {dataLoading && <div className="loading-bar" />}
          {page === "inicio" && (
            <Dashboard
              orders={data.orders}
              pending={pendingDeliveries}
              outstanding={totalOutstanding}
              sales={todayOrders.reduce((sum, order) => sum + Number(order.total), 0)}
              orderCount={todayOrders.length}
              onNavigate={changePage}
              onDeliver={markDelivered}
              clients={data.clients}
            />
          )}
          {page === "catalogo" && (
            <CatalogPage
              clients={data.clients}
              products={data.products}
              balance={clientBalance}
              editingProduct={editingProduct}
              onSaveClient={saveClient}
              onSaveProduct={saveProduct}
              onEditProduct={setEditingProduct}
              onCancelEdit={() => setEditingProduct(null)}
              onOpenPayments={(id) => { setSelectedClient(id); changePage("cobros"); }}
            />
          )}
          {page === "pedidos" && (
            <OrdersPage
              clients={data.clients}
              products={data.products}
              orders={data.orders}
              balance={clientBalance}
              onSave={saveOrder}
              onDeliver={markDelivered}
            />
          )}
          {page === "cobros" && (
            <PaymentsPage
              clients={data.clients}
              payments={data.payments}
              orders={data.orders}
              balance={clientBalance}
              selectedClient={selectedClientData}
              onSelect={setSelectedClient}
              onSave={savePayment}
            />
          )}
          {page === "informe" && (
            <ReportPage orders={data.orders} reportDate={reportDate} onDateChange={setReportDate} />
          )}
        </div>
      </main>
    </div>
    {showIntro && <IntroSplash />}
    </>
  );
}

function IntroSplash() {
  return (
    <div className="intro-splash" role="status" aria-label="Bienvenido a Punto de Pedido">
      <img className="intro-backdrop" src={productImage} alt="" />
      <div className="intro-shade" />
      <img className="intro-product" src={productImage} alt="Max Poder Total 5 en 1" />
      <div className="intro-copy">
        <span className="intro-brand-icon"><ShoppingBasket size={19} /></span>
        <span><strong>Punto de Pedido</strong><small>Todo tu negocio, en orden</small></span>
      </div>
    </div>
  );
}

function AuthScreen({ mode, onModeChange, onSubmit, error, message, busy, configured, style }) {
  const [showPassword, setShowPassword] = useState(false);
  const isRegister = mode === "register";
  return (
    <main className="auth-page" style={style}>
      <div className="auth-brand"><span className="brand-icon"><ShoppingBasket size={20} /></span><span>Punto<span className="brand-light"> de Pedido</span></span></div>
      <div className="auth-layout">
        <section className="auth-story">
          <span className="auth-kicker"><Sparkles size={14} /> CONTROL DE TU NEGOCIO, EN UN SOLO LUGAR</span>
          <h1>Tu negocio se mueve.<br /><span>Tu control también.</span></h1>
          <p>Organiza pedidos, entregas y cobros sin perder de vista cada caja y cada cliente.</p>
          <div className="auth-product-note"><span><Package size={15} /></span><strong>Max Poder Total · 5 en 1</strong><small>Pedidos y catálogo en un solo lugar</small></div>
          <div className="trust-line"><span><Check size={14} /> Seguimiento de entregas</span><span><Check size={14} /> Saldos al día</span></div>
        </section>
        <section className="auth-card">
          <span className="auth-card-eyebrow">{isRegister ? "EMPIEZA AQUÍ" : "QUÉ BUENO VERTE"}</span>
          <h2>{isRegister ? "Crea tu cuenta" : "Inicia sesión"}</h2>
          <p>{isRegister ? "Registra tu correo y crea una contraseña segura." : "Ingresa a tu cuenta para continuar."}</p>
          {!configured && <div className="alert alert-error"><strong>Falta conectar Supabase</strong><br />Copia .env.example como .env.local y agrega la URL y la clave pública de tu proyecto.</div>}
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          {message && <div className="alert alert-success" role="status">{message}</div>}
          <form onSubmit={onSubmit}>
            <div className="form-field"><label htmlFor="auth-email">Correo electrónico</label><input id="auth-email" name="email" type="email" autoComplete="email" required placeholder="tu@negocio.com" disabled={!configured} /></div>
            <div className="form-field"><label htmlFor="auth-password">Contraseña</label><div className="password-wrap"><input id="auth-password" name="password" type={showPassword ? "text" : "password"} autoComplete={isRegister ? "new-password" : "current-password"} minLength={8} required placeholder="Mínimo 8 caracteres" disabled={!configured} /><button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></div>
            {isRegister && <div className="form-field"><label htmlFor="auth-confirm">Confirmar contraseña</label><input id="auth-confirm" name="confirmPassword" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} required placeholder="Escríbela de nuevo" disabled={!configured} /></div>}
            <button className="button button-primary auth-submit" type="submit" disabled={busy || !configured}>{busy ? <><span className="button-spinner" />Un momento...</> : isRegister ? "Crear cuenta" : "Entrar a mi cuenta"}<ArrowRight size={17} /></button>
          </form>
          <div className="auth-switch">{isRegister ? "¿Ya tienes una cuenta?" : "¿Primera vez por aquí?"}<button type="button" onClick={() => onModeChange(isRegister ? "login" : "register")}>{isRegister ? "Inicia sesión" : "Crea tu usuario"}</button></div>
          <div className="auth-security"><CheckCircle2 size={15} /> Inicio de sesión protegido por Supabase Auth</div>
        </section>
      </div>
      <footer className="auth-footer">Punto de Pedido <span>·</span> Control simple para crecer con orden</footer>
    </main>
  );
}

function Dashboard({ orders, pending, outstanding, sales, orderCount, onNavigate, onDeliver, clients }) {
  const recentOrders = orders.slice(0, 4);
  return (
    <>
      <section className="welcome-hero">
        <div className="welcome-copy">
          <span className="section-eyebrow">TU RESUMEN DE HOY</span>
          <h1>Un día más,<br /><span>todo bajo control.</span></h1>
          <p>Revisa pedidos, entregas y cuentas pendientes desde aquí.</p>
          <button className="button button-light" onClick={() => onNavigate("pedidos")}><Plus size={17} /> Crear un pedido</button>
        </div>
        <div className="hero-watermark-wrap" aria-hidden="true">
          <div className="hero-watermark-halo" />
          <img src={productImage} className="hero-watermark" alt="" />
          <span className="hero-sparkle hero-sparkle-one">✦</span><span className="hero-sparkle hero-sparkle-two">✧</span>
          <span className="hero-badge"><Sparkles size={13} /> Max Poder · 5 en 1</span>
        </div>
        <div className="hero-orb orb-one" /><div className="hero-orb orb-two" />
      </section>
      <section className="stat-grid">
        <StatCard icon={Truck} label="Por entregar" value={pending} note="Pedidos pendientes" tone="blue" />
        <StatCard icon={BadgeDollarSign} label="Por cobrar" value={money(outstanding)} note="Saldo de tus clientes" tone="orange" />
        <StatCard icon={RotateCcw} label="Ventas de hoy" value={money(sales)} note={`${orderCount} pedido${orderCount === 1 ? "" : "s"} registrado${orderCount === 1 ? "" : "s"}`} tone="green" />
      </section>
      <section className="quick-actions">
        <div className="section-title-row"><div><span className="section-eyebrow">ACCESOS DIRECTOS</span><h2>¿Qué necesitas hacer?</h2></div></div>
        <div className="quick-grid">
          <QuickCard icon={Users} title="Agregar cliente" description="Registra a una persona o negocio." onClick={() => onNavigate("catalogo")} />
          <QuickCard icon={Package} title="Agregar producto" description="Actualiza tu catálogo y precios." onClick={() => onNavigate("catalogo")} />
          <QuickCard icon={ClipboardList} title="Tomar pedido" description="Agrega productos, cajas y entrega." onClick={() => onNavigate("pedidos")} />
        </div>
      </section>
      <section className="recent-section">
        <div className="section-title-row"><div><span className="section-eyebrow">ACTIVIDAD RECIENTE</span><h2>Últimos pedidos</h2></div><button className="text-button" onClick={() => onNavigate("pedidos")}>Ver todos <ArrowRight size={15} /></button></div>
        <OrderList orders={recentOrders} clients={clients} onDeliver={onDeliver} compact />
      </section>
    </>
  );
}

function StatCard({ icon: Icon, label, value, note, tone }) {
  return <article className="stat-card"><span className={`stat-icon stat-${tone}`}><Icon size={19} /></span><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong><span className="stat-note">{note}</span></article>;
}

function QuickCard({ icon: Icon, title, description, onClick }) {
  return <button className="quick-card" type="button" onClick={onClick}><span className="quick-icon"><Icon size={18} /></span><span className="quick-copy"><strong>{title}</strong><small>{description}</small></span><ArrowRight className="quick-arrow" size={16} /></button>;
}

function PageHeading({ eyebrow, title, subtitle, action }) {
  return <div className="page-heading"><div><span className="section-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>;
}

function CatalogPage({ clients, products, balance, editingProduct, onSaveClient, onSaveProduct, onEditProduct, onCancelEdit, onOpenPayments }) {
  const [tab, setTab] = useState("clientes");
  return (
    <>
      <PageHeading eyebrow="CLIENTES Y PRODUCTOS" title="Tu catálogo" subtitle="Administra las personas y productos que forman parte de tus pedidos." />
      <div className="catalog-tabs" role="tablist">
        <button className={tab === "clientes" ? "catalog-tab active" : "catalog-tab"} onClick={() => setTab("clientes")} role="tab"><Users size={16} /> Clientes <span>{clients.length}</span></button>
        <button className={tab === "productos" ? "catalog-tab active" : "catalog-tab"} onClick={() => setTab("productos")} role="tab"><Package size={16} /> Productos <span>{products.length}</span></button>
      </div>
      {tab === "clientes" ? (
        <div className="catalog-layout">
          <section className="surface-card form-card">
            <CardTitle icon={Plus} title="Agregar cliente" subtitle="La fecha de registro se guarda automáticamente." />
            <form onSubmit={onSaveClient} className="stack-form">
              <Field label="Nombre del cliente" name="name" required placeholder="Nombre o negocio" />
              <Field label="Teléfono (opcional)" name="phone" placeholder="Número de contacto" />
              <Field label="Notas (opcional)" name="notes" placeholder="Dirección u otra información" />
              <button className="button button-primary" type="submit"><Save size={16} /> Guardar cliente</button>
            </form>
          </section>
          <section className="surface-card list-card"><CardTitle icon={Users} title="Clientes registrados" subtitle="Consulta sus fechas y saldos." />
            {clients.length ? <div className="record-list">{clients.map((client) => <ClientRow key={client.id} client={client} due={balance(client.id)} onPayments={() => onOpenPayments(client.id)} />)}</div> : <EmptyState icon={Users} title="Aún no hay clientes" text="Agrega tu primer cliente usando el formulario." />}
          </section>
        </div>
      ) : (
        <div className="catalog-layout">
          <section className="surface-card form-card"><CardTitle icon={Plus} title={editingProduct ? "Editar producto" : "Agregar producto"} subtitle="El precio actualizado solo aplica a pedidos futuros." />
            <form onSubmit={onSaveProduct} className="stack-form" key={editingProduct?.id || "new-product"}>
              <Field label="Nombre del producto" name="name" required placeholder="Ej. Jabón en caja" defaultValue={editingProduct?.name || ""} />
              <Field label="Precio por caja" name="price" type="number" min="0" step="0.01" required placeholder="0.00" defaultValue={editingProduct?.unit_price ?? ""} />
              <div className="form-button-row"><button className="button button-primary" type="submit"><Save size={16} /> {editingProduct ? "Guardar cambios" : "Guardar producto"}</button>{editingProduct && <button className="button button-outline" type="button" onClick={onCancelEdit}>Cancelar</button>}</div>
            </form>
          </section>
          <section className="surface-card list-card"><CardTitle icon={Package} title="Productos registrados" subtitle="Precios por caja del catálogo." />
            {products.length ? <div className="record-list">{products.map((product) => <article className="product-row" key={product.id}><span className="record-icon product-record-icon"><Package size={17} /></span><div className="record-main"><strong>{product.name}</strong><small>Precio por caja</small></div><div className="product-price">{money(product.unit_price)}</div><button className="button button-outline button-small" onClick={() => onEditProduct(product)}>Editar</button></article>)}</div> : <EmptyState icon={Package} title="Tu catálogo está vacío" text="Agrega productos con su precio por caja." />}
          </section>
        </div>
      )}
    </>
  );
}

function ClientRow({ client, due, onPayments }) {
  return <article className="client-row"><span className="record-icon client-record-icon"><CircleUserRound size={18} /></span><div className="record-main"><strong>{client.name}</strong><small>{client.phone || "Sin teléfono"} · Alta {shortDate(client.created_at)}</small></div><span className={`balance-tag ${due > 0 ? "balance-due" : "balance-clear"}`}>{due > 0 ? money(due) : "Al día"}</span><button className="button button-outline button-small" onClick={onPayments}>Ver saldo</button></article>;
}

function OrdersPage({ clients, products, orders, balance, onSave, onDeliver }) {
  const [lines, setLines] = useState([{ key: 1 }]);
  const estimate = (line) => {
    const product = products.find((item) => item.id === line.product_id);
    return product ? Number(product.unit_price) * Number(line.quantity || 0) : 0;
  };
  const estimatedTotal = lines.reduce((sum, line) => sum + estimate(line), 0);
  const updateLine = (key, field, value) => setLines((items) => items.map((item) => item.key === key ? { ...item, [field]: value } : item));
  const addLine = () => setLines((items) => [...items, { key: Date.now() + Math.random() }]);
  const removeLine = (key) => setLines((items) => items.length > 1 ? items.filter((item) => item.key !== key) : items);
  return (
    <>
      <PageHeading eyebrow="VENTAS Y ENTREGAS" title="Tomar pedidos" subtitle="Agrega las cajas, define una entrega y guarda el total a la cuenta del cliente." />
      {(!clients.length || !products.length) && <div className="alert alert-info"><Sparkles size={17} /><span>Para tomar pedidos necesitas al menos un cliente y un producto en tu catálogo.</span></div>}
      <section className="surface-card order-form-card"><CardTitle icon={ClipboardList} title="Nuevo pedido" subtitle="El precio de cada producto se guarda como una copia en este pedido." />
        <form onSubmit={onSave} className="stack-form">
          <div className="form-grid">
            <div className="form-field"><label htmlFor="order-client">Cliente</label><select id="order-client" name="client_id" required defaultValue=""><option value="" disabled>Selecciona un cliente</option>{clients.map((client) => <option value={client.id} key={client.id}>{client.name}</option>)}</select></div>
            <Field label="Fecha de entrega" name="delivery_date" type="date" required defaultValue={dateOnly()} />
          </div>
          <div className="order-items-heading"><div><strong>Productos y cajas</strong><small>Elige una cantidad de cajas por producto.</small></div><button type="button" className="button button-outline button-small" onClick={addLine}><Plus size={15} /> Agregar producto</button></div>
          <div className="order-lines">{lines.map((line, index) => <div className="order-line" key={line.key}>
            <div className="form-field"><label htmlFor={`line-product-${line.key}`}>Producto {index + 1}</label><select id={`line-product-${line.key}`} name="product_id" required value={line.product_id || ""} onChange={(event) => updateLine(line.key, "product_id", event.target.value)}><option value="" disabled>Selecciona producto</option>{products.map((product) => <option value={product.id} key={product.id}>{product.name} · {money(product.unit_price)} / caja</option>)}</select></div>
            <div className="form-field"><label htmlFor={`line-quantity-${line.key}`}>Cajas</label><input id={`line-quantity-${line.key}`} name="quantity" type="number" min="1" step="1" required value={line.quantity || ""} placeholder="0" onChange={(event) => updateLine(line.key, "quantity", event.target.value)} /></div>
            <div className="line-total">{money(estimate(line))}</div>
            <button className="icon-button remove-line" type="button" disabled={lines.length === 1} aria-label="Quitar producto" onClick={() => removeLine(line.key)}><X size={17} /></button>
          </div>)}</div>
          <Field label="Observaciones" name="observations" as="textarea" placeholder="Detalles para preparar o entregar el pedido" />
          <div className="order-submit-row"><span>Total del pedido <strong>{money(estimatedTotal)}</strong></span><button className="button button-primary" type="submit" disabled={!clients.length || !products.length}><Check size={16} /> Guardar pedido</button></div>
        </form>
      </section>
      <section className="list-section"><SectionTitle eyebrow="SEGUIMIENTO" title="Pedidos registrados" /><OrderList orders={orders} clients={clients} balance={balance} onDeliver={onDeliver} /></section>
    </>
  );
}

function OrderList({ orders, clients, balance, onDeliver, compact = false }) {
  if (!orders.length) return <EmptyState icon={ClipboardList} title="Aún no hay pedidos" text="Cuando registres un pedido, aparecerá aquí." />;
  const shown = compact ? orders.slice(0, 4) : orders;
  return <div className="record-list">{shown.map((order) => {
    const client = clients.find((item) => item.id === order.client_id);
    const due = balance ? balance(order.client_id) : 0;
    const description = order.items.map((item) => `${item.quantity} caja${Number(item.quantity) === 1 ? "" : "s"} de ${item.product_name}`).join(", ");
    return <article className="order-card" key={order.id}><div className="order-card-main"><span className="record-icon order-record-icon"><ClipboardList size={17} /></span><div className="record-main"><strong>{client?.name || order.client?.name || "Cliente"}</strong><small>{description}</small><small>Entrega {shortDate(order.delivery_date)} · Pedido {dateTime(order.created_at)}</small>{order.observations && <small className="order-observation">Nota: {order.observations}</small>}</div></div><div className="order-card-side"><strong className="order-amount">{money(order.total)}</strong><span className={`status-tag ${order.delivered_at ? "status-done" : "status-pending"}`}>{order.delivered_at ? "Entregado" : "Por entregar"}</span>{due > 0 && <span className="small-balance">Saldo cliente {money(due)}</span>}{!compact && !order.delivered_at && <button className="button button-outline button-small" onClick={() => onDeliver(order.id)}><Check size={14} /> Entregado</button>}</div></article>;
  })}</div>;
}

function PaymentsPage({ clients, payments, orders, balance, selectedClient, onSelect, onSave }) {
  const [kind, setKind] = useState("partial");
  const currentBalance = selectedClient ? balance(selectedClient.id) : 0;
  const clientPayments = selectedClient ? payments.filter((payment) => payment.client_id === selectedClient.id) : [];
  const clientOrders = selectedClient ? orders.filter((order) => order.client_id === selectedClient.id) : [];
  return (
    <>
      <PageHeading eyebrow="CUENTAS POR COBRAR" title="Cobros y abonos" subtitle="El saldo se calcula con los pedidos y pagos registrados para cada cliente." />
      <section className="surface-card list-card"><CardTitle icon={Users} title="Todos los clientes" subtitle="Elige un cliente para revisar o actualizar su saldo." />
        {clients.length ? <div className="record-list">{clients.map((client) => <article className={`payment-client ${selectedClient?.id === client.id ? "payment-client-selected" : ""}`} key={client.id}><span className="record-icon client-record-icon"><CircleUserRound size={18} /></span><div className="record-main"><strong>{client.name}</strong><small>{client.phone || "Cliente registrado"}</small></div><strong className={balance(client.id) > 0 ? "due-amount" : "clear-amount"}>{money(balance(client.id))}</strong><button className="button button-outline button-small" onClick={() => onSelect(client.id)}>{selectedClient?.id === client.id ? "Seleccionado" : "Elegir"}</button></article>)}</div> : <EmptyState icon={Users} title="No hay clientes registrados" text="Agrega clientes en tu catálogo antes de realizar cobros." />}
      </section>
      {selectedClient && <div className="payments-detail">
        <section className="surface-card payment-action-card"><CardTitle icon={CreditCard} title={`Cuenta de ${selectedClient.name}`} subtitle="Registra un abono o liquida el saldo pendiente." />
          <div className="balance-banner"><div><span>SALDO PENDIENTE</span><strong>{money(currentBalance)}</strong></div><span className="balance-banner-icon"><BadgeDollarSign size={23} /></span></div>
          {currentBalance > 0 ? <form onSubmit={onSave} className="stack-form payment-form">
            <div className="form-field"><label htmlFor="payment-kind">Tipo de cobro</label><select id="payment-kind" name="kind" value={kind} onChange={(event) => setKind(event.target.value)}><option value="partial">Abono parcial</option><option value="full">Liquidar todo el saldo</option></select></div>
            <div className="form-field"><label htmlFor="payment-amount">Monto a recibir</label><input id="payment-amount" name="amount" type="number" min="0.01" max={currentBalance} step="0.01" required value={kind === "full" ? currentBalance.toFixed(2) : undefined} key={`${selectedClient.id}-${kind}-${currentBalance}`} placeholder="0.00" readOnly={kind === "full"} /><input type="hidden" name="client_id" value={selectedClient.id} /></div>
            <button className="button button-primary" type="submit"><CreditCard size={16} /> {kind === "full" ? "Confirmar liquidación" : "Guardar abono"}</button>
          </form> : <div className="paid-message"><CheckCircle2 size={18} /> Esta cuenta está al día. No hay saldo pendiente.</div>}
        </section>
        <section className="surface-card list-card"><CardTitle icon={Receipt} title="Movimientos" subtitle="Historial de pedidos y pagos." />
          <div className="record-list">{[
            ...clientOrders.map((order) => ({ id: order.id, date: order.created_at, type: "order", amount: Number(order.total), label: "Pedido", note: `Entrega ${shortDate(order.delivery_date)}` })),
            ...clientPayments.map((payment) => ({ id: payment.id, date: payment.created_at, type: "payment", amount: Number(payment.amount), label: payment.kind === "full" ? "Liquidación total" : "Abono recibido", note: "Pago registrado" }))
          ].sort((a, b) => b.date.localeCompare(a.date)).map((item) => <article className="movement-row" key={`${item.type}-${item.id}`}><span className={`record-icon ${item.type === "order" ? "order-record-icon" : "payment-record-icon"}`}>{item.type === "order" ? <ClipboardList size={16} /> : <CreditCard size={16} />}</span><div className="record-main"><strong>{item.label}</strong><small>{item.note} · {dateTime(item.date)}</small></div><strong className={item.type === "order" ? "due-amount" : "clear-amount"}>{item.type === "order" ? "+" : "−"}{money(item.amount)}</strong></article>)}</div>
        </section>
      </div>}
    </>
  );
}

function ReportPage({ orders, reportDate, onDateChange }) {
  const selectedOrders = orders.filter((order) => order.order_date === reportDate);
  const rows = new Map();
  selectedOrders.forEach((order) => order.items.forEach((item) => {
    const current = rows.get(item.product_id) || { name: item.product_name, quantity: 0, sales: 0 };
    current.quantity += Number(item.quantity);
    current.sales += Number(item.quantity) * Number(item.unit_price);
    rows.set(item.product_id, current);
  }));
  const products = [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
  const boxes = products.reduce((sum, item) => sum + item.quantity, 0);
  const sales = selectedOrders.reduce((sum, order) => sum + Number(order.total), 0);
  return <>
    <PageHeading eyebrow="RESUMEN DE VENTAS" title="Informe diario" subtitle="Consulta cuántas cajas y cuánto vendiste en una fecha." />
    <section className="surface-card report-card">
      <div className="report-date-row"><div><strong>Elige una fecha</strong><small>El informe incluye pedidos creados ese día.</small></div><input aria-label="Fecha del informe" type="date" value={reportDate} onChange={(event) => onDateChange(event.target.value)} /></div>
      <div className="report-stats"><StatCard icon={ClipboardList} label="Pedidos" value={selectedOrders.length} note={shortDate(reportDate)} tone="blue" /><StatCard icon={Boxes} label="Cajas totales" value={boxes} note="En todos los pedidos del día" tone="orange" /><StatCard icon={BadgeDollarSign} label="Venta total" value={money(sales)} note="Total antes de abonos" tone="green" /></div>
      <div className="report-table-title"><h2>Ventas por producto</h2><span>{shortDate(reportDate)}</span></div>
      {products.length ? <div className="responsive-table"><table><thead><tr><th>Producto</th><th>Cajas</th><th>Importe</th></tr></thead><tbody>{products.map((item) => <tr key={item.name}><td>{item.name}</td><td>{item.quantity}</td><td>{money(item.sales)}</td></tr>)}</tbody><tfoot><tr><th>Total del día</th><th>{boxes} cajas</th><th>{money(sales)}</th></tr></tfoot></table></div> : <EmptyState icon={Receipt} title="No hay pedidos para esta fecha" text="Elige otro día o registra un nuevo pedido." />}
    </section>
  </>;
}

function CardTitle({ icon: Icon, title, subtitle }) {
  return <div className="card-title"><span className="card-title-icon"><Icon size={17} /></span><div><h2>{title}</h2><p>{subtitle}</p></div></div>;
}

function SectionTitle({ eyebrow, title }) {
  return <div className="section-title-row"><div><span className="section-eyebrow">{eyebrow}</span><h2>{title}</h2></div></div>;
}

function Field({ label, as = "input", ...props }) {
  const id = props.id || props.name;
  const Input = as;
  return <div className="form-field"><label htmlFor={id}>{label}</label><Input id={id} {...props} /></div>;
}

function EmptyState({ icon: Icon, title, text }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={21} /></span><strong>{title}</strong><p>{text}</p></div>;
}

export default App;
