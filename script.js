import { Chess } from "https://unpkg.com/chess.js@1.4.0/dist/esm/chess.js";

/* Modes */
const MODES = {
  standard: { atomic: false, chess960: false, label: "Standard" },
  atomic:   { atomic: true,  chess960: false, label: "Atomic" },
  chess960: { atomic: false, chess960: true,  label: "Chess960" },
};
const files = "abcdefgh";

/* DOM */
const boardWrap = document.querySelector(".board-wrap");
const boardEl   = document.getElementById("board");
const statusEl  = document.getElementById("status");
const newBtn    = document.getElementById("new");
const movesBody = document.getElementById("movesBody");
const modeGrid  = document.getElementById("modeGrid");

/* Promotion */
const promoBackdrop = document.getElementById("promo-backdrop");
const promoButtons  = document.querySelectorAll(".promo-btn");
const promoCancel   = document.getElementById("promo-cancel");

/* Drawer & customize */
const drawer        = document.getElementById("drawer");
const drawerBackdrop= document.getElementById("drawerBackdrop");
const drawerClose   = document.getElementById("drawerClose");
const pieceChoices  = document.getElementById("pieceChoices");
const themeGrid     = document.getElementById("themeGrid");

/* Menu */
const miniMenuBtn   = document.getElementById("miniMenuBtn");
const miniSheet     = document.getElementById("miniSheet");
const actionFullscreen = document.getElementById("actionFullscreen");
const actionCustomize  = document.getElementById("actionCustomize");
const actionNew        = document.getElementById("actionNew");
const actionExport     = document.getElementById("actionExport");

/* Moves collapsible */
const movesToggle  = document.getElementById("movesToggle");
const movesContent = document.getElementById("movesContent");

/* Drag layer */
const dragLayer = document.getElementById("drag-layer");

/* State */
let chess;
let selected = null;
let currentMode = "standard";
let pendingPromotion = null;

/* Drag state */
let drag = null; // { from, ghostEl, srcPieceEl, startCenter, pointerOffset, last, raf }

/* Prefs */
const PREFS_KEY = "crazychess_prefs_v2";
let prefs = { pieceStyle: "classic", theme: "tournament", _preFsSq: null };
loadPrefs();

/* Boot */
buildBoard();
wireUI();
applyTheme(prefs.theme);
applyPieceStyle(prefs.pieceStyle);
applyRoute();
fitBoardToViewport();

/* ---------------- UI ---------------- */
function wireUI(){
  newBtn.addEventListener("click", () => newGame(currentMode));
  modeGrid.addEventListener("click", (e) => {
    const btn = e.target.closest(".mode-card");
    if (!btn) return;
    const mode = btn.dataset.mode;
    if (!MODES[mode]) return;
    location.hash = `#${mode}`;
  });
  window.addEventListener("hashchange", applyRoute);

  // Promotion
  promoButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      if (!pendingPromotion) { closePromotion(); return; }
      const mv = chess.move({ ...pendingPromotion, promotion: btn.dataset.piece });
      pendingPromotion = null; closePromotion(); if (mv) afterMove(mv);
    });
  });
  promoCancel.addEventListener("click", () => { pendingPromotion = null; closePromotion(); render(); });

  // Drawer
  drawerBackdrop.addEventListener("click", closeDrawer);
  drawerClose.addEventListener("click", closeDrawer);
  pieceChoices.addEventListener("click", e => {
    const c = e.target.closest(".choice"); if (!c) return;
    prefs.pieceStyle = c.dataset.pieceStyle; savePrefs();
    applyPieceStyle(prefs.pieceStyle); render(); highlightChoices();
  });
  themeGrid.addEventListener("click", e => {
    const t = e.target.closest(".theme-tile"); if (!t) return;
    prefs.theme = t.dataset.theme; savePrefs();
    applyTheme(prefs.theme); highlightThemes();
  });

  // Menu
  miniMenuBtn.addEventListener("click", () => {
    const open = miniSheet.classList.toggle("open");
    miniMenuBtn.setAttribute("aria-expanded", open ? "true" : "false");
  });
  document.addEventListener("click", e => {
    if (!miniSheet.contains(e.target) && e.target !== miniMenuBtn) closeMini();
  });
  actionCustomize.addEventListener("click", () => { openDrawer(); closeMini(); });
  actionNew.addEventListener("click", () => { newGame(currentMode); closeMini(); });
  actionExport.addEventListener("click", () => { exportPGN(); closeMini(); });

  // Fullscreen & resize
  actionFullscreen.addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", onFsChange);
  window.addEventListener("resize", () => {
    if (document.fullscreenElement === boardWrap) adjustFsSquareSize();
    else fitBoardToViewport();
  });

  // Moves collapse mobile
  if (movesToggle) {
    movesToggle.addEventListener("click", () => {
      const open = movesContent.classList.toggle("open");
      movesToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }
}

/* ---------------- Routing ---------------- */
function applyRoute(){
  const hash = (location.hash || "#standard").slice(1);
  currentMode = MODES[hash] ? hash : "standard";
  [...modeGrid.querySelectorAll(".mode-card")]
    .forEach(c => c.classList.toggle("active", c.dataset.mode === currentMode));
  newGame(currentMode);
}

/* ---------------- Board ---------------- */
function buildBoard(){
  boardEl.innerHTML = "";
  for (let r = 8; r >= 1; r--){
    for (let f = 0; f < 8; f++){
      const sq = files[f] + r;
      const b = document.createElement("button");
      b.className = "sq " + (((r + f) % 2) ? "dark" : "light");
      b.dataset.square = sq;
      b.addEventListener("click", onSquareClick); // fallback tap-to-move
      boardEl.appendChild(b);
    }
  }
}

function render(){
  // reset squares, reinsert piece spans
  boardEl.querySelectorAll(".sq").forEach(el => {
    el.innerHTML = "";
    el.classList.remove("src","tgt","capture");
    const p = chess.get(el.dataset.square);
    if (!p) return;
    const span = document.createElement("span");
    span.className = "piece";
    span.textContent = glyph(p);
    span.dataset.square = el.dataset.square;
    span.dataset.color = p.color;
    span.dataset.type  = p.type;
    span.addEventListener("pointerdown", onPieceDown, { passive:false });
    el.appendChild(span);
  });

  const side = chess.turn() === "w" ? "White" : "Black";
  let msg = `${MODES[currentMode].label} • ${side} to move`;
  if (chess.isCheck?.()) msg += " (check)";
  statusEl.textContent = msg;

  renderMoves();
}

/* ---------------- Glyph ---------------- */
function glyph({ type, color }){
  switch (prefs.pieceStyle){
    case "letters": { const m={k:"k",q:"q",r:"r",b:"b",n:"n",p:"p"}; const ch=m[type]||"?"; return color==="w"?ch.toUpperCase():ch; }
    case "fantasy": { const W={k:"♔",q:"♕",r:"♖",b:"♗",n:"♘",p:"♙"}, B={k:"♚",q:"♛",r:"♜",b:"♝",n:"♞",p:"♟"}; return color==="w"?W[type]:B[type]; }
    case "minimal": return color==="w" ? "○" : "●";
    case "emoji":  { const W={k:"♔",q:"♕",r:"♖",b:"♗",n:"♘",p:"♙"}, B={k:"♚",q:"♛",r:"♜",b:"♝",n:"♞",p:"♟"}; return color==="w"?W[type]:B[type]; }
    default:       { const W={k:"\u2654",q:"\u2655",r:"\u2656",b:"\u2657",n:"\u2658",p:"\u2659"}, B={k:"\u265A",q:"\u265B",r:"\u265C",b:"\u265D",n:"\u265E",p:"\u265F"}; return color==="w"?W[type]:B[type]; }
  }
}

/* ---------------- Moves table ---------------- */
function renderMoves(){
  const h = chess.history({ verbose: true });
  movesBody.innerHTML = "";
  for (let i=0;i<h.length;i+=2){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="num">${(i/2)+1}.</td><td>${h[i]?.san ?? ""}</td><td>${h[i+1]?.san ?? ""}</td>`;
    movesBody.appendChild(tr);
  }
  if (h.length){
    const last = h[h.length-1];
    const row = movesBody.lastElementChild;
    const cell = last.color === "w" ? row.children[1] : row.children[2];
    cell.classList.add("current");
    cell.scrollIntoView({ block:"nearest" });
  }
}

/* ---------------- Tap-to-move fallback ---------------- */
function onSquareClick(e){
  if (drag) return; // ignore while dragging
  const sq = e.currentTarget.dataset.square;
  if (!selected){
    const p = chess.get(sq);
    if (!p || p.color !== chess.turn()) return;
    selected = sq; showLegal(sq); return;
  }
  if (sq === selected){ clearMarks(); selected = null; return; }
  const moved = tryMove(selected, sq);
  if (!moved) render();        // ensure source piece is visible again if illegal
  clearMarks(); selected = null;
}

/* ---------------- Drag & physics ---------------- */
function onPieceDown(e){
  const from = e.currentTarget.dataset.square;
  const p = chess.get(from);
  if (!p || p.color !== chess.turn()) return;

  e.preventDefault(); // prevent page scroll on mobile
  selected = from; showLegal(from);

  // Hide the source piece immediately so it looks "picked up"
  const srcCell   = boardEl.querySelector(`[data-square="${from}"]`);
  const srcPiece  = srcCell?.querySelector(".piece");
  if (srcPiece) srcPiece.style.opacity = "0";

  // Prepare ghost
  const ghost = document.createElement("div");
  ghost.className = "drag-piece";
  ghost.textContent = e.currentTarget.textContent;
  dragLayer.appendChild(ghost);

  const sqRect  = e.currentTarget.getBoundingClientRect();
  const startCx = sqRect.left + sqRect.width/2;
  const startCy = sqRect.top  + sqRect.height/2;

  document.body.classList.add("dragging");
  drag = {
    from,
    ghostEl: ghost,
    srcPieceEl: srcPiece,       // <— keep a handle to restore on cancel/illegal
    startCenter: { x:startCx, y:startCy },
    pointerOffset: { x: e.clientX - startCx, y: e.clientY - startCy },
    last: {x:e.clientX, y:e.clientY},
    raf: 0
  };

  followPointer(e.clientX, e.clientY);
  window.addEventListener("pointermove", onPieceMove, { passive:false });
  window.addEventListener("pointerup",   onPieceUp,   { once:true });
  window.addEventListener("pointercancel", onPieceCancel, { once:true });
}

function onPieceMove(e){
  if (!drag) return;
  e.preventDefault();
  drag.last = { x:e.clientX, y:e.clientY };
  if (!drag.raf){
    drag.raf = requestAnimationFrame(() => {
      drag.raf = 0;
      followPointer(drag.last.x, drag.last.y);
    });
  }
}

function followPointer(px, py){
  // magnet toward nearest square center
  const snap = nearestCenter(px, py);
  const k = 0.20;
  const tx = (px - 21 - drag.pointerOffset.x) * (1-k) + (snap.x - 21) * k;
  const ty = (py - 21 - drag.pointerOffset.y) * (1-k) + (snap.y - 21) * k;
  drag.ghostEl.style.transform = `translate(${tx}px, ${ty}px)`;
}

function onPieceUp(e){
  if (!drag) return;
  const { from, ghostEl, srcPieceEl } = drag;
  const to = pointToSquare(e.clientX, e.clientY);

  const targetCenter = to ? centerOf(to) : drag.startCenter;
  animateTo(ghostEl, targetCenter.x, targetCenter.y, 140, () => {
    ghostEl.remove();
    document.body.classList.remove("dragging");
    const moved = to ? tryMove(from, to) : false;

    if (!moved) {
      // illegal or cancelled → show the original piece again
      if (srcPieceEl) srcPieceEl.style.opacity = "1";
      render(); // ensure full state is clean
    }
    drag = null;
    clearMarks(); selected = null;
  });

  window.removeEventListener("pointermove", onPieceMove);
}

function onPieceCancel(){
  if (!drag) return;
  const { ghostEl, startCenter, srcPieceEl } = drag;
  animateTo(ghostEl, startCenter.x, startCenter.y, 140, () => {
    ghostEl.remove();
    document.body.classList.remove("dragging");
    if (srcPieceEl) srcPieceEl.style.opacity = "1"; // restore
    drag = null;
    clearMarks(); selected = null;
  });
  window.removeEventListener("pointermove", onPieceMove);
}

/* --- drag helpers --- */
function nearestCenter(px, py){
  const toSq = pointToSquare(px, py);
  return toSq ? centerOf(toSq) : { x:px, y:py };
}
function pointToSquare(px, py){
  const r = boardEl.getBoundingClientRect();
  if (px < r.left || px > r.right || py < r.top || py > r.bottom) return null;
  const file = Math.floor((px - r.left) / (r.width / 8));
  const rank = 7 - Math.floor((py - r.top) / (r.height / 8));
  return files[file] + (rank + 1);
}
function centerOf(sq){
  const el = boardEl.querySelector(`[data-square="${sq}"]`);
  const r  = el.getBoundingClientRect();
  return { x: r.left + r.width/2, y: r.top + r.height/2 };
}
function animateTo(el, cx, cy, ms=140, done=()=>{}){
  const size = 42;
  const x = cx - size/2, y = cy - size/2;
  el.style.transition = `transform ${ms}ms cubic-bezier(.2,.9,.2,1.02)`;
  const end = () => { el.removeEventListener("transitionend", end); el.style.transition = ""; done(); };
  el.addEventListener("transitionend", end);
  requestAnimationFrame(() => el.style.transform = `translate(${x}px, ${y}px)`);
}

/* ---------------- Legal target dots ---------------- */
function showLegal(from){
  clearMarks();
  const srcEl = boardEl.querySelector(`[data-square="${from}"]`);
  srcEl?.classList.add("src");
  chess.moves({ square: from, verbose:true }).forEach(m => {
    const t = boardEl.querySelector(`[data-square="${m.to}"]`);
    if (!t) return;
    t.classList.add("tgt");
    const dot = document.createElement("span"); dot.className = "dot";
    if (m.flags.includes("c")) t.classList.add("capture");
    t.appendChild(dot);
  });
}
function clearMarks(){
  boardEl.querySelectorAll(".sq").forEach(el => {
    el.classList.remove("src","tgt","capture");
    const dot = el.querySelector(".dot"); if (dot) dot.remove();
  });
}

/* ---------------- Move logic (promotion + atomic) ---------------- */
function tryMove(from, to){
  const needsPromotion = willPromote(from, to);
  const isAtomic = MODES[currentMode].atomic;

  if (!isAtomic){
    if (needsPromotion){ 
      // For promotion, restore the source visibility now; we show modal and wait.
      if (drag?.srcPieceEl) drag.srcPieceEl.style.opacity = "1";
      pendingPromotion = {from,to}; openPromotion(); 
      return false; 
    }
    const mv = chess.move({ from, to, promotion:"q" });
    if (mv) { animateBoardMove(mv); return true; }
    return false;
  }

  if (needsPromotion){
    if (drag?.srcPieceEl) drag.srcPieceEl.style.opacity = "1";
    pendingPromotion = {from,to}; openPromotion();
    return false;
  }
  const mv = chess.move({ from, to, promotion:"q" });
  if (!mv) return false;

  const killed = atomicExplode(mv);
  if (killed.own){ chess.undo(); return false; }
  animateBoardMove(mv, killed);
  return true;
}

function willPromote(from, to){
  const piece = chess.get(from);
  if (!piece || piece.type !== "p") return false;
  const rank = parseInt(to[1], 10);
  return (piece.color === "w" && rank === 8) || (piece.color === "b" && rank === 1);
}

function animateBoardMove(mv, killed={own:false,opp:false}){
  // capture fade
  if (mv.flags.includes("c")){
    const capEl = boardEl.querySelector(`[data-square="${mv.to}"] .piece`);
    if (capEl){
      capEl.style.transition = "opacity 120ms ease";
      capEl.style.opacity = "0";
      setTimeout(() => { render(); finalize(mv, killed); }, 120);
      return;
    }
  }
  render();
  finalize(mv, killed);
}
function finalize(mv, killed){
  if (killed.opp){
    statusEl.textContent = `${MODES[currentMode].label} • ${mv.color === "w" ? "White" : "Black"} wins by explosion!`;
    return;
  }
  if (chess.isGameOver?.()){
    let result = "Draw";
    if (chess.isCheckmate()){
      const winner = chess.turn() === "w" ? "Black" : "White";
      result = `${winner} wins by checkmate`;
    } else if (chess.isStalemate?.()) result = "Draw (stalemate)";
    else if (chess.isDraw())        result = "Draw";
    statusEl.textContent = `${MODES[currentMode].label} • Game over: ${result}`;
  }
}

/* ---------------- Atomic helpers ---------------- */
function atomicExplode(mv){
  const killed = { own:false, opp:false };
  const area = neighbors8(mv.to); if (!area.includes(mv.to)) area.push(mv.to);
  for (const s of area){
    const pc = chess.get(s); if (!pc) continue;
    if (s !== mv.to && pc.type === "p") continue;
    if (pc.type === "k") (pc.color===mv.color) ? (killed.own=true) : (killed.opp=true);
  }
  for (const s of area){
    const pc = chess.get(s); if (!pc) continue;
    if (s !== mv.to && pc.type === "p") continue;
    chess.remove(s);
  }
  return killed;
}
function neighbors8(square){
  const f = files.indexOf(square[0]); const r = parseInt(square[1],10); const res=[];
  for (let df=-1; df<=1; df++) for (let dr=-1; dr<=1; dr++){
    const nf=f+df, nr=r+dr; if (nf<0||nf>7||nr<1||nr>8) continue; res.push(files[nf]+nr);
  }
  return res;
}

/* ---------------- New game & Chess960 ---------------- */
function newGame(mode){
  selected=null; pendingPromotion=null; movesBody.innerHTML="";
  chess = MODES[mode]?.chess960 ? new Chess(gen960()) : new Chess();
  render();
}
function gen960(){
  const s=Array(8).fill(null), ev=[0,2,4,6], od=[1,3,5,7], pick=a=>a.splice(Math.floor(Math.random()*a.length),1)[0];
  const e=[...ev], o=[...od]; const b1=pick(e); s[b1]="b"; const b2=pick(o); s[b2]="b";
  let f=idx(s); s[pick(f)]="q"; f=idx(s); s[pick(f)]="n"; f=idx(s); s[pick(f)]="n";
  f=idx(s).sort(()=>Math.random()-.5); const t=f.slice(0,3).sort((a,b)=>a-b); s[t[0]]="r"; s[t[1]]="k"; s[t[2]]="r";
  const back=s.join(""), W=back.toUpperCase(); return `${back}/pppppppp/8/8/8/8/PPPPPPPP/${W} w - - 0 1`;
}
function idx(a){ const r=[]; for(let i=0;i<a.length;i++) if(a[i]==null) r.push(i); return r; }

/* ---------------- Themes & piece style ---------------- */
function applyTheme(name){
  const THEMES={
    tournament:{light:"#dff7df",dark:"#4aa95a"},
    wood:{light:"#f0d9b5",dark:"#b58863"},
    blue:{light:"#bcd5ff",dark:"#5784e7"},
    green:{light:"#d5f5cb",dark:"#67b96d"},
    slate:{light:"#d9dde3",dark:"#7b8794"},
    purple:{light:"#e2d4ff",dark:"#8a5cf6"},
  };
  const t = THEMES[name] || THEMES.tournament;
  const root=document.documentElement;
  root.style.setProperty("--light", t.light);
  root.style.setProperty("--dark",  t.dark);
  highlightThemes();
}
function applyPieceStyle(s){ boardEl.setAttribute("data-piece-style", s); highlightChoices(); }
function highlightChoices(){ [...pieceChoices.querySelectorAll(".choice")].forEach(c => c.classList.toggle("active", c.dataset.pieceStyle===prefs.pieceStyle)); }
function highlightThemes(){ [...themeGrid.querySelectorAll(".theme-tile")].forEach(t => t.classList.toggle("active", t.dataset.theme===prefs.theme)); }

/* Drawer + menu */
function openDrawer(){ drawer.classList.add("open"); }
function closeDrawer(){ drawer.classList.remove("open"); }
function closeMini(){ miniSheet.classList.remove("open"); miniMenuBtn.setAttribute("aria-expanded","false"); }

/* Fullscreen & sizing */
async function toggleFullscreen(){
  try{
    if (document.fullscreenElement === boardWrap) await document.exitFullscreen();
    else { prefs._preFsSq=getComputedStyle(document.documentElement).getPropertyValue("--sq"); await boardWrap.requestFullscreen(); }
  }catch{}
}
function onFsChange(){
  const isFs = document.fullscreenElement === boardWrap;
  actionFullscreen.textContent = isFs ? "Exit fullscreen" : "Fullscreen";
  if (isFs) adjustFsSquareSize();
  else if (prefs._preFsSq){ document.documentElement.style.setProperty("--sq", prefs._preFsSq); fitBoardToViewport(); }
}
function adjustFsSquareSize(){
  const w=innerWidth,h=innerHeight; const size=Math.floor(Math.min(w,h)*0.98/8);
  document.documentElement.style.setProperty("--sq", size+"px");
}
function fitBoardToViewport(){
  const r = boardWrap.getBoundingClientRect(); const maxW = Math.floor(r.width);
  if (maxW>0){ const sq = Math.floor(maxW/8); document.documentElement.style.setProperty("--sq", sq+"px"); }
}

/* Export */
function exportPGN(){
  const pgn = chess.pgn({ max_width:80, newline:"\n" }) || "";
  const blob = new Blob([pgn], { type:"text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href=url; a.download="game.pgn";
  document.body.appendChild(a); a.click(); URL.revokeObjectURL(url); a.remove();
}

/* Prefs */
function loadPrefs(){ try{ const s=localStorage.getItem(PREFS_KEY); if(s) prefs={...prefs,...JSON.parse(s)}; }catch{} }
function savePrefs(){ try{ localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); }catch{} }
