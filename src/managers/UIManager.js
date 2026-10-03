import { ATTRIBUTES, RANKS, TYPES } from '../data/GameData.js';
import { Config } from '../core/Config.js';
import { STAT_KEYS, STAT_LABELS, STAT_DISPLAY_MAX } from '../data/GrowthData.js';
import { HP_MAX } from '../data/Growth.js';
import { statRadarSVG } from '../screens/StatRadar.js';
import { portraitStyle } from '../data/CharacterArt.js';
import { rarityBadge } from '../app/Rarity.js';

const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ATTR_ICON = Object.fromEntries(Object.values(ATTRIBUTES).map((a) => [a.id, a.icon]));

/**
 * DOMオーバーレイUI。ゲームロジックからは「何を表示するか」だけを受け取る。
 */
export class UIManager {
  constructor(players) {
    this.el = {
      heartFill: $('heartFill'), heartPct: $('heartPct'), heartBar: $('heartBar'),
      combo: $('combo'), comboNum: $('comboNum'),
      judge: $('judge'), prompt: $('prompt'), promptSub: $('promptSub'), promptMain: $('promptMain'),
      turn: $('turnBanner'), turnName: $('turnName'),
      hint: $('swipeHint'), dmg: $('dmgLayer'), flash: $('flash'), speed: $('speedLines'),
      players: $('players'), throwInfo: $('throwInfo'),
    };
    this.tutorial = { flick: 0, catch: 0 };
    this.buildPlayers(players);
    // デバッグボタン(クリックがゲーム入力に流れないよう pointerdown を止める)
    for (const [id, key] of [['dbgTraj', 'trajectory'], ['dbgCol', 'colliders']]) {
      const b = document.getElementById(id);
      if (!b) continue;
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', () => this.onDebugToggle?.(key));
    }
  }

  /**
   * 右下のパーティ表示:キャラクターアイコン(CharacterData の Portrait を portraitFocus で顔中心に切り出し)
   * 画像・名前は players[i].chara から取得(UI側にキャラ固有の値は持たない)
   */
  buildPlayers(players) {
    this.players = players;
    this.hideStatus?.();
    this.el.players.innerHTML = '';
    this.cards = players.map((p) => {
      const d = document.createElement('div');
      d.className = 'pcard';
      d.style.setProperty('--pc', p.color);
      const ch = p.chara;
      const ps = ch ? portraitStyle(ch) : null;
      if (ch) { d.style.setProperty('--ac', ATTRIBUTES[ch.attribute]?.color ?? '#fff'); d.title = `${p.id} ${ch.name}`; d.dataset.chara = ch.id; }
      const face = ps ? `<div class="picon" style="${ps}">` : `<div class="picon ph">${ch ? ch.name[0] : p.id}`;
      d.innerHTML = `${face}<i class="psp" aria-hidden="true"></i><i class="pslot">${p.id}</i>${ch ? `<i class="pattr">${ATTR_ICON[ch.attribute] ?? ''}</i>` : ''}<i class="pready" aria-hidden="true">READY!</i></div><div class="pbar"><i></i></div>`;
      this.el.players.appendChild(d);
      this.bindStatusPeek(d, players.indexOf(p));
      return { d, fill: d.querySelector('.pbar i'), sp: d.querySelector('.psp') };
    });
  }

  /**
   * 味方のアイコンを長押し → その子のステータス(押している間だけ表示。離すと消える)
   * 短くタップ → onCardTap(i)(SPECIAL READY の手番のキャラなら必殺技の予約 / 解除)
   *   押した操作は投球 / キャッチの入力へ流さない
   */
  bindStatusPeek(d, i) {
    let timer = null, peeked = false;
    const stop = (e) => e.stopPropagation();
    const end = () => { clearTimeout(timer); timer = null; this.hideStatus(); };
    d.addEventListener('pointerdown', (e) => { stop(e); clearTimeout(timer); peeked = false; timer = setTimeout(() => { timer = null; peeked = true; this.showStatus(i); }, Config.home?.longPressMs ?? 450); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) d.addEventListener(ev, (e) => { stop(e); end(); });
    d.addEventListener('click', (e) => { stop(e); if (!peeked) this.onCardTap?.(i); peeked = false; });
    d.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  showStatus(i) {
    const p = this.players?.[i], ch = p?.chara;
    if (!ch) return;
    const a = ATTRIBUTES[ch.attribute], r = RANKS[ch.rank], t = TYPES[ch.type];
    let el = this.statusEl;
    if (!el) { el = this.statusEl = document.createElement('div'); el.id = 'pstat'; el.setAttribute('role', 'dialog'); this.el.players.parentElement.appendChild(el); }
    const ps = portraitStyle(ch);
    const hpK = Math.max(0, Math.min(1, p.hp / (p.maxHp || 100)));
    const ab = ch.abilities ?? [];
    el.style.setProperty('--pc', p.color); el.style.setProperty('--ac', a?.color ?? '#fff'); el.style.setProperty('--rc', r?.color ?? '#fff');
    el.innerHTML = `
      <div class="pst-head"><span class="pst-face"${ps ? ` style="${ps}"` : ''}></span>
        <div class="pst-name"><b>${esc(ch.name)}</b><small>${rarityBadge(ch.rank, 'pst-rank')} ${a?.icon ?? ''} ${a?.label ?? ''} / ${t?.label ?? ''}</small><em>♡ Lv.${ch.level ?? 1}</em></div>
        <i class="pst-slot">${p.id}</i></div>
      ${p.ownerName ? `<div class="pst-owner">${p.mine ? 'YOU' : esc(p.ownerName)}</div>` : ''}
      <div class="pst-hp${p.hp <= 0 ? ' down' : ''}"><span>HP</span><i><i style="transform:scaleX(${hpK})"></i></i><b>${Math.max(0, Math.round(p.hp))}</b>/${p.maxHp ?? 100}</div>
      <div class="pst-radar">${statRadarSVG([{ key: 'hp', label: 'HP', value: p.maxHp ?? Config.playerMaxHp, max: HP_MAX }, ...STAT_KEYS.map((k) => ({ key: k, label: STAT_LABELS[k], value: (ch.totalStats ?? ch.stats)?.[k] ?? 50, max: STAT_DISPLAY_MAX }))])}</div>
      <div class="pst-ab"><small>ABILITY</small><div>${ab.length ? ab.map((x) => `<span class="${x.ultimate ? 'ult' : ''}">${esc(x.name)}</span>`).join('') : '<span class="none">なし</span>'}</div></div>`;
    // アイコンの左横(画面内に収める)
    const card = this.cards[i].d.getBoundingClientRect(), host = el.parentElement.getBoundingClientRect();
    el.hidden = false; el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
    const h = el.offsetHeight;
    el.style.top = `${Math.max(8, Math.min(host.height - h - 8, card.top - host.top + card.height / 2 - h / 2))}px`;
    el.style.right = `${host.right - card.left + 8}px`;
    this.statusIndex = i;
  }
  hideStatus() { if (this.statusEl) this.statusEl.hidden = true; this.statusIndex = null; }

  setPlayers(players, current = this.currentIdx) {
    this.players = players;
    this.currentIdx = current;
    if (this.statusIndex != null && this.statusEl && !this.statusEl.hidden) this.showStatus(this.statusIndex);   // 表示中に HP が変わったら更新
    players.forEach((p, i) => {
      const c = this.cards[i];
      c.fill.style.transform = `scaleX(${p.hp / p.maxHp})`;
      c.d.classList.toggle('active', i === current);
      c.d.classList.toggle('down', p.hp <= 0);
      c.d.classList.toggle('mine', !!p.mine);   // MULTI:自分が担当するキャラ
    });
  }

  /**
   * セラ ANGEL HEART の回復演出(約 1.2 秒・テンポ優先):巨大な白い翼 → 中央から白〜金の光 → 金の羽根と光のハートが各味方へ飛ぶ →
   * 着いた味方の HP ゲージが伸びる(+N)→ 中央に「ALL HEAL +N」。数値は result(SpecialEffects の結果)をそのまま表示
   */
  playAngelHeal(result) {
    const host = document.getElementById('ui');
    if (!host || !result) return;
    let el = document.getElementById('angelFx');
    if (!el) {
      el = document.createElement('div');
      el.id = 'angelFx'; el.setAttribute('aria-hidden', 'true');
      const wing = (side) => `<svg class="af-wing ${side}" viewBox="0 0 200 160">${Array.from({ length: 9 }, (_, k) => `<ellipse cx="${30 + k * 17}" cy="${40 + k * 9}" rx="${46 - k * 2}" ry="10" transform="rotate(${-28 + k * 9} ${30 + k * 17} ${40 + k * 9})" />`).join('')}<path d="M10 30 Q 90 -10 190 60 Q 120 40 60 70 Z" class="af-arm"/></svg>`;
      el.innerHTML = `<div class="af-light"></div>${wing('l')}${wing('r')}<div class="af-text"><small>ANGEL HEART</small><b></b></div>`;
      host.appendChild(el);
    }
    el.querySelector('.af-text b').textContent = `ALL HEAL +${result.amount}`;
    el.hidden = false; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    clearTimeout(this.angelT); this.angelT = setTimeout(() => { el.hidden = true; el.classList.remove('on'); }, 1350);
    // 金の羽根と光のハートが各味方へ → 着いたら HP ゲージが伸びる(+N)
    const r = this.el.dmg.getBoundingClientRect(), cx = r.width / 2, cy = r.height * 0.42;
    result.healed.forEach((h, k) => {
      const card = this.cards[h.i]?.d;
      if (!card) return;
      setTimeout(() => {
        this.flyTo(cx, cy, card, '<i class="feather"></i><i class="hh">♥</i>', 'heal', 480).then(() => {
          this.setPlayers(this.players);
          const n = document.createElement('span');
          n.className = 'healnum'; n.textContent = `+${h.gained}`;
          card.appendChild(n); card.classList.remove('healed'); void card.offsetWidth; card.classList.add('healed');
          setTimeout(() => n.remove(), 900);
        });
      }, 240 + k * 70);
    });
    if (!result.healed.length) this.setPlayers(this.players);
  }

  hitPlayer(i) {
    const d = this.cards[i].d;
    d.classList.remove('hurt'); void d.offsetWidth; d.classList.add('hurt');
  }

  /** HEART ゲージ(TotalHeart)。増えていく蓄積ゲージ */
  setHeart(heart, max, bump = false) {
    const rate = Math.min(1, heart / max);
    this.el.heartFill.style.transform = `scaleX(${rate})`;
    this.el.heartPct.textContent = `${Math.floor(rate * 100)}%`;
    this.el.heartBar.classList.toggle('full', rate >= 1);
    if (bump) { const b = this.el.heartBar; b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
  }

  /**
   * COMBO(ボスへの攻撃の連続 HIT)の表示。0 で消える
   *   hit … HIT で増えた(ポンと弾む)/ broke … MISS で途切れた(割れて消える)
   */
  setCombo(n, { hit = false, broke = false } = {}) {
    const c = this.el.combo;
    if (!c) return;
    c.classList.remove('pop', 'broke');
    void c.offsetWidth;
    if (broke) { c.classList.add('broke'); c.dataset.n = '0'; return; }
    this.el.comboNum.textContent = n;
    c.dataset.n = String(n);
    if (hit && n > 0) c.classList.add('pop');
  }

  /**
   * 画面上の (x, y) から HUD の要素(SPECIAL / FEVER ゲージ)へ小さなチップを飛ばす → 着いたら resolve
   *   「何を取ったから、どのゲージが増えたか」を見て分かるようにする演出。transform / opacity だけ
   */
  flyTo(x, y, target, html, cls = '', ms = 520) {
    return new Promise((resolve) => {
      const t = typeof target === 'string' ? document.getElementById(target) : target;
      const root = this.el.dmg;
      if (!t || !root || t.offsetParent === null) { resolve(); return; }
      const rr = root.getBoundingClientRect(), tr = t.getBoundingClientRect();
      const tx = tr.left - rr.left + tr.width * 0.5, ty = tr.top - rr.top + tr.height * 0.5;
      const d = document.createElement('div');
      d.className = `flychip ${cls}`;
      d.innerHTML = html;
      d.style.left = '0px'; d.style.top = '0px';
      root.appendChild(d);
      let done = false;
      const end = () => { if (done) return; done = true; d.remove(); resolve(); };
      const mx = (x + tx) / 2 + (tx > x ? -40 : 40), my = Math.min(y, ty) - 40;   // 少し弧を描いて飛ぶ
      const a = d.animate?.([
        { transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(.6)`, opacity: 0 },
        { transform: `translate(${x}px, ${y - 18}px) translate(-50%, -50%) scale(1.15)`, opacity: 1, offset: 0.18 },
        { transform: `translate(${mx}px, ${my}px) translate(-50%, -50%) scale(.95)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${tx}px, ${ty}px) translate(-50%, -50%) scale(.45)`, opacity: 0.9 },
      ], { duration: ms, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' });
      if (a) a.finished.then(end, end); else end();
      setTimeout(end, ms + 400);   // 完了イベントが来ない環境の保険
    });
  }

  showJudge(text, kind = '', color = '', sub = '') {
    const j = this.el.judge;
    j.textContent = text;
    if (sub) { const sm = document.createElement('small'); sm.textContent = sub; j.appendChild(sm); }
    j.className = `judge ${kind}`;
    j.style.setProperty('--jc', color || '');
    void j.offsetWidth;
    j.classList.add('show');
  }

  /** 部位耐久HUD(左側)。hitId の行を一瞬光らせる */
  setParts(partManager, hitId = null) {
    // v25: 部位ハート/部位破壊表示は廃止。内部データは互換性のため保持する。
    const wrap = document.getElementById('partsWrap'); if (wrap) wrap.hidden = true;
    return;
    const box = document.getElementById('parts');
    if (!box) return;
    if (!this.partRows || this.partRows.box !== partManager) {
      box.innerHTML = '';
      this.partRows = { box: partManager };
      for (const p of partManager.list) {
        const row = document.createElement('div');
        row.className = 'prow';
        row.innerHTML = `<span class="pl">${p.label}</span><span class="pb"><i></i></span>`;
        box.appendChild(row);
        this.partRows[p.id] = { row, fill: row.querySelector('i') };
      }
    }
    for (const p of partManager.list) {
      const r = this.partRows[p.id];
      r.fill.style.transform = `scaleX(${p.rate})`;
      r.row.dataset.state = p.state;
      if (p.id === hitId) { r.row.classList.remove('hit'); void r.row.offsetWidth; r.row.classList.add('hit'); }
    }
    const cnt = document.getElementById('partsCount');
    if (cnt) cnt.textContent = `LOVE MAX ${partManager.maxCount}/${partManager.list.length}`;
  }

  /** 当たり判定ラベル(「頭部 Head」など)を各Colliderの中心に表示。null で消す */
  updateColliderLabels(boss, player) {
    const layer = document.getElementById('colLabels');
    if (!layer) return;
    if (!boss) { layer.hidden = true; return; }
    layer.hidden = false;
    const EN = { head: 'Head', chest: 'Chest', stomach: 'Stomach', rightArm: 'Right Arm', leftArm: 'Left Arm', rightLeg: 'Right Leg', leftLeg: 'Left Leg' };
    this.colLabelEls ??= {};
    for (const p of boss.parts.list) {
      let el = this.colLabelEls[p.id];
      if (!el) {
        el = document.createElement('div');
        el.className = 'collabel';
        el.innerHTML = `<b></b><span></span>`;
        layer.appendChild(el);
        this.colLabelEls[p.id] = el;
      }
      el.querySelector('b').textContent = p.ja ?? '';
      el.querySelector('span').textContent = `${EN[p.id]} ♡${Math.round(p.heart)}/${p.maxHeart}`;
      el.dataset.state = p.state;
      const s = player.toScreen(boss.partCenter(p.id));
      el.style.transform = `translate(${s.x}px, ${s.y}px)`;
      el.classList.toggle('flip', s.x > player.viewport.w * 0.6);
    }
  }

  /** 部位破壊などの告知(画面上部) */
  partCallout(text, kind) {
    const c = document.getElementById('callout');
    c.textContent = text;
    c.className = `callout ${kind}`;
    void c.offsetWidth;
    c.classList.add('show');
  }

  /** タップ位置の波紋(キャッチ判定の確認用) */
  tapRipple(x, y, color) {
    const d = document.createElement('div');
    d.className = 'ripple';
    d.style.left = `${x}px`; d.style.top = `${y}px`;
    d.style.setProperty('--rc', color);
    this.el.dmg.appendChild(d);
    setTimeout(() => d.remove(), 500);
  }

  /** type: 'flick'(掴む前) | 'grab'(掴んでいる) | 'catch' | null */
  showPrompt(type, playerColor) {
    const p = this.el.prompt;
    // 説明はチュートリアル中(最初の数回)だけ。通常プレイ中はボス・Orb を隠さないよう出さない
    const key = type?.startsWith('catch') ? 'catch' : 'flick';
    if (type && (this.tutorial?.[key] ?? 0) <= 0) type = null;
    if (!type) { p.hidden = true; this.el.hint.hidden = true; return; }
    p.hidden = false;
    p.dataset.type = type;
    p.style.setProperty('--pc', playerColor);
    const text = {
      flick: ['FLICK!', 'ハートを持って、投げたい方へフリック'],
      grab: ['THROW!', 'くるくる回すとカーブ(時計回り=右 / 反時計回り=左)'],
      catch: ['CATCH!', 'リングが重なる瞬間にタップ'],
      catchHold: ['HOLD!', 'リングが重なったら押し続けて、メーターが外の輪に届いたら離す'],
      catchFlick: ['SLIDE!', 'リングが重なったら押して、動くハートについていき終点で離す'],
    }[type];
    this.el.promptMain.textContent = text[0];
    this.el.promptSub.textContent = text[1];
    this.el.hint.hidden = type !== 'flick';
  }

  /** 指ヒントをボールの画面位置へ */
  placeHint(x, y) { this.el.hint.style.transform = `translate(${x}px, ${y}px)`; }

  /** ボール以外を触ったとき:ボールを触るよう促す */
  nudgeBall() {
    const h = this.el.hint;
    h.classList.remove('nudge'); void h.offsetWidth; h.classList.add('nudge');
  }

  /** 直前フリックの数値(デバッグ)。投球前の球質(PRE-SPIN / DRIVE)と最終的なカーブも */
  setThrowInfo(flick, th) {
    const el = this.el.throwInfo;
    if (!el) return;
    const f = (v, d = 2) => Number(v).toFixed(d);
    const gz = th?.gesture;
    this.lastThrowHTML = th
      ? `強さ <b>${Math.round((th.strength ?? 0) * 100)}%</b> 初速 ${f(th.speed3d, 1)} 発射角 ${f(th.launchDeg, 0)}° 飛行 ${f(th.flightTime ?? 0, 2)}s<br>`
        + `向き 画面 ${f(th.angleDeg, 0)}° → 3D ${f(th.yawDeg ?? 0, 0)}° ・ 速さ ${f(gz?.speed ?? 0)}h/s<br>`
        + `回転 ${f(th.turnDeg ?? 0, 0)}° → カーブ入力 ${f(th.throwSpin ?? 0)} → 最終 <b>${{ left: '← 左', right: '右 →', straight: 'ストレート' }[th.curveDir] ?? ''}</b> ${f(th.spin)} 強さ ${f(th.curveStrength, 1)}`
      : '投げていません(上へ弾いて離すと投球)';
    el.innerHTML = this.lastThrowHTML;
  }
  /** 命中した位置(デバッグ):実際に Collider に当たった座標と部位 */
  setHitInfo(result, gateRoute = null) {
    const el = this.el.throwInfo;
    if (!el) return;
    const f = (v) => Number(v).toFixed(2);
    const hit = result?.type === 'hit' && result.point
      ? `Hit position <b>${f(result.point.x)} / ${f(result.point.y)} / ${f(result.point.z)}</b> ・ Hit part <b>${String(result.part ?? '').toUpperCase()}</b>`
      : `Hit <b>MISS</b>(${result?.type ?? '-'})`;
    el.innerHTML = `${this.lastThrowHTML ?? ''}<br>${hit} ・ Gate <b>${gateRoute ? gateRoute.toUpperCase() : 'NONE'}</b>`;
  }

  /** 投球前のハート直下に現在キャラの投球タイプを表示 */
  setThrowType(type) {
    const el = document.getElementById('throwType');
    if (!el) return;
    if (!type) { el.hidden = true; return; }
    el.textContent = type === 'CURVE' ? 'CURVE' : 'STRAIGHT';
    el.dataset.type = type === 'CURVE' ? 'CURVE' : 'STRAIGHT';
    el.hidden = false;
  }

  /**
   * 円運動のカーブ入力の表示:ハートのまわりの弧(右 = 時計回り・水色 / 左 = 反時計回り・ピンク。長さ = 強さ)+ 表示
   *   v … -1〜1(null で隠す)/ c … ハートの画面中心と半径 / reset … 2秒止めてストレートに戻った直後
   */
  setCurveInput(v, c = null, reset = false) {
    let el = document.getElementById('curveRing');
    if (!el) {
      el = document.createElement('div'); el.id = 'curveRing'; el.hidden = true;
      el.innerHTML = `<svg viewBox="-60 -60 120 120"><circle class="cr-base" r="46"/><path class="cr-arc"/><path class="cr-head"/></svg><b class="cr-label"></b>`;
      (document.getElementById('game') ?? document.body).appendChild(el);
    }
    if (v == null) { el.hidden = true; return; }
    el.hidden = false;
    if (c) { const size = Math.max(84, c.r * 3.4); el.style.width = el.style.height = `${size}px`; el.style.left = `${c.x - size / 2}px`; el.style.top = `${c.y - size / 2}px`; }
    const a = Math.abs(v), dir = Math.sign(v), R = 46;
    const sweep = a * Math.PI * 1.6, a0 = -Math.PI / 2, a1 = a0 + dir * sweep;
    const pt = (t) => [Math.cos(t) * R, Math.sin(t) * R];
    const [x0, y0] = pt(a0), [x1, y1] = pt(a1);
    el.querySelector('.cr-arc').setAttribute('d', a > 0.001 ? `M${x0.toFixed(1)},${y0.toFixed(1)} A${R},${R} 0 ${sweep > Math.PI ? 1 : 0} ${dir > 0 ? 1 : 0} ${x1.toFixed(1)},${y1.toFixed(1)}` : '');
    // 矢じり(進む向き)
    const tx = -Math.sin(a1) * dir, ty = Math.cos(a1) * dir, nx = Math.cos(a1), ny = Math.sin(a1), h = 7;
    el.querySelector('.cr-head').setAttribute('d', a > 0.001 ? `M${(x1 + tx * h).toFixed(1)},${(y1 + ty * h).toFixed(1)} L${(x1 + nx * h * 0.8).toFixed(1)},${(y1 + ny * h * 0.8).toFixed(1)} L${(x1 - nx * h * 0.8).toFixed(1)},${(y1 - ny * h * 0.8).toFixed(1)} Z` : '');
    el.dataset.dir = a > 0.001 ? (dir > 0 ? 'right' : 'left') : 'straight';
    el.querySelector('.cr-label').textContent = a > 0.001 ? `${dir > 0 ? 'RIGHT' : 'LEFT'} CURVE ${'▮'.repeat(Math.max(1, Math.min(3, Math.round(a * 3))))}` : 'STRAIGHT';
    if (reset) { el.classList.remove('reset'); void el.offsetWidth; el.classList.add('reset'); }
  }

  /** チュートリアル回数(説明表示)をリセット/消化 */
  resetTutorial(n) { this.tutorial = { flick: n, catch: n }; }
  tutorialDone(key) { if (this.tutorial[key] > 0) this.tutorial[key]--; }

  /**
   * 各キャラの SPECIAL ゲージ(アイコンを囲む細いリング。時計回りに溜まる)。100%(必殺技を使える)のキャラはリングとアイコンが光り「READY!」
   *   list[i] = { ratio: 0〜1, ready, armed(必殺技を予約中), bump(ゲージが増えた)}(EnergySystem.refreshUI から)
   */
  setSpecialGauges(list) {
    (this.cards ?? []).forEach((c, i) => {
      const s = list[i];
      if (!s || !c.sp) return;
      c.sp.style.setProperty('--sp', s.ratio.toFixed(3));
      c.d.classList.toggle('spready', !!s.ready);
      c.d.classList.toggle('sparmed', !!s.armed);
      const badge = c.d.querySelector('.pready'); if (badge) badge.textContent = s.armed ? 'ON!' : 'READY!';
      if (s.bump) { c.d.classList.remove('spbump'); void c.d.offsetWidth; c.d.classList.add('spbump'); }
    });
  }

  setDebugState(D) {
    const set = (id, on) => { const b = document.getElementById(id); if (b) b.setAttribute('aria-pressed', on ? 'true' : 'false'); };
    set('dbgTraj', D.showTrajectoryPreview);
    set('dbgCol', D.showColliders);
    if (this.el.throwInfo) this.el.throwInfo.hidden = !D.showThrowInfo;
  }

  showTurn(player, label = 'NEXT') {
    const t = this.el.turn;
    t.style.setProperty('--pc', player.color);
    this.el.turnName.innerHTML = `<small>${label}</small>${player.name}`;
    t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
  }

  /** ボスの攻撃開始時に小さく「ATTACK LEVEL ★★★☆☆」(★ = この戦闘での攻撃回数。★5 は特別表示)*/
  showAttackLevel(level, max = Config.defence?.maxLevel ?? 5) {
    let el = document.getElementById('atkLevel');
    if (!el) {
      el = document.createElement('div');
      el.id = 'atkLevel';
      document.getElementById('ui').appendChild(el);
    }
    const lv = Math.max(1, Math.min(max, level | 0));
    el.dataset.level = lv;
    el.classList.toggle('max', lv >= max);
    el.innerHTML = `<small>${lv >= max ? 'MAX ' : ''}ATTACK LEVEL</small><b>${'<i class="on">★</i>'.repeat(lv)}${'<i>☆</i>'.repeat(max - lv)}</b>`;
    el.style.setProperty('--dur', `${Config.defence?.levelBannerSec ?? 1.1}s`);
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }

  /**
   * ボス撃破の余韻:'complete' = 「HEART BREAK / 攻略完了」/ 'asmr' = HELL の「ASMR UNLOCKED」/ null = 消す
   *   バトル UI がフェードアウトした後も見えるよう #ui 直下の #clearFx に出す
   */
  showClearBanner(kind, { hell = false, title = '', ready = true } = {}) {
    let el = document.getElementById('clearFx');
    if (!el) {
      el = document.createElement('div');
      el.id = 'clearFx';
      el.innerHTML = '<div class="cf-complete"><b>HEART BREAK</b><span>攻略完了</span></div><div class="cf-asmr"><small>HELL CLEAR REWARD</small><b>ASMR UNLOCKED</b><span class="cf-title"></span></div>';
      document.getElementById('ui').appendChild(el);
    }
    if (!kind) { el.hidden = true; el.className = ''; return; }
    el.hidden = false;
    el.classList.toggle('hell', hell || kind === 'asmr');
    if (kind === 'asmr') el.querySelector('.cf-title').textContent = ready ? title : `${title}(音声準備中)`;
    const box = el.querySelector(kind === 'asmr' ? '.cf-asmr' : '.cf-complete');
    box.classList.remove('show'); void box.offsetWidth; box.classList.add('show');
    if (kind === 'asmr') el.querySelector('.cf-complete').classList.add('up');
  }

  showCatchNotice(player, mine = false) {
    let el = document.getElementById('catchNotice');
    if (!el) {
      el = document.createElement('div');
      el.id = 'catchNotice';
      el.style.cssText = 'position:fixed;left:50%;bottom:max(18px,env(safe-area-inset-bottom));z-index:90;transform:translateX(-50%);pointer-events:none;text-align:center;font-family:var(--display);width:min(92vw,560px);';
      document.getElementById('ui').appendChild(el);
    }
    if (!mine) { el.hidden = true; return; }
    el.innerHTML = `<div style="padding:10px 18px;border-radius:18px;background:#10243ddd;color:#fff;border:2px solid ${player?.color ?? '#fff'};box-shadow:0 5px 24px #0005,0 0 20px ${player?.color ?? '#fff'}55"><b style="display:block;font-size:clamp(18px,4.2vw,27px)">NEXT — あなたの番！</b><span style="display:block;margin-top:2px;font-size:clamp(12px,2.8vw,16px)">キャッチに備えて！</span></div>`;
    el.hidden = false;
  }

  hideCatchNotice() {
    const el = document.getElementById('catchNotice');
    if (el) el.hidden = true;
  }

  /** LOVE MAX ♡(攻略成功):画面中央に大きく */
  showLoveMax(on = true) {
    let el = document.getElementById('loveMax');
    if (!el) {
      el = document.createElement('div');
      el.id = 'loveMax';
      el.innerHTML = '<div class="lm-text">LOVE MAX <span>♡</span></div>' + Array.from({ length: 16 }, (_, i) => `<i style="--i:${i}">${i % 3 ? '♥' : '✦'}</i>`).join('');
      document.getElementById('ui').appendChild(el);
    }
    el.hidden = !on;
    if (on) { el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); }
  }

  damageNumber(x, y, value, { crit = false, color = '#fff', label = '', fever = 0 } = {}) {
    const d = document.createElement('div');
    d.className = `dmg${crit ? ' crit' : ''}${fever ? ` fever fl${fever}` : ''}`;
    d.style.left = `${x}px`;
    d.style.top = `${y}px`;
    d.style.setProperty('--dc', color);
    d.innerHTML = `${label ? `<small>${label}</small>` : ''}${value}`;
    this.el.dmg.appendChild(d);
    setTimeout(() => d.remove(), 1100);
  }

  /**
   * 着弾の段階(PERFECT ×1.50 / GREAT ×1.30 / GOOD ×1.15 / HIT ×1.00)を命中の瞬間だけ出す
   *   PERFECT:中央ラインを一瞬だけ光の筋で見せ、射抜いた感じを出す(ラインは常時は出さない)/ GREAT:短く淡い筋
   *   land = BattleCalc.landingGrade の結果 / lineX = 中央ラインの画面 X
   */
  landingFx(x, y, land, { lineX = x } = {}) {
    if (!land || land.grade === 'MISS') return;
    const g = String(land.grade).toLowerCase(), color = Config.landing?.grades.find((t) => t.id === land.grade)?.color ?? '#fff';
    if (g === 'perfect' || g === 'great') {
      const beam = document.createElement('div');
      beam.className = `landbeam ${g}`;
      beam.style.left = `${lineX}px`; beam.style.top = `${y}px`;
      beam.style.setProperty('--lc', color);
      beam.innerHTML = g === 'perfect' ? '<i></i><b></b>' : '<i></i>';
      this.el.dmg.appendChild(beam);
      setTimeout(() => beam.remove(), 700);
    }
    const d = document.createElement('div');
    d.className = `landing ${g}`;
    d.style.left = `${x}px`; d.style.top = `${y + 46}px`;
    d.style.setProperty('--lc', color);
    d.innerHTML = `<b>${land.grade}</b><small>×${land.mul.toFixed(2)}</small>`;
    this.el.dmg.appendChild(d);
    setTimeout(() => d.remove(), 950);
  }

  flash(color = '#fff', strength = 0.8) {
    const f = this.el.flash;
    f.style.background = color;
    f.style.transition = 'none';
    f.style.opacity = strength;
    void f.offsetWidth;
    f.style.transition = 'opacity 380ms ease-out';
    f.style.opacity = 0;
  }

  speedLines(on) { this.el.speed.classList.toggle('on', on); }

  // タイトル / リザルトは screens/MenuFlow.js へ移動

  update(dt) { /* 常時更新が必要なUIは今は無し */ }
}
