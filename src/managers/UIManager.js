import { ATTRIBUTES, RANKS, TYPES } from '../data/GameData.js';
import { Config } from '../core/Config.js';
import { STAT_KEYS, STAT_LABELS } from '../data/GrowthData.js';
import { statRadarSVG } from '../screens/StatRadar.js';
import { portraitStyle } from '../data/CharacterArt.js';

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
      rally: $('rally'), rallyNum: $('rallyNum'), rallyMul: $('rallyMul'),
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
      d.innerHTML = `${face}<i class="pslot">${p.id}</i>${ch ? `<i class="pattr">${ATTR_ICON[ch.attribute] ?? ''}</i>` : ''}</div><div class="pbar"><i></i></div>`;
      this.el.players.appendChild(d);
      this.bindStatusPeek(d, players.indexOf(p));
      return { d, fill: d.querySelector('.pbar i') };
    });
  }

  /**
   * 味方のアイコンを長押し → その子のステータス(押している間だけ表示。離すと消える)
   *   押した操作は投球 / キャッチの入力へ流さない
   */
  bindStatusPeek(d, i) {
    let timer = null;
    const stop = (e) => e.stopPropagation();
    const end = () => { clearTimeout(timer); timer = null; this.hideStatus(); };
    d.addEventListener('pointerdown', (e) => { stop(e); clearTimeout(timer); timer = setTimeout(() => { timer = null; this.showStatus(i); }, Config.home?.longPressMs ?? 450); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) d.addEventListener(ev, (e) => { stop(e); end(); });
    d.addEventListener('click', stop);
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
        <div class="pst-name"><b>${esc(ch.name)}</b><small><i class="pst-rank">${r?.id ?? ''}</i> ${a?.icon ?? ''} ${a?.label ?? ''} / ${t?.label ?? ''}</small><em>♡ Lv.${ch.level ?? 1}</em></div>
        <i class="pst-slot">${p.id}</i></div>
      ${p.ownerName ? `<div class="pst-owner">${p.mine ? 'YOU' : esc(p.ownerName)}</div>` : ''}
      <div class="pst-hp${p.hp <= 0 ? ' down' : ''}"><span>HP</span><i><i style="transform:scaleX(${hpK})"></i></i><b>${Math.max(0, Math.round(p.hp))}</b>/${p.maxHp ?? 100}</div>
      <div class="pst-radar">${statRadarSVG([{ key: 'hp', label: 'HP', value: p.maxHp ?? Config.playerMaxHp, max: Config.playerMaxHp }, ...STAT_KEYS.map((k) => ({ key: k, label: STAT_LABELS[k], value: ch.stats?.[k] ?? 50, max: 100 }))])}</div>
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

  setPlayers(players, current) {
    this.players = players;
    if (this.statusIndex != null && this.statusEl && !this.statusEl.hidden) this.showStatus(this.statusIndex);   // 表示中に HP が変わったら更新
    players.forEach((p, i) => {
      const c = this.cards[i];
      c.fill.style.transform = `scaleX(${p.hp / p.maxHp})`;
      c.d.classList.toggle('active', i === current);
      c.d.classList.toggle('down', p.hp <= 0);
      c.d.classList.toggle('mine', !!p.mine);   // MULTI:自分が担当するキャラ
    });
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

  setRally(rally, tier, { tierUp = false, reset = false } = {}) {
    const r = this.el.rally;
    this.el.rallyNum.textContent = rally;
    this.el.rallyMul.textContent = tier.mul > 1 ? `HEART ×${tier.mul.toFixed(1)}` : '';
    r.style.setProperty('--rc', tier.color);
    r.dataset.level = tier.label;
    r.classList.remove('pop', 'broke'); void r.offsetWidth;
    r.classList.add(reset ? 'broke' : 'pop');
    if (tierUp) this.showJudge(`RALLY ${tier.label}!`, 'tier', tier.color);
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
    const key = type === 'catch' ? 'catch' : 'flick';
    if (type && (this.tutorial?.[key] ?? 0) <= 0) type = null;
    if (!type) { p.hidden = true; this.el.hint.hidden = true; return; }
    p.hidden = false;
    p.dataset.type = type;
    p.style.setProperty('--pc', playerColor);
    const text = {
      flick: ['FLICK!', '下へ引く量で球速 → 上へ弾いて投げる'],
      grab: ['THROW!', '浅く=よく曲がる・深く=まっすぐ／弾く長さで高さ'],
      catch: ['CATCH!', 'リングが重なる瞬間にタップ'],
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
    const ps = th?.effects?.find((e) => e.type === 'preSpin'), dr = th?.effects?.find((e) => e.type === 'drive');
    this.lastThrowHTML = th
      ? `SPEED <b>${Math.round(th.power * 100)}%</b>(引き ${f(th.pull ?? 0)}) 初速 ${f(th.speed3d, 1)} 発射角 ${f(th.launchDeg, 0)}°${th.reachable ? '' : '(届かない)'}<br>AIM 角度 ${f(th.angleDeg, 0)}° 長さ ${f(th.gestureN)}h<br>`
        + `PRE-SPIN <b>${ps ? (ps.dir > 0 ? 'RIGHT' : 'LEFT') : 'NONE'}</b> ${f(ps?.strength ?? 0)} ・ DRIVE <b>${dr ? 'ON' : 'OFF'}</b> ${f(dr?.strength ?? 0)}<br>`
        + `Throw SPIN ${f(th.throwSpin ?? th.spin)} → Final curve <b>${{ left: '← 左', right: '右 →', straight: 'ストレート' }[th.curveDir] ?? ''}</b> ${f(th.spin)} 強さ ${f(th.curveStrength, 1)}`
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

  /** ハートに仕込んだ球質の表示(投げるまで残る)。null で消す */
  setBallEffects(effects) {
    const el = $('ballFx');
    if (!el) return;
    const ps = effects?.preSpin, dr = effects?.drive;
    el.dataset.spin = ps ? (ps.dir > 0 ? 'right' : 'left') : '';
    el.dataset.drive = dr ? 'on' : '';
    el.hidden = !ps && !dr;
  }
  /** 成立した瞬間の短い表示(RIGHT SPIN / LEFT SPIN / DRIVE)*/
  flashBallEffect(label) {
    const b = $('ballFx')?.querySelector('.bf-pop');
    if (!b) return;
    b.textContent = label;
    b.classList.remove('on'); void b.offsetWidth; b.classList.add('on');
  }
  /** 球質の表示をハートの位置へ(毎フレーム)*/
  placeBallEffects(x, y, r) {
    const el = $('ballFx');
    if (!el || el.hidden) return;
    el.style.transform = `translate(${x}px, ${y}px)`;
    el.style.setProperty('--r', `${Math.max(14, r)}px`);
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
   * SPEED ゲージ(旧 POWER。null で非表示)。下へ引いた量 = 球速と直進性(ダメージは変わらない)
   *   浅い = SLOW(よく曲がる)/ 深い = FAST(まっすぐ)。「100% = 最大ダメージ」に見えない表示にする
   */
  setPowerGauge(power, locked = false, ball = null) {
    const el = document.getElementById('powerGauge');
    if (!el) return;
    if (power == null) { el.hidden = true; return; }
    el.hidden = false;
    // 指やボールを隠さないよう、ボールの左上に出す
    if (ball) {
      const w = el.offsetWidth || 150;
      el.style.left = `${Math.max(8, ball.x - ball.r - w - 8)}px`;
      el.style.top = `${Math.max(60, ball.y - ball.r - 34)}px`;
    }
    el.querySelector('i').style.transform = `scaleX(${power})`;
    el.querySelector('b').textContent = power < 0.45 ? 'SLOW' : power < 0.8 ? 'MID' : 'FAST';
    el.querySelector('span').textContent = 'SPEED';
    el.classList.remove('max');
    el.classList.toggle('locked', locked);
  }

  /** チュートリアル回数(説明表示)をリセット/消化 */
  resetTutorial(n) { this.tutorial = { flick: n, catch: n }; }
  tutorialDone(key) { if (this.tutorial[key] > 0) this.tutorial[key]--; }

  /** ENERGY ゲージ */
  setEnergy(value, max, ready, armed, bump = false) {
    const el = document.getElementById('energy');
    if (!el) return;
    el.querySelector('i').style.transform = `scaleX(${Math.min(1, value / max)})`;
    el.querySelector('b').textContent = `${Math.round(value)} / ${max}`;
    el.querySelector('em').textContent = '♡ SPECIAL';
    el.classList.toggle('ready', ready);
    el.classList.toggle('armed', armed);
    if (bump) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
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
