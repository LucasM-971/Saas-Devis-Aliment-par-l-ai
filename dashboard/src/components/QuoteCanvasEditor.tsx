import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlignCenter, AlignCenterHorizontal, AlignCenterVertical,
  AlignEndHorizontal, AlignEndVertical, AlignLeft, AlignRight,
  AlignStartHorizontal, AlignStartVertical,
  ArrowDownToLine, ArrowUpToLine, Bold, ChevronDown, ChevronUp, Circle, Copy, Eye, EyeOff,
  ImagePlus, Italic, Lock, Minus, Plus, Redo2, RotateCcw, Square, Trash2, Type, Underline,
  Undo2, Unlock, ZoomIn, ZoomOut,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { CUSTOM_TYPES, DEFAULT_CANVAS_LAYOUT, ELEMENT_META, withDefaultElements } from '@/lib/canvas-layout';
import type { CanvasEl, QuoteTemplate } from '@/types';

// ─── Dimensions PDF ───────────────────────────────────────────────────────────
const A4_W = 595;
const A4_H = 842;
const MARGIN = 40;
const SNAP = 6;
const BASE_PX = 520;
const ZOOMS = [0.6, 0.75, 1, 1.25, 1.5];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const PALETTE = ['#111111', '#475569', '#ffffff', '#ef4444', '#f97316', '#f59e0b', '#10b981', '#0ea5e9', '#3b82f6', '#6366f1', '#a855f7', '#ec4899'];

// ─── Magnétisme ───────────────────────────────────────────────────────────────
type Targets = { v: number[]; h: number[] };

function buildTargets(els: CanvasEl[], excludeId: string): Targets {
  const v = [MARGIN, A4_W / 2, A4_W - MARGIN];
  const h = [MARGIN, A4_H / 2, A4_H - MARGIN];
  for (const e of els) {
    if (e.id === excludeId || !e.visible) continue;
    v.push(e.x, e.x + e.w / 2, e.x + e.w);
    h.push(e.y, e.y + e.h / 2, e.y + e.h);
  }
  return { v, h };
}

function snap1D(pos: number, size: number, targets: number[]) {
  const points = [pos, pos + size / 2, pos + size];
  let best = { pos, guide: null as number | null, d: SNAP + 1 };
  for (const p of points) for (const t of targets) {
    const d = Math.abs(p - t);
    if (d < best.d) best = { pos: t - (p - pos), guide: t, d };
  }
  return best.d <= SNAP ? best : { pos, guide: null };
}

function snapEdge(v: number, targets: number[]) {
  for (const t of targets) if (Math.abs(v - t) <= SNAP) return { v: t, guide: t };
  return { v, guide: null as number | null };
}

// ─── Image : réduite pour garder un template léger ────────────────────────────
function readImage(file: File, max = 1200): Promise<{ src: string; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = reject;
    fr.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        const png = file.type === 'image/png';
        resolve({ src: c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.88), w: c.width, h: c.height });
      };
      img.src = fr.result as string;
    };
    fr.readAsDataURL(file);
  });
}

type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const HANDLE_POS: Record<Handle, { left: string; top: string; cursor: string }> = {
  nw: { left: '0%', top: '0%', cursor: 'nwse-resize' },
  n: { left: '50%', top: '0%', cursor: 'ns-resize' },
  ne: { left: '100%', top: '0%', cursor: 'nesw-resize' },
  e: { left: '100%', top: '50%', cursor: 'ew-resize' },
  se: { left: '100%', top: '100%', cursor: 'nwse-resize' },
  s: { left: '50%', top: '100%', cursor: 'ns-resize' },
  sw: { left: '0%', top: '100%', cursor: 'nesw-resize' },
  w: { left: '0%', top: '50%', cursor: 'ew-resize' },
};

type Gesture =
  | { kind: 'move'; id: string; mx: number; my: number; o: CanvasEl; targets: Targets; moved: boolean }
  | { kind: 'resize'; id: string; handle: Handle; mx: number; my: number; o: CanvasEl; targets: Targets }
  | null;

type Props = { tpl: QuoteTemplate; onChange: (layout: CanvasEl[]) => void };

export function QuoteCanvasEditor({ tpl, onChange }: Props) {
  const [els, setEls] = useState<CanvasEl[]>(() => withDefaultElements(tpl.canvasLayout ?? DEFAULT_CANVAS_LAYOUT));
  const [sel, setSel] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [guides, setGuides] = useState<Targets>({ v: [], h: [] });
  const [zoom, setZoom] = useState(1);
  const [, force] = useState(0);
  const boardRef = useRef<HTMLDivElement>(null);
  const [basePx, setBasePx] = useState(BASE_PX);
  useEffect(() => {
    const fit = () => {
      const el = boardRef.current;
      if (!el) return;
      const avail = window.innerHeight - el.getBoundingClientRect().top - 32 - 48;
      setBasePx(Math.max(280, Math.min(BASE_PX, (avail * A4_W) / A4_H)));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  const scale = (basePx / A4_W) * zoom;
  const px = (pt: number) => pt * scale;

  const gesture = useRef<Gesture>(null);
  const elsRef = useRef(els);
  elsRef.current = els;
  const past = useRef<CanvasEl[][]>([]);
  const future = useRef<CanvasEl[][]>([]);
  const lastPush = useRef<{ key: string; t: number }>({ key: '', t: 0 });
  const clip = useRef<CanvasEl | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastEmitted = useRef<CanvasEl[] | undefined>(tpl.canvasLayout);

  // Sync seulement si le layout vient de l'extérieur (chargement API).
  useEffect(() => {
    if (tpl.canvasLayout && tpl.canvasLayout !== lastEmitted.current) {
      setEls(withDefaultElements(tpl.canvasLayout));
      past.current = [];
      future.current = [];
    }
  }, [tpl.canvasLayout]);

  const emit = useCallback((next: CanvasEl[]) => { lastEmitted.current = next; onChange(next); }, [onChange]);

  // Historique : regroupe les modifs rapides d'une même propriété (frappe, curseur).
  const record = (key = '') => {
    const now = Date.now();
    if (key && lastPush.current.key === key && now - lastPush.current.t < 800) { lastPush.current.t = now; return; }
    past.current.push(elsRef.current);
    if (past.current.length > 80) past.current.shift();
    future.current = [];
    lastPush.current = { key, t: now };
    force((n) => n + 1);
  };

  const commit = (next: CanvasEl[], key = '') => { record(key); setEls(next); emit(next); };
  const update = (id: string, p: Partial<CanvasEl>, key = '') =>
    commit(elsRef.current.map((e) => (e.id === id ? { ...e, ...p } : e)), key ? `${id}:${key}` : '');

  const undo = () => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(elsRef.current);
    lastPush.current = { key: '', t: 0 };
    setEls(prev); emit(prev); force((n) => n + 1);
  };
  const redo = () => {
    const nxt = future.current.pop();
    if (!nxt) return;
    past.current.push(elsRef.current);
    setEls(nxt); emit(nxt); force((n) => n + 1);
  };

  const selected = els.find((e) => e.id === sel) ?? null;
  const isCustom = (e: CanvasEl) => CUSTOM_TYPES.has(e.type);

  // ── Création ─────────────────────────────────────────────────────────────
  const add = (el: Omit<CanvasEl, 'id' | 'visible'>, prefix: string) => {
    const full: CanvasEl = { ...el, id: uid(prefix), visible: true };
    commit([...elsRef.current, full]);
    setSel(full.id);
    return full;
  };
  const center = (w: number, h: number) => ({ x: Math.round((A4_W - w) / 2), y: Math.round((A4_H - h) / 2), w, h });

  const addText = (preset: 'title' | 'subtitle' | 'body') => {
    const cfg = {
      title: { content: 'Ajouter un titre', fontSize: 26, bold: true, w: 320, h: 34 },
      subtitle: { content: 'Ajouter un sous-titre', fontSize: 16, bold: true, w: 260, h: 22 },
      body: { content: 'Ajouter du texte', fontSize: 11, bold: false, w: 220, h: 16 },
    }[preset];
    add({ type: 'custom_text', ...center(cfg.w, cfg.h), content: cfg.content, fontSize: cfg.fontSize, bold: cfg.bold, color: '#111111', align: 'left' }, 'txt');
  };
  const addShape = (type: 'shape_rect' | 'shape_ellipse' | 'shape_line', rounded = false) => {
    if (type === 'shape_line') add({ type, ...center(200, 6), stroke: '#111111', strokeWidth: 2 }, 'shp');
    else add({ type, ...center(120, 120), fill: tpl.accentColor || '#3b82f6', stroke: '', strokeWidth: 0, radius: rounded ? 14 : 0 }, 'shp');
  };
  const onImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const img = await readImage(f);
    const w = Math.min(220, img.w);
    const h = Math.round((w * img.h) / img.w);
    add({ type: 'image', ...center(w, h), src: img.src }, 'img');
  };

  const duplicate = (id: string) => {
    const src = elsRef.current.find((e) => e.id === id);
    if (!src || !isCustom(src)) return;
    add({ ...src, x: clamp(src.x + 14, 0, A4_W - src.w), y: clamp(src.y + 14, 0, A4_H - src.h) }, 'cp');
  };
  const remove = (id: string) => {
    const el = elsRef.current.find((e) => e.id === id);
    if (!el) return;
    // Les blocs du devis reviendraient au rechargement : on les masque.
    if (isCustom(el)) commit(elsRef.current.filter((e) => e.id !== id));
    else update(id, { visible: false });
    setSel(null);
  };
  const reorder = (id: string, dir: 'up' | 'down' | 'top' | 'bottom') => {
    const list = [...elsRef.current];
    const i = list.findIndex((e) => e.id === id);
    if (i < 0) return;
    const [it] = list.splice(i, 1);
    const j = dir === 'top' ? list.length : dir === 'bottom' ? 0 : clamp(i + (dir === 'up' ? 1 : -1), 0, list.length);
    list.splice(j, 0, it);
    commit(list);
  };
  const align = (kind: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') => {
    if (!selected) return;
    const { w, h } = selected;
    const pos = {
      left: { x: MARGIN }, hcenter: { x: Math.round((A4_W - w) / 2) }, right: { x: A4_W - MARGIN - w },
      top: { y: MARGIN }, vcenter: { y: Math.round((A4_H - h) / 2) }, bottom: { y: A4_H - MARGIN - h },
    }[kind];
    update(selected.id, pos);
  };

  // ── Souris : déplacement / redimensionnement ─────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const g = gesture.current;
      if (!g) return;
      const dx = (e.clientX - g.mx) / scale;
      const dy = (e.clientY - g.my) / scale;
      if (g.kind === 'move') {
        if (!g.moved && Math.abs(dx) + Math.abs(dy) < 1.5) return;
        if (!g.moved) { g.moved = true; record(); }
        let nx = clamp(g.o.x + dx, 0, A4_W - g.o.w);
        let ny = clamp(g.o.y + dy, 0, A4_H - g.o.h);
        const sx = e.altKey ? { pos: nx, guide: null } : snap1D(nx, g.o.w, g.targets.v);
        const sy = e.altKey ? { pos: ny, guide: null } : snap1D(ny, g.o.h, g.targets.h);
        nx = Math.round(clamp(sx.pos, 0, A4_W - g.o.w));
        ny = Math.round(clamp(sy.pos, 0, A4_H - g.o.h));
        setGuides({ v: sx.guide != null ? [sx.guide] : [], h: sy.guide != null ? [sy.guide] : [] });
        setEls((prev) => prev.map((el) => (el.id === g.id ? { ...el, x: nx, y: ny } : el)));
        return;
      }
      const { o, handle } = g;
      let x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
      let gv: number | null = null, gh: number | null = null;
      const sv = (v: number) => { const r = snapEdge(v, g.targets.v); if (r.guide != null) gv = r.guide; return r.v; };
      const shh = (v: number) => { const r = snapEdge(v, g.targets.h); if (r.guide != null) gh = r.guide; return r.v; };
      if (handle.includes('w')) x1 = sv(clamp(o.x + dx, 0, x2 - 12));
      if (handle.includes('e')) x2 = sv(clamp(o.x + o.w + dx, x1 + 12, A4_W));
      if (handle.includes('n')) y1 = shh(clamp(o.y + dy, 0, y2 - 4));
      if (handle.includes('s')) y2 = shh(clamp(o.y + o.h + dy, y1 + 4, A4_H));
      // Coins : ratio conservé pour les images, ou avec Maj.
      if (handle.length === 2 && (o.type === 'image' || e.shiftKey)) {
        const ratio = o.w / o.h;
        const w = x2 - x1;
        const h = w / ratio;
        if (handle.includes('n')) y1 = y2 - h; else y2 = y1 + h;
      }
      const next = { x: Math.round(x1), y: Math.round(y1), w: Math.round(x2 - x1), h: Math.round(y2 - y1) };
      setGuides({ v: gv != null ? [gv] : [], h: gh != null ? [gh] : [] });
      setEls((prev) => prev.map((el) => (el.id === g.id ? { ...el, ...next } : el)));
    };
    const onUp = () => {
      const g = gesture.current;
      if (g && (g.kind === 'resize' || g.moved)) emit(elsRef.current);
      gesture.current = null;
      setGuides({ v: [], h: [] });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  });

  // ── Clavier ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && k === 'y') { e.preventDefault(); redo(); return; }
      if (mod && k === 'v' && clip.current) {
        e.preventDefault();
        const c = clip.current;
        add({ ...c, x: clamp(c.x + 14, 0, A4_W - c.w), y: clamp(c.y + 14, 0, A4_H - c.h) }, 'cp');
        clip.current = { ...c, x: c.x + 14, y: c.y + 14 };
        return;
      }
      if (!selected) return;
      if (mod && k === 'd') { e.preventDefault(); duplicate(selected.id); return; }
      if (mod && k === 'c' && isCustom(selected)) { clip.current = { ...selected }; return; }
      if (e.key === 'Escape') { setSel(null); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); if (!selected.locked) remove(selected.id); return; }
      if (e.key === 'Enter' && selected.type === 'custom_text') { e.preventDefault(); setEditing(selected.id); return; }
      const step = e.shiftKey ? 10 : 1;
      const d = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, [number, number]>)[e.key];
      if (!d || selected.locked) return;
      e.preventDefault();
      update(selected.id, { x: clamp(selected.x + d[0], 0, A4_W - selected.w), y: clamp(selected.y + d[1], 0, A4_H - selected.h) }, 'nudge');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const startMove = (e: React.MouseEvent, el: CanvasEl) => {
    e.stopPropagation();
    setSel(el.id);
    if (editing !== el.id) setEditing(null);
    if (el.locked || editing === el.id) return;
    gesture.current = { kind: 'move', id: el.id, mx: e.clientX, my: e.clientY, o: el, targets: buildTargets(els, el.id), moved: false };
  };
  const startResize = (e: React.MouseEvent, el: CanvasEl, handle: Handle) => {
    e.stopPropagation();
    record();
    gesture.current = { kind: 'resize', id: el.id, handle, mx: e.clientX, my: e.clientY, o: el, targets: buildTargets(els, el.id) };
  };

  const handles = (el: CanvasEl): Handle[] =>
    el.type === 'shape_line' ? ['w', 'e'] : el.type === 'custom_text' ? ['nw', 'ne', 'e', 'se', 'sw', 'w'] : HANDLES;

  // ── Rendu ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3" style={{ userSelect: 'none' }}>
      {/* Barre d'outils supérieure */}
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 shadow-sm">
        <ToolBtn title="Annuler (⌘Z)" onClick={undo} disabled={!past.current.length}><Undo2 className="size-4" /></ToolBtn>
        <ToolBtn title="Rétablir (⌘⇧Z)" onClick={redo} disabled={!future.current.length}><Redo2 className="size-4" /></ToolBtn>
        <Sep />
        {selected && isCustom(selected) && selected.type === 'custom_text' && (
          <>
            <div className="flex items-center rounded border border-slate-200">
              <button type="button" className="grid size-7 place-items-center hover:bg-slate-100" onClick={() => update(selected.id, { fontSize: Math.max(6, (selected.fontSize ?? 10) - 1) }, 'fs')}><Minus className="size-3" /></button>
              <input
                type="number" value={selected.fontSize ?? 10}
                onChange={(e) => update(selected.id, { fontSize: clamp(Number(e.target.value) || 10, 6, 96) }, 'fs')}
                className="w-9 border-x border-slate-200 text-center text-xs tabular-nums focus:outline-none"
              />
              <button type="button" className="grid size-7 place-items-center hover:bg-slate-100" onClick={() => update(selected.id, { fontSize: Math.min(96, (selected.fontSize ?? 10) + 1) }, 'fs')}><Plus className="size-3" /></button>
            </div>
            <ColorBtn title="Couleur du texte" value={selected.color ?? '#111111'} onChange={(c) => update(selected.id, { color: c }, 'color')} letter />
            <ToolBtn title="Gras" active={!!selected.bold} onClick={() => update(selected.id, { bold: !selected.bold })}><Bold className="size-4" /></ToolBtn>
            <ToolBtn title="Italique" active={!!selected.italic} onClick={() => update(selected.id, { italic: !selected.italic })}><Italic className="size-4" /></ToolBtn>
            <ToolBtn title="Souligné" active={!!selected.underline} onClick={() => update(selected.id, { underline: !selected.underline })}><Underline className="size-4" /></ToolBtn>
            <ToolBtn
              title="Alignement du texte"
              onClick={() => update(selected.id, { align: ({ left: 'center', center: 'right', right: 'left' } as const)[selected.align ?? 'left'] })}
            >
              {selected.align === 'center' ? <AlignCenter className="size-4" /> : selected.align === 'right' ? <AlignRight className="size-4" /> : <AlignLeft className="size-4" />}
            </ToolBtn>
            <Sep />
          </>
        )}
        {selected && (selected.type === 'shape_rect' || selected.type === 'shape_ellipse') && (
          <>
            <ColorBtn title="Remplissage" value={selected.fill || '#ffffff'} empty={!selected.fill} onChange={(c) => update(selected.id, { fill: c }, 'fill')} onClear={() => update(selected.id, { fill: '' })} />
            <ColorBtn title="Contour" value={selected.stroke || '#111111'} ring empty={!selected.stroke || !selected.strokeWidth} onChange={(c) => update(selected.id, { stroke: c, strokeWidth: selected.strokeWidth || 2 }, 'stroke')} onClear={() => update(selected.id, { strokeWidth: 0 })} />
            <Slider label="Contour" min={0} max={12} value={selected.strokeWidth ?? 0} onChange={(v) => update(selected.id, { strokeWidth: v, stroke: selected.stroke || '#111111' }, 'sw')} />
            {selected.type === 'shape_rect' && <Slider label="Arrondi" min={0} max={60} value={selected.radius ?? 0} onChange={(v) => update(selected.id, { radius: v }, 'radius')} />}
            <Sep />
          </>
        )}
        {selected?.type === 'shape_line' && (
          <>
            <ColorBtn title="Couleur" value={selected.stroke || '#111111'} onChange={(c) => update(selected.id, { stroke: c }, 'stroke')} />
            <Slider label="Épaisseur" min={1} max={12} value={selected.strokeWidth ?? 2} onChange={(v) => update(selected.id, { strokeWidth: v }, 'sw')} />
            <Sep />
          </>
        )}
        {selected && isCustom(selected) && (
          <>
            <Slider label="Opacité" min={10} max={100} value={Math.round((selected.opacity ?? 1) * 100)} onChange={(v) => update(selected.id, { opacity: v / 100 }, 'op')} />
            <Sep />
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          <ToolBtn title="Zoom arrière" onClick={() => setZoom(ZOOMS[Math.max(0, ZOOMS.indexOf(zoom) - 1)])}><ZoomOut className="size-4" /></ToolBtn>
          <span className="w-10 text-center text-xs tabular-nums text-slate-500">{Math.round(zoom * 100)}%</span>
          <ToolBtn title="Zoom avant" onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(zoom) + 1)])}><ZoomIn className="size-4" /></ToolBtn>
        </div>
      </div>

      <div className="flex items-start gap-4">
        {/* ── Panneau gauche : éléments + calques ────────────────────────── */}
        <div className="sticky top-4 w-52 shrink-0 space-y-4">
          <Section title="Texte">
            <button type="button" onClick={() => addText('title')} className="w-full rounded-md border border-slate-200 px-3 py-2 text-left text-lg font-bold text-slate-800 hover:border-brand-400 hover:bg-brand-50/50">Titre</button>
            <button type="button" onClick={() => addText('subtitle')} className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-left text-sm font-semibold text-slate-700 hover:border-brand-400 hover:bg-brand-50/50">Sous-titre</button>
            <button type="button" onClick={() => addText('body')} className="flex w-full items-center gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-left text-xs text-slate-600 hover:border-brand-400 hover:bg-brand-50/50"><Type className="size-3.5" /> Corps de texte</button>
          </Section>

          <Section title="Formes & images">
            <div className="grid grid-cols-4 gap-1.5">
              <ShapeBtn title="Rectangle" onClick={() => addShape('shape_rect')}><Square className="size-5" /></ShapeBtn>
              <ShapeBtn title="Rectangle arrondi" onClick={() => addShape('shape_rect', true)}><div className="size-5 rounded-md border-2 border-current" /></ShapeBtn>
              <ShapeBtn title="Cercle" onClick={() => addShape('shape_ellipse')}><Circle className="size-5" /></ShapeBtn>
              <ShapeBtn title="Ligne" onClick={() => addShape('shape_line')}><Minus className="size-5" /></ShapeBtn>
            </div>
            <button type="button" onClick={() => fileRef.current?.click()} className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-brand-300 bg-brand-50/50 px-2 py-2 text-xs font-medium text-brand-600 hover:border-brand-400 hover:bg-brand-50">
              <ImagePlus className="size-4" /> Importer une image
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={onImage} />
          </Section>

          <Section title="Calques">
            <ul className="max-h-48 space-y-0.5 overflow-y-auto pr-1">
              {[...els].reverse().map((el) => {
                const meta = ELEMENT_META[el.type];
                const on = sel === el.id;
                return (
                  <li
                    key={el.id}
                    onClick={() => setSel(el.id)}
                    className={cn(
                      'group flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] transition-colors',
                      on ? 'bg-brand-600 font-semibold text-white' : 'text-slate-600 hover:bg-slate-100',
                      !el.visible && 'opacity-40',
                    )}
                  >
                    <LayerIcon el={el} color={on ? '#fff' : meta.color} />
                    <span className="flex-1 truncate">{el.type === 'custom_text' && el.content ? el.content : meta.label}</span>
                    {el.locked && <Lock className="size-3 shrink-0" />}
                    <button
                      type="button" aria-label="Visibilité"
                      onClick={(e) => { e.stopPropagation(); update(el.id, { visible: !el.visible }); }}
                      className={cn('shrink-0', on ? 'text-white/70 hover:text-white' : 'text-slate-300 hover:text-slate-500')}
                    >
                      {el.visible ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
                    </button>
                  </li>
                );
              })}
            </ul>
            <button type="button" onClick={() => { commit(DEFAULT_CANVAS_LAYOUT); setSel(null); }} className="mt-1 flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600">
              <RotateCcw className="size-3" /> Réinitialiser la mise en page
            </button>
          </Section>
        </div>

        {/* ── Plan de travail ────────────────────────────────────────────── */}
        <div
          ref={boardRef}
          className="flex shrink-0 justify-center rounded-lg bg-slate-100 p-6"
          onMouseDown={() => { setSel(null); setEditing(null); }}
        >
          <div
            className="relative bg-white shadow-lg ring-1 ring-slate-200"
            style={{
              width: px(A4_W), height: px(A4_H),
              backgroundImage: tpl.backgroundImageUrl ? `url(${tpl.backgroundImageUrl})` : undefined,
              backgroundSize: '100% 100%',
            }}
            onMouseDown={(e) => { e.stopPropagation(); setSel(null); setEditing(null); }}
          >
            <div className="pointer-events-none absolute border border-dashed border-slate-200" style={{ left: px(MARGIN), top: px(MARGIN), right: px(MARGIN), bottom: px(MARGIN) }} />

            {els.map((el, idx) => {
              if (!el.visible) return null;
              const on = el.id === sel;
              const custom = isCustom(el);
              const meta = ELEMENT_META[el.type];
              return (
                <div
                  key={el.id}
                  className={cn('absolute', el.locked ? 'cursor-default' : 'cursor-move', !on && 'hover:outline hover:outline-1 hover:outline-brand-400')}
                  style={{ left: px(el.x), top: px(el.y), width: px(el.w), height: px(el.h), zIndex: custom && !['custom_text'].includes(el.type) ? idx : 100 + idx }}
                  onMouseDown={(e) => startMove(e, el)}
                  onDoubleClick={() => { if (el.type === 'custom_text' && !el.locked) setEditing(el.id); }}
                >
                  {custom ? (
                    <CustomRender el={el} scale={scale} editing={editing === el.id} onText={(v) => update(el.id, { content: v }, 'content')} onDone={() => setEditing(null)} />
                  ) : (
                    <BlockRender el={el} tpl={tpl} scale={scale} color={meta.color} label={meta.label} />
                  )}
                </div>
              );
            })}

            {/* Cadre de sélection + poignées */}
            {selected?.visible && (
              <div
                className="pointer-events-none absolute z-[500]"
                style={{ left: px(selected.x), top: px(selected.y), width: px(selected.w), height: px(selected.h), outline: '2px solid #7c3aed', outlineOffset: 1 }}
              >
                {!selected.locked && editing !== selected.id && handles(selected).map((h) => (
                  <div
                    key={h}
                    className="pointer-events-auto absolute rounded-full border border-violet-600 bg-white shadow"
                    style={{
                      left: HANDLE_POS[h].left, top: HANDLE_POS[h].top, cursor: HANDLE_POS[h].cursor,
                      width: h.length === 2 ? 10 : h === 'n' || h === 's' ? 16 : 6,
                      height: h.length === 2 ? 10 : h === 'n' || h === 's' ? 6 : 16,
                      transform: 'translate(-50%, -50%)',
                    }}
                    onMouseDown={(e) => startResize(e, selected, h)}
                  />
                ))}
                {/* Barre flottante contextuelle */}
                <div
                  className="pointer-events-auto absolute left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-slate-200 bg-white px-1 py-0.5 shadow-md"
                  style={{ top: selected.y < 40 ? '100%' : undefined, bottom: selected.y < 40 ? undefined : '100%', margin: '8px 0' }}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {isCustom(selected) && <MiniBtn title="Dupliquer (⌘D)" onClick={() => duplicate(selected.id)}><Copy className="size-3.5" /></MiniBtn>}
                  <MiniBtn title={selected.locked ? 'Déverrouiller' : 'Verrouiller'} onClick={() => update(selected.id, { locked: !selected.locked })}>
                    {selected.locked ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />}
                  </MiniBtn>
                  <MiniBtn title="Supprimer (Suppr)" onClick={() => remove(selected.id)} danger><Trash2 className="size-3.5" /></MiniBtn>
                </div>
              </div>
            )}

            {guides.v.map((g, i) => <div key={`v${i}`} className="pointer-events-none absolute top-0 bottom-0 z-[600]" style={{ left: px(g), width: 1, background: '#ec4899' }} />)}
            {guides.h.map((g, i) => <div key={`h${i}`} className="pointer-events-none absolute left-0 right-0 z-[600]" style={{ top: px(g), height: 1, background: '#ec4899' }} />)}
          </div>
        </div>

        {/* ── Panneau droit : position & disposition ─────────────────────── */}
        <div className="sticky top-4 w-48 shrink-0 space-y-4 text-[11px]">
          {selected ? (
            <>
              <Section title={selected.type === 'custom_text' ? 'Texte' : ELEMENT_META[selected.type].label}>
                {selected.type === 'custom_text' && (
                  <textarea
                    value={selected.content ?? ''}
                    onChange={(e) => update(selected.id, { content: e.target.value }, 'content')}
                    rows={3}
                    className="w-full resize-none rounded border border-slate-200 px-2 py-1 text-[11px] focus:border-brand-400 focus:outline-none"
                  />
                )}
                {(selected.type === 'custom_text' || selected.type === 'shape_rect' || selected.type === 'shape_ellipse') && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {PALETTE.map((c) => (
                      <button
                        key={c} type="button" title={c}
                        onClick={() => update(selected.id, selected.type === 'custom_text' ? { color: c } : { fill: c })}
                        className="size-5 rounded-full border border-slate-300 transition-transform hover:scale-110"
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                )}
              </Section>

              <Section title="Aligner sur la page">
                <div className="grid grid-cols-3 gap-1">
                  <AlignBtn title="Gauche" onClick={() => align('left')}><AlignStartVertical className="size-3.5" /></AlignBtn>
                  <AlignBtn title="Centre" onClick={() => align('hcenter')}><AlignCenterVertical className="size-3.5" /></AlignBtn>
                  <AlignBtn title="Droite" onClick={() => align('right')}><AlignEndVertical className="size-3.5" /></AlignBtn>
                  <AlignBtn title="Haut" onClick={() => align('top')}><AlignStartHorizontal className="size-3.5" /></AlignBtn>
                  <AlignBtn title="Milieu" onClick={() => align('vcenter')}><AlignCenterHorizontal className="size-3.5" /></AlignBtn>
                  <AlignBtn title="Bas" onClick={() => align('bottom')}><AlignEndHorizontal className="size-3.5" /></AlignBtn>
                </div>
              </Section>

              <Section title="Disposition">
                <div className="grid grid-cols-4 gap-1">
                  <AlignBtn title="Premier plan" onClick={() => reorder(selected.id, 'top')}><ArrowUpToLine className="size-3.5" /></AlignBtn>
                  <AlignBtn title="Avancer" onClick={() => reorder(selected.id, 'up')}><ChevronUp className="size-3.5" /></AlignBtn>
                  <AlignBtn title="Reculer" onClick={() => reorder(selected.id, 'down')}><ChevronDown className="size-3.5" /></AlignBtn>
                  <AlignBtn title="Arrière-plan" onClick={() => reorder(selected.id, 'bottom')}><ArrowDownToLine className="size-3.5" /></AlignBtn>
                </div>
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  <NumField label="X" value={selected.x} onChange={(v) => update(selected.id, { x: clamp(v, 0, A4_W - selected.w) }, 'x')} />
                  <NumField label="Y" value={selected.y} onChange={(v) => update(selected.id, { y: clamp(v, 0, A4_H - selected.h) }, 'y')} />
                  <NumField label="L" value={selected.w} onChange={(v) => update(selected.id, { w: clamp(v, 12, A4_W - selected.x) }, 'w')} />
                  <NumField label="H" value={selected.h} onChange={(v) => update(selected.id, { h: clamp(v, 4, A4_H - selected.y) }, 'h')} />
                </div>
              </Section>
            </>
          ) : (
            <Section title="Raccourcis">
              <ul className="space-y-1 text-[10px] leading-relaxed text-slate-400">
                <li>Double-clic : modifier un texte</li>
                <li>⌘Z / ⌘⇧Z : annuler / rétablir</li>
                <li>⌘D : dupliquer · ⌘C / ⌘V</li>
                <li>Suppr : supprimer</li>
                <li>Flèches : déplacer (Maj = ×10)</li>
                <li>Maj + coin : garder les proportions</li>
                <li>Alt en glissant : sans magnétisme</li>
              </ul>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Rendu des éléments ───────────────────────────────────────────────────────
function CustomRender({ el, scale, editing, onText, onDone }: {
  el: CanvasEl; scale: number; editing: boolean; onText: (v: string) => void; onDone: () => void;
}) {
  const op = el.opacity ?? 1;
  if (el.type === 'image') {
    return el.src ? <img src={el.src} alt="" draggable={false} className="size-full" style={{ opacity: op }} /> : null;
  }
  if (el.type === 'shape_line') {
    const t = Math.max(1, (el.strokeWidth ?? 2) * scale);
    return <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2" style={{ height: t, background: el.stroke || '#111', opacity: op }} />;
  }
  if (el.type === 'shape_rect' || el.type === 'shape_ellipse') {
    const sw = el.stroke ? (el.strokeWidth ?? 0) * scale : 0;
    return (
      <div
        className="size-full"
        style={{
          background: el.fill || 'transparent',
          border: sw ? `${sw}px solid ${el.stroke}` : undefined,
          borderRadius: el.type === 'shape_ellipse' ? '50%' : (el.radius ?? 0) * scale,
          opacity: op,
        }}
      />
    );
  }
  const fs = (el.fontSize ?? 10) * scale;
  const style: React.CSSProperties = {
    fontFamily: 'Helvetica, Arial, sans-serif',
    fontSize: fs,
    lineHeight: 1.2,
    fontWeight: el.bold ? 700 : 400,
    fontStyle: el.italic ? 'italic' : 'normal',
    textDecoration: el.underline ? 'underline' : 'none',
    color: el.color ?? '#111',
    textAlign: el.align ?? 'left',
    opacity: op,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  };
  if (editing) {
    return (
      <textarea
        autoFocus
        value={el.content ?? ''}
        onChange={(e) => onText(e.target.value)}
        onBlur={onDone}
        onKeyDown={(e) => { if (e.key === 'Escape') onDone(); e.stopPropagation(); }}
        onMouseDown={(e) => e.stopPropagation()}
        onFocus={(e) => e.currentTarget.select()}
        className="absolute inset-0 resize-none overflow-hidden border-0 bg-transparent p-0 outline-none"
        style={{ ...style, userSelect: 'text' }}
      />
    );
  }
  return <div className="size-full overflow-visible" style={style}>{el.content || ' '}</div>;
}

function BlockRender({ el, tpl, scale, color, label }: { el: CanvasEl; tpl: QuoteTemplate; scale: number; color: string; label: string }) {
  if (el.type === 'logo' && tpl.logoDataUrl) {
    return <img src={tpl.logoDataUrl} alt="" draggable={false} className="size-full object-contain object-left" />;
  }
  return (
    <div
      className="flex size-full items-center justify-center rounded-sm border border-dashed text-center leading-tight"
      style={{ borderColor: `${color}99`, background: `${color}0f`, color, fontSize: Math.max(8, 9 * scale), fontWeight: 600 }}
    >
      {label}
    </div>
  );
}

function LayerIcon({ el, color }: { el: CanvasEl; color: string }) {
  const c = 'size-3 shrink-0';
  if (el.type === 'custom_text') return <Type className={c} style={{ color }} />;
  if (el.type === 'shape_rect') return <Square className={c} style={{ color }} />;
  if (el.type === 'shape_ellipse') return <Circle className={c} style={{ color }} />;
  if (el.type === 'shape_line') return <Minus className={c} style={{ color }} />;
  if (el.type === 'image') return <ImagePlus className={c} style={{ color }} />;
  return <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />;
}

// ─── Petits composants UI ─────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold text-slate-500">{title}</p>
      {children}
    </div>
  );
}
function Sep() { return <div className="mx-1 h-5 w-px bg-slate-200" />; }

function ToolBtn({ title, onClick, active, disabled, children }: { title: string; onClick: () => void; active?: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button" title={title} onClick={onClick} disabled={disabled}
      className={cn('grid size-8 place-items-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent', active && 'bg-brand-50 text-brand-700')}
    >
      {children}
    </button>
  );
}

function ColorBtn({ title, value, onChange, onClear, letter, ring, empty }: {
  title: string; value: string; onChange: (c: string) => void; onClear?: () => void; letter?: boolean; ring?: boolean; empty?: boolean;
}) {
  return (
    <div className="relative flex items-center">
      <label title={title} className="relative grid size-8 cursor-pointer place-items-center rounded-md hover:bg-slate-100">
        {letter ? (
          <span className="flex flex-col items-center text-sm font-bold leading-none text-slate-700">
            A<span className="mt-0.5 h-1 w-4 rounded-sm" style={{ background: value }} />
          </span>
        ) : (
          <span
            className="size-5 rounded"
            style={ring
              ? { border: `3px solid ${empty ? '#cbd5e1' : value}` }
              : { background: empty ? 'repeating-conic-gradient(#e2e8f0 0 25%, #fff 0 50%) 0 0/8px 8px' : value, border: '1px solid #cbd5e1' }}
          />
        )}
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
      {onClear && !empty && (
        <button type="button" title="Aucun" onClick={onClear} className="-ml-1 text-[10px] text-slate-400 hover:text-rose-500">×</button>
      )}
    </div>
  );
}

function Slider({ label, min, max, value, onChange }: { label: string; min: number; max: number; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-1.5 px-1 text-[11px] text-slate-500">
      {label}
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-20 accent-brand-600" />
      <span className="w-6 tabular-nums text-slate-400">{value}</span>
    </label>
  );
}

function ShapeBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={title} onClick={onClick} className="grid aspect-square place-items-center rounded-md border border-slate-200 text-slate-600 transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-600">
      {children}
    </button>
  );
}

function MiniBtn({ title, onClick, danger, children }: { title: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" title={title} onClick={onClick} className={cn('grid size-7 place-items-center rounded-md hover:bg-slate-100', danger ? 'text-rose-500' : 'text-slate-600')}>
      {children}
    </button>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-1 rounded border border-slate-200 px-1.5 focus-within:border-brand-400">
      <span className="text-slate-400">{label}</span>
      <input type="number" value={Math.round(value)} onChange={(e) => onChange(Number(e.target.value))} className="w-full bg-transparent py-0.5 text-right text-[11px] focus:outline-none" />
    </label>
  );
}

function AlignBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={title} onClick={onClick} className="grid h-7 place-items-center rounded border border-slate-200 text-slate-500 transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-600">
      {children}
    </button>
  );
}
