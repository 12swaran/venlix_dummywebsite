import { useEffect, useMemo, useState } from 'react';
import LeadForm from '../components/LeadForm.jsx';
import { getAccount, getCatalog, login, logout, register } from './api.js';
import { flushActivity, identity, trackActivity } from './activity.js';

const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

function savedCart() {
  try { const value = JSON.parse(localStorage.getItem('aurelia.cart') || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  catch { return {}; }
}

function Modal({ title, close, children }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);
  return <div className="market-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="market-modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="market-modal-head"><h2>{title}</h2><button className="icon-button" type="button" onClick={close} aria-label="Close">×</button></div>
      {children}
    </section>
  </div>;
}

export default function Marketplace() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState(['All']);
  const [category, setCategory] = useState('All');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [account, setAccount] = useState(null);
  const [cart, setCart] = useState(savedCart);
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [authMode, setAuthMode] = useState('register');
  const [auth, setAuth] = useState({ name: '', email: '', password: '' });
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [checkoutId, setCheckoutId] = useState(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    getCatalog().then(({ products: items, categories: kinds }) => { setProducts(items); setCategories(kinds); }).catch((error) => setLoadError(error.message));
    getAccount().then(({ account: current }) => setAccount(current)).catch(() => {});
    flushActivity();
    const onOnline = () => flushActivity();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);
  useEffect(() => { localStorage.setItem('aurelia.cart', JSON.stringify(cart)); }, [cart]);

  const visible = useMemo(() => products.filter((item) => (category === 'All' || item.category === category) && (!search || `${item.name} ${item.description} ${item.category}`.toLowerCase().includes(search.toLowerCase()))), [products, category, search]);
  const cartLines = products.filter((item) => cart[item.id] > 0).map((item) => ({ ...item, quantity: cart[item.id] }));
  const cartCount = cartLines.reduce((sum, item) => sum + item.quantity, 0);
  const total = cartLines.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const checkoutItems = cartLines.map((item) => ({ product_id: item.id, quantity: item.quantity }));

  async function event(name, properties) {
    try { await trackActivity(name, properties); }
    catch { setFeedback('Your activity is saved on this device and will sync when the local website is available.'); }
  }
  function selectCategory(value) {
    setCategory(value);
    const count = products.filter((item) => (value === 'All' || item.category === value) && (!search || `${item.name} ${item.description} ${item.category}`.toLowerCase().includes(search.toLowerCase()))).length;
    event('search_performed', { category: value, result_count: count });
  }
  function submitSearch(e) {
    e.preventDefault();
    const next = query.trim();
    setSearch(next);
    const count = products.filter((item) => (category === 'All' || item.category === category) && (!next || `${item.name} ${item.description} ${item.category}`.toLowerCase().includes(next.toLowerCase()))).length;
    event('search_performed', { category, result_count: count });
    document.getElementById('explore')?.scrollIntoView({ behavior: 'smooth' });
  }
  function openProduct(product) {
    setSelected(product);
    setModal('product');
    event('listing_viewed', { product_id: product.id });
  }
  function addToCart(product) {
    const quantity = Math.min((cart[product.id] || 0) + 1, 10);
    setCart((current) => ({ ...current, [product.id]: quantity }));
    setFeedback(`${product.name} added to your bag.`);
    event('added_to_cart', { product_id: product.id, quantity: 1 });
  }
  function setQuantity(id, quantity) {
    setCart((current) => { const next = { ...current }; if (quantity <= 0) delete next[id]; else next[id] = Math.min(quantity, 10); return next; });
    setCheckoutId(null);
  }
  async function submitAuth(e) {
    e.preventDefault(); setBusy(true); setFeedback('');
    try {
      if (authMode === 'login') await event('login_attempted');
      const result = authMode === 'register' ? await register({ ...auth, ...identity() }) : await login({ email: auth.email, password: auth.password, ...identity() });
      setAccount(result.account); setAuth({ name: '', email: '', password: '' }); setModal(cartCount ? 'cart' : null);
      setFeedback(`Welcome${result.account.name ? `, ${result.account.name.split(' ')[0]}` : ''}.`);
    } catch (error) { setFeedback(error.message); }
    finally { setBusy(false); }
  }
  async function signOut() {
    try { await logout(); setAccount(null); setCheckoutId(null); setFeedback('You are signed out.'); }
    catch (error) { setFeedback(error.message); }
  }
  async function startCheckout() {
    if (!account) { setAuthMode('register'); setModal('auth'); setFeedback('Create an account or sign in to continue to demo checkout.'); return; }
    if (!cartLines.length) return;
    setBusy(true); setFeedback('');
    const id = crypto.randomUUID();
    try {
      await trackActivity('checkout_started', { checkout_id: id, items: checkoutItems });
      setCheckoutId(id); setModal('checkout');
    } catch (error) { setFeedback(error.message); }
    finally { setBusy(false); }
  }
  async function completeCheckout() {
    if (!checkoutId) return;
    setBusy(true); setFeedback('');
    try {
      await trackActivity('demo_order_completed', { checkout_id: checkoutId, items: checkoutItems });
      setCart({}); setCheckoutId(null); setModal('complete');
    } catch (error) { setFeedback(error.message); }
    finally { setBusy(false); }
  }

  return <div className="marketplace">
    <div className="announcement">A little space for feeling better <span>✦</span> Thoughtfully chosen wellness experiences</div>
    <header className="market-header"><div className="market-container market-nav">
      <a href="#top" className="market-logo" aria-label="Aurelia home"><span className="brand-spark">✳</span> aurelia<span className="brand-dot">.</span></a>
      <nav aria-label="Main navigation"><a href="#explore">Explore</a><a href="#how-it-works">How it works</a><a href="#for-teams">For teams</a></nav>
      <div className="market-nav-actions">{account ? <button type="button" className="nav-text" onClick={signOut}>Hi, {account.name.split(' ')[0]} · Sign out</button> : <button type="button" className="nav-text" onClick={() => { setAuthMode('register'); setModal('auth'); }}>Sign in</button>}<button type="button" className="bag-button" onClick={() => setModal('cart')}>Bag <span>{cartCount}</span></button></div>
    </div></header>
    <main id="top">
      <section className="market-hero"><div className="market-container hero-grid"><div className="hero-copy"><p className="eyebrow"><span className="eyebrow-line" /> WELLNESS, ON YOUR TERMS</p><h1>Make room for <em>you.</em></h1><p className="hero-intro">Expert guided experiences for a calmer mind, stronger body, and everyday balance. Find what feels right and begin when you’re ready.</p><form className="hero-search" onSubmit={submitSearch}><label className="sr-only" htmlFor="market-search">Search experiences</label><span aria-hidden="true">⌕</span><input id="market-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="What would you like to feel better about?" /><button type="submit">Explore <span aria-hidden="true">↗</span></button></form><div className="hero-note"><span className="small-stars">✳</span><span>Considered care, made for real life.</span></div></div><div className="hero-art" aria-hidden="true"><div className="art-sun"/><div className="art-arch"><div className="art-circle"/><div className="art-leaf art-leaf-one"/><div className="art-leaf art-leaf-two"/><div className="art-leaf art-leaf-three"/><div className="art-stem"/></div><div className="art-ticket"><span>01 / 08</span><strong>A softer way<br/>to start</strong><i>✳</i></div></div></div></section>
      <section className="value-strip"><div className="market-container"><span>✳ &nbsp; Expert-led experiences</span><span>◇ &nbsp; Flexible for your routine</span><span>✦ &nbsp; A welcoming place to begin</span></div></section>
      <section id="explore" className="market-section explore-section"><div className="market-container"><div className="section-top"><div><p className="eyebrow">EXPLORE A LITTLE MORE</p><h2>Find your <em>feel-good</em> fit.</h2></div><p>Each experience is selected to help you create space for what matters most.</p></div><div className="filter-row" role="group" aria-label="Filter experiences">{categories.map((item) => <button key={item} type="button" className={item === category ? 'active' : ''} aria-pressed={item === category} onClick={() => selectCategory(item)}>{item}</button>)}</div>{search && <div className="search-summary">Showing results for “{search}” <button onClick={() => { setSearch(''); setQuery(''); }} type="button">Clear search</button></div>}{loadError && <p role="alert" className="market-alert">{loadError}</p>}<div className="product-grid">{visible.map((product, index) => <article className="product-card" key={product.id}><button className={`product-visual tone-${product.tone}`} type="button" onClick={() => openProduct(product)} aria-label={`View ${product.name}`}><span className="product-label">{product.label}</span><span className="product-art-shape shape-a"/><span className="product-art-shape shape-b"/><span className="product-art-symbol">{['✳','◓','⌁','☾','◌','✦','◍','◇'][index % 8]}</span><span className="visual-link">↗</span></button><div className="product-meta">{product.category} <span>·</span> {product.duration} <span>·</span> {product.format}</div><button type="button" className="product-title" onClick={() => openProduct(product)}>{product.name}</button><p>{product.description}</p><div className="product-bottom"><strong>{money(product.price)}</strong><button type="button" onClick={() => addToCart(product)}>Add to bag <span aria-hidden="true">↗</span></button></div></article>)}</div>{!loadError && visible.length === 0 && <div className="empty-state">No experiences matched your search. Try another phrase or category.</div>}</div></section>
      <section id="how-it-works" className="how-section"><div className="market-container how-grid"><div><p className="eyebrow">THE AURELIA WAY</p><h2>Wellbeing, without<br/><em>the overwhelm.</em></h2><p>Start small. Follow your curiosity. Every step is designed to feel natural, supportive, and yours.</p><a href="#explore" className="text-link">Discover experiences <span>↗</span></a></div><div className="steps"><div><span>01</span><div><h3>Explore what resonates</h3><p>Browse experiences across mindfulness, movement, nutrition, and coaching.</p></div></div><div><span>02</span><div><h3>Choose your own pace</h3><p>Save an experience to your bag and review it whenever you’re ready.</p></div></div><div><span>03</span><div><h3>Try a demo checkout</h3><p>See how the journey works. This preview never takes a payment.</p></div></div></div></div></section>
      <section id="for-teams" className="teams-section"><div className="market-container teams-grid"><div><p className="eyebrow">FOR PEOPLE & TEAMS</p><h2>Better days, <em>together.</em></h2><p>Looking for wellbeing experiences for your workplace? Tell us a little about your team and we’ll start a conversation.</p><div className="team-ornament" aria-hidden="true">✳</div></div><div className="team-form"><div className="form-panel"><h2>Let’s connect</h2><p>Share a few details and we’ll get back to you.</p><LeadForm /></div></div></div></section>
    </main><footer className="market-footer"><div className="market-container"><a href="#top" className="market-logo"><span className="brand-spark">✳</span> aurelia<span className="brand-dot">.</span></a><span>Everyday wellbeing, with intention.</span><span>© {new Date().getFullYear()} Aurelia</span></div></footer>
    {feedback && <div className="market-toast" role="status">{feedback}<button type="button" onClick={() => setFeedback('')} aria-label="Dismiss message">×</button></div>}
    {modal === 'product' && selected && <Modal title={selected.name} close={() => setModal(null)}><div className={`detail-visual tone-${selected.tone}`}><span>✳</span></div><p className="detail-category">{selected.category} · {selected.duration} · {selected.format}</p><p>{selected.detail}</p><div className="modal-actions"><strong>{money(selected.price)}</strong><button className="primary-button" type="button" onClick={() => { addToCart(selected); setModal('cart'); }}>Add to bag ↗</button></div></Modal>}
    {modal === 'auth' && <Modal title={authMode === 'register' ? 'Join Aurelia' : 'Welcome back'} close={() => setModal(null)}><p className="modal-intro">{authMode === 'register' ? 'Create a local account to continue your wellness journey.' : 'Sign in to continue your demo checkout.'}</p><form className="auth-form" onSubmit={submitAuth}>{authMode === 'register' && <label>Your name<input required maxLength="100" autoComplete="name" value={auth.name} onChange={(e) => setAuth({ ...auth, name: e.target.value })} /></label>}<label>Email address<input required type="email" autoComplete="email" value={auth.email} onChange={(e) => setAuth({ ...auth, email: e.target.value })} /></label><label>Password<input required type="password" minLength="8" autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} value={auth.password} onChange={(e) => setAuth({ ...auth, password: e.target.value })} /></label><button className="primary-button" disabled={busy} type="submit">{busy ? 'One moment…' : authMode === 'register' ? 'Create account ↗' : 'Sign in ↗'}</button></form><button className="switch-auth" type="button" onClick={() => { setAuthMode(authMode === 'register' ? 'login' : 'register'); setFeedback(''); }}>{authMode === 'register' ? 'Already have an account? Sign in' : 'New here? Create an account'}</button><p className="fine-print">This local demo stores your account on this computer.</p></Modal>}
    {modal === 'cart' && <Modal title="Your bag" close={() => setModal(null)}>{cartLines.length ? <><div className="cart-lines">{cartLines.map((item) => <div className="cart-line" key={item.id}><div className={`cart-thumb tone-${item.tone}`}>✳</div><div><strong>{item.name}</strong><span>{item.duration} · {item.format}</span><div className="quantity"><button type="button" onClick={() => setQuantity(item.id, item.quantity - 1)} aria-label={`Remove one ${item.name}`}>−</button><span>{item.quantity}</span><button type="button" onClick={() => setQuantity(item.id, item.quantity + 1)} aria-label={`Add one ${item.name}`}>+</button></div></div><strong>{money(item.price * item.quantity)}</strong></div>)}</div><div className="cart-total"><span>Total</span><strong>{money(total)}</strong></div><p className="fine-print">Demo checkout only. No payment information is collected.</p><button className="primary-button full" disabled={busy} type="button" onClick={startCheckout}>Continue to demo checkout ↗</button></> : <div className="empty-state">Your bag is taking a breath. <button type="button" onClick={() => setModal(null)}>Explore experiences</button></div>}</Modal>}
    {modal === 'checkout' && <Modal title="Demo checkout" close={() => setModal('cart')}><div className="checkout-note"><span>✳</span><div><strong>A preview of your next step</strong><p>No payment details or real charges. Completing this demo records your interest in these experiences.</p></div></div><div className="cart-total"><span>{cartCount} experience{cartCount === 1 ? '' : 's'}</span><strong>{money(total)}</strong></div><p className="fine-print">Signed in as {account?.email}</p><button className="primary-button full" type="button" disabled={busy} onClick={completeCheckout}>{busy ? 'Saving…' : 'Complete demo order ↗'}</button></Modal>}
    {modal === 'complete' && <Modal title="A good beginning" close={() => setModal(null)}><div className="complete-mark">✳</div><p>Your demo order is complete. Thank you for exploring Aurelia. Your interest was saved locally and will be shared with Venlix CRM when available.</p><button className="primary-button full" type="button" onClick={() => setModal(null)}>Keep exploring ↗</button></Modal>}
  </div>;
}
