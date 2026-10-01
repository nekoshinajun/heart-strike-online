import { Config } from '../core/Config.js';
import { CHARACTERS, ATTRIBUTES, RANKS, TYPES, characterById } from '../data/GameData.js';
import { artUrl } from '../data/CharacterArt.js';
import { cardHTML } from '../screens/MenuFlow.js';
import { RewardService } from '../home/Guidance.js';
import { Haptic } from './Platform.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * 明るい HEART STRIKE テーマの汎用画面(レイヤー 'app')
 *   TAB_ROOT:育成(TRAINING)・COLLECTION / SUB:MISSION・PRESENT・SETTINGS
 * どれもデータが空でも破綻しない(空状態の表示あり)。
 */
export const TRAINING_FEATURES = [
  // 将来の育成(限界突破 / Skill / 衣装 / 親愛度)はここに1件足し、CHARACTER DETAIL の DETAIL_SECTIONS に表示を足す
  { id: 'level', label: 'レベル', ready: true },
  { id: 'limitBreak', label: '限界突破', ready: false },
  { id: 'skill', label: 'スキル', ready: false },
  { id: 'costume', label: '衣装', ready: false },
  { id: 'intimacy', label: '親密度', ready: false },
];

export class AppScreens {
  constructor(app, el) {
    this.app = app;
    this.p = app.progress;
    this.rewards = new RewardService(this.p);
    this.el = el;
    el.innerHTML = `<header class="as-head"><button type="button" class="as-back" aria-label="戻る">‹</button><div class="as-title"></div><div class="as-side"></div></header><div class="as-body ascroll"></div>`;
    this.body = el.querySelector('.as-body');
    this.title = el.querySelector('.as-title');
    this.side = el.querySelector('.as-side');
    this.backBtn = el.querySelector('.as-back');
    this.backBtn.addEventListener('click', () => app.router.back());
    for (const ev of ['pointerdown', 'pointerup']) el.addEventListener(ev, (e) => e.stopPropagation());
  }

  frame(screen, title, { back = false, side = '' } = {}) {
    this.screen = screen;
    this.el.dataset.screen = screen;
    this.title.textContent = title;
    this.backBtn.hidden = !back;
    this.side.innerHTML = side;
    this.body.scrollTop = 0;
  }

  // ---------------- 育成(TAB_ROOT)----------------
  showTraining() {
    this.frame('training', '育成', { side: '<button type="button" class="as-chip" data-go="collection">図鑑</button>' });
    const ids = this.p.ownedIds;
    this.body.innerHTML = `
      <p class="as-lead">キャラクターを選ぶと、レベル・ATK・DEF を確認できます</p>
      <div class="as-grid">${ids.map((id) => `<button type="button" class="as-card" data-id="${id}">${cardHTML(this.p.character(id))}</button>`).join('')}</div>`;
    this.side.querySelector('[data-go]').addEventListener('click', () => this.app.router.go('collection'));
    for (const b of this.body.querySelectorAll('[data-id]')) b.addEventListener('click', () => this.app.router.go('detail', { id: b.dataset.id }));
  }

  // ---------------- 図鑑(SUB)----------------
  showCollection() {
    this.frame('collection', 'コレクション');
    const owned = new Set(this.p.ownedIds);
    const n = CHARACTERS.filter((c) => owned.has(c.id)).length;
    this.body.innerHTML = `
      <p class="as-lead">出会ったキャラクター <b>${n}</b> / ${CHARACTERS.length}</p>
      <div class="as-grid">${CHARACTERS.map((c) => owned.has(c.id)
        ? `<button type="button" class="as-card" data-id="${c.id}">${cardHTML(this.p.character(c.id))}</button>`
        : `<div class="as-card unowned" data-rank="${c.rank}"><div class="un-sil" style="background-image:url('${artUrl(c, 'cutout')}')"></div><div class="un-q">？？？</div><div class="un-how">入手:ガチャ「${esc(Config.gacha.banners[0]?.name ?? '')}」</div></div>`).join('')}</div>`;
    for (const b of this.body.querySelectorAll('button[data-id]')) b.addEventListener('click', () => this.app.router.go('detail', { id: b.dataset.id }));
  }

  // ---------------- ミッション(SUB)----------------
  showMission() {
    this.frame('mission', 'ミッション', { back: true });
    const ms = this.rewards.missions;
    this.body.innerHTML = ms.length ? `<ul class="as-list">${ms.map((m) => `
      <li class="as-row${m.claimed ? ' done' : ''}">
        <div class="r-main"><b>${esc(m.label)}</b><span>${m.value} / ${m.goal}　報酬 ◆${m.reward.heartGem ?? 0}</span><i class="r-bar"><i style="transform:scaleX(${m.goal ? m.value / m.goal : 0})"></i></i></div>
        <button type="button" class="r-btn" data-claim="${m.id}" ${m.done && !m.claimed ? '' : 'disabled'}>${m.claimed ? '受取済' : '受け取る'}</button>
      </li>`).join('')}</ul><p class="as-note">※ ミッションと報酬は Prototype の仮データです</p>` : '<div class="as-empty">いまはミッションがありません</div>';
    for (const b of this.body.querySelectorAll('[data-claim]')) b.addEventListener('click', () => {
      const gem = this.rewards.claimMission(b.dataset.claim);
      if (gem) { Haptic.light(); this.app.toast(`HEART GEM +${gem}`); this.app.game?.audio?.orb?.(3); }
      this.showMission();
    });
  }

  // ---------------- プレゼント(SUB)----------------
  showPresent() {
    this.frame('present', 'プレゼント', { back: true });
    const ps = this.rewards.presents;
    const fmt = (t) => { const h = Math.max(0, Math.round((t - Date.now()) / 3600e3)); return h >= 48 ? `あと${Math.round(h / 24)}日` : `あと${h}時間`; };
    this.body.innerHTML = ps.length ? `<ul class="as-list">${ps.map((x) => `
      <li class="as-row">
        <div class="r-main"><b>${esc(x.label ?? 'プレゼント')}</b><span>◆${x.reward?.heartGem ?? 0}${x.expiresAt ? `　<em class="${this.rewards.expiringSoon(x) ? 'soon' : ''}">⏱ ${fmt(x.expiresAt)}</em>` : ''}</span></div>
        <button type="button" class="r-btn" data-claim="${x.id}">受け取る</button>
      </li>`).join('')}</ul>` : '<div class="as-empty">プレゼントはありません</div>';
    for (const b of this.body.querySelectorAll('[data-claim]')) b.addEventListener('click', () => {
      const gem = this.rewards.claimPresent(b.dataset.claim);
      if (gem) { Haptic.light(); this.app.toast(`HEART GEM +${gem}`); }
      this.showPresent();
    });
  }

  // ---------------- 設定(SUB)----------------
  showSettings() {
    this.frame('settings', '設定', { back: true });
    const st = this.p.data.settings;
    const row = (key, label, on) => `<li class="as-row"><div class="r-main"><b>${label}</b></div><button type="button" class="r-tgl${on ? ' on' : ''}" data-tgl="${key}" aria-pressed="${on}">${on ? 'ON' : 'OFF'}</button></li>`;
    this.body.innerHTML = `
      <ul class="as-list">
        <li class="as-row"><div class="r-main"><b>プレイヤー名</b><span>${esc(this.p.data.player.name)}</span></div><button type="button" class="r-btn ghost" data-act="name">変更</button></li>
        ${row('bgm', 'BGM', st.bgm)}
        ${row('haptic', '振動(対応端末のみ)', st.haptic)}
        <li class="as-row"><div class="r-main"><b>ガチャ演出</b><span>FULL:すべて / FAST:短く(山場は残す)/ SKIP:初めての SSR だけ</span></div><button type="button" class="r-btn ghost" data-act="speed">${st.gachaPlaybackMode}</button></li>
      </ul>
      <div class="as-ver">${Config.app.title} ${Config.app.version}</div>`;
    for (const b of this.body.querySelectorAll('[data-tgl]')) b.addEventListener('click', () => { st[b.dataset.tgl] = !st[b.dataset.tgl]; this.p.save(); this.app.applySettings(); this.showSettings(); });
    this.body.querySelector('[data-act="speed"]').addEventListener('click', () => {
      const order = ['FULL', 'FAST', 'SKIP_TO_NEW'];
      st.gachaPlaybackMode = order[(order.indexOf(st.gachaPlaybackMode) + 1) % order.length];
      this.p.save(); this.showSettings();
    });
    this.body.querySelector('[data-act="name"]').addEventListener('click', () => {
      const v = window.prompt('プレイヤー名(12文字まで)', this.p.data.player.name);
      if (v && v.trim()) { this.p.data.player.name = v.trim().slice(0, 12); this.p.save(); this.showSettings(); }
    });
  }
}

/** Favorite Select Sheet:所持キャラのみ。プレビュー → 決定 */
export class FavoriteSheet {
  constructor(app) { this.app = app; }
  show() {
    const p = this.app.progress;
    this.sel = p.favoriteId;
    const body = this.app.sheet.open('ホームのキャラクター', `
      <div class="fs-preview"><img alt=""><div class="fs-name"></div></div>
      <div class="fs-list sh-scroll">${p.ownedIds.map((id) => { const c = characterById(id); const ps = `--ac:${ATTRIBUTES[c.attribute].color};--rc:${RANKS[c.rank].color}`; return `<button type="button" class="fs-item" data-id="${id}" style="${ps}"><span class="fs-ic" style="background-image:url('${artUrl(c, 'cutout')}')"></span><span>${esc(c.name)}</span></button>`; }).join('')}</div>
      <button type="button" class="sh-primary" data-act="ok">♡ ホームに設定</button>`);
    this.body = body;
    for (const b of body.querySelectorAll('.fs-item')) b.addEventListener('click', () => { this.sel = b.dataset.id; this.refresh(); });
    body.querySelector('[data-act="ok"]').addEventListener('click', () => {
      const id = this.sel;
      this.app.router.closeSheet();
      if (id && id !== p.favoriteId) { this.app.home.setFavorite(id); this.app.router.go('home'); }
    });
    this.refresh();
  }
  refresh() {
    const c = characterById(this.sel);
    if (!c) return;
    this.body.querySelector('.fs-preview img').src = artUrl(c, 'cutout');
    this.body.querySelector('.fs-name').innerHTML = `<b>${esc(c.name)}</b> <span>${RANKS[c.rank].id} / ${ATTRIBUTES[c.attribute].label} / ${TYPES[c.type].label}</span>`;
    for (const b of this.body.querySelectorAll('.fs-item')) b.classList.toggle('sel', b.dataset.id === this.sel);
    this.body.querySelector('[data-act="ok"]').textContent = this.sel === this.app.progress.favoriteId ? '♡ 設定中' : '♡ ホームに設定';
  }
  hide() { this.app.sheet.close(); }
}
