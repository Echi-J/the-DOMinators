/*
 * dc-runtime.js — the small renderer behind the Access London pages.
 *
 * Each page has:
 *   <template id="dc-template">  the markup, with {{placeholders}},
 *                                <sc-for list="{{items}}" as="x"> loops and
 *                                <sc-if value="{{flag}}"> conditions
 *   <div id="dc-root">           where the page is drawn
 *   <script type="text/x-dc">    a class Component extends DCLogic { renderVals() { ... } }
 *
 * renderVals() returns the values for the placeholders. Calling this.setState({...})
 * re-draws the page. Re-drawing patches the existing page in place, so focus,
 * scroll position and running animations are kept.
 */
(function () {
  'use strict';

  class DCLogic {
    constructor() { this.state = {}; }
    setState(patch) {
      let changed = false;
      for (const k in patch) { if (this.state[k] !== patch[k]) { changed = true; break; } }
      Object.assign(this.state, patch);
      if (changed) schedule();
    }
  }
  window.DCLogic = DCLogic;

  const HOLE = /\{\{([^}]+)\}\}/g;
  function lookup(expr, ctx) {
    expr = expr.trim();
    if (expr === 'true') return true;
    if (expr === 'false') return false;
    let v = ctx;
    for (const k of expr.split('.')) { if (v == null) return undefined; v = v[k]; }
    return v;
  }
  function fill(text, ctx) {
    return text.replace(HOLE, (m, e) => { const v = lookup(e, ctx); return v == null ? '' : String(v); });
  }
  const bare = (s) => s.replace(/[{}]/g, '');

  // Turn the template into real nodes for the current values.
  function build(src, ctx, out) {
    for (const n of Array.from(src.childNodes)) {
      if (n.nodeType === 3) { out.appendChild(document.createTextNode(fill(n.nodeValue, ctx))); continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.localName;
      if (tag === 'sc-for') {
        const list = lookup(bare(n.getAttribute('list')), ctx) || [];
        const as = n.getAttribute('as');
        list.forEach((item) => { const c = Object.assign({}, ctx); c[as] = item; build(n, c, out); });
        continue;
      }
      if (tag === 'sc-if') { if (lookup(bare(n.getAttribute('value')), ctx)) build(n, ctx, out); continue; }
      // create a fresh element and set each attribute only once it is filled in
      const el = document.createElementNS(n.namespaceURI, n.localName);
      el.__dcl = {};
      for (const a of Array.from(n.attributes)) {
        if (a.name.startsWith('hint-')) continue;
        if (a.name.startsWith('on')) {
          const fn = lookup(bare(a.value), ctx);
          if (typeof fn === 'function') el.__dcl[a.name.slice(2)] = fn;
          continue;
        }
        const v = a.value.indexOf('{{') >= 0 ? fill(a.value, ctx) : a.value;
        if (a.namespaceURI) el.setAttributeNS(a.namespaceURI, a.name, v); else el.setAttribute(a.name, v);
      }
      if (el.hasAttribute('value') && (tag === 'input' || tag === 'textarea')) el.value = el.getAttribute('value');
      build(n, ctx, el);
      out.appendChild(el);
    }
  }

  function bindAll(node) {
    if (node.nodeType !== 1) return;
    if (node.__dcl) for (const t in node.__dcl) node.addEventListener(t, node.__dcl[t]);
    node.__bound = node.__dcl || {};
    for (const c of node.childNodes) bindAll(c);
  }
  function syncListeners(oldEl, fresh) {
    const was = oldEl.__bound || {};
    for (const t in was) oldEl.removeEventListener(t, was[t]);
    for (const t in fresh) oldEl.addEventListener(t, fresh[t]);
    oldEl.__bound = fresh;
  }
  function syncAttrs(oldEl, newEl) {
    for (const a of Array.from(oldEl.attributes)) if (!newEl.hasAttribute(a.name)) oldEl.removeAttribute(a.name);
    for (const a of Array.from(newEl.attributes)) if (oldEl.getAttribute(a.name) !== a.value) oldEl.setAttribute(a.name, a.value);
    if ((oldEl.localName === 'input' || oldEl.localName === 'textarea') && document.activeElement !== oldEl && newEl.hasAttribute('value')) {
      if (oldEl.value !== newEl.value) oldEl.value = newEl.value;
    }
  }
  // Patch the live page to match the freshly built nodes.
  function morph(oldParent, newParent) {
    const oldKids = Array.from(oldParent.childNodes);
    const newKids = Array.from(newParent.childNodes);
    newKids.forEach((nn, i) => {
      const on = oldKids[i];
      if (!on) { oldParent.appendChild(nn); bindAll(nn); return; }
      if (on.nodeType === 3 && nn.nodeType === 3) { if (on.nodeValue !== nn.nodeValue) on.nodeValue = nn.nodeValue; return; }
      if (on.nodeType === 1 && nn.nodeType === 1 && on.localName === nn.localName && on.namespaceURI === nn.namespaceURI) {
        if (nn.hasAttribute('data-dc-preserve') && on.id === nn.id) return;
        syncAttrs(on, nn); syncListeners(on, nn.__dcl || {}); morph(on, nn); return;
      }
      oldParent.replaceChild(nn, on); bindAll(nn);
    });
    for (let i = newKids.length; i < oldKids.length; i++) oldParent.removeChild(oldKids[i]);
  }

  let comp = null, tpl = null, root = null, queued = false;
  function render() {
    queued = false;
    const frag = document.createDocumentFragment();
    build(tpl.content, comp.renderVals(), frag);
    morph(root, frag);
    if (comp.componentDidUpdate) comp.componentDidUpdate();
  }
  function schedule() { if (!queued && comp) { queued = true; Promise.resolve().then(render); } }

  document.addEventListener('DOMContentLoaded', () => {
    tpl = document.getElementById('dc-template');
    root = document.getElementById('dc-root');
    const src = document.querySelector('script[type="text/x-dc"]').textContent;
    const Component = new Function('DCLogic', src + '\nreturn Component;')(DCLogic);
    comp = new Component();
    render();
    if (comp.componentDidMount) comp.componentDidMount();
    window.addEventListener('pagehide', () => { if (comp.componentWillUnmount) comp.componentWillUnmount(); });
  });
})();
