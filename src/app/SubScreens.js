import { Config } from '../core/Config.js';
import { CHARACTERS, ATTRIBUTES, RANKS, TYPES, characterById, stageById } from '../data/GameData.js';
import { HEROINES, GIFTS, INTIMACY, heroineById, giftName, giftIcon, giftRank } from '../data/RomanceData.js';
import { artUrl } from '../data/CharacterArt.js';
import { cardHTML } from '../screens/MenuFlow.js';
import { RewardService } from '../home/Guidance.js';
import { Haptic } from './Platform.js';
import { roleTag, unlockText, clearChips, asmrStatus, defaultUnlockText } from './Roles.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** プレゼントを受け取った時のセリフ(GIFTS.reactions が未登録の時だけ使う。仕様書の例文)*/
const GIFT_FALLBACK_LINES = ['えっ、これ私に？', 'ありがとう♡'];
const fmtTime = (sec) => (Number.isFinite(sec) ? `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}` : '--:--');

/**
 * 明るい HEART STRIKE テーマの汎用画面(レイヤー 'app')
 *   TAB_ROOT:育成(仲間の一覧)・コレクション(仲間 / 攻略対象)
 *   SUB     :仲間の育成画面(trainChar)・攻略対象の画面(heroine:ASMR)・MISSION・PRESENT・SETTINGS
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

  // ---------------- 育成(TAB_ROOT):仲間の女の子を選ぶ ----------------
  intimacyHTML(ch) {
    return ch.intimacyLevel == null ? `♡ 親密度 <b>${ch.intimacy}</b>` : `♡ 親密度 Lv.<b>${ch.intimacyLevel}</b>`;
  }
  showTraining() {
    this.frame('training', '育成');
    const ids = this.p.ownedIds;
    this.body.innerHTML = `
      <p class="as-lead">${roleTag('ally')} 仲間の女の子を育てて、もっと仲良くなろう</p>
      <div class="tr-grid">${ids.map((id) => {
        const ch = this.p.character(id), a = ATTRIBUTES[ch.attribute], r = RANKS[ch.rank];
        return `<button type="button" class="tr-card" data-id="${id}" style="--ac:${a.color};--rc:${r.color}">
          <span class="tr-art"><img src="${artUrl(ch, 'cutout')}" alt="" draggable="false"></span>
          <span class="tr-rank">${r.id}</span><span class="tr-attr">${a.icon}</span>
          <span class="tr-info"><b>${esc(ch.name)}</b><span>Lv.${ch.level}</span><em>${this.intimacyHTML(ch)}</em></span>
        </button>`;
      }).join('')}</div>`;
    for (const b of this.body.querySelectorAll('[data-id]')) b.addEventListener('click', () => this.app.router.go('trainChar', { id: b.dataset.id }));
  }

  // ---------------- 仲間の育成画面(SUB):大きく表示 + 親密度 + プレゼント(ASMR は無い)----------------
  showTrainChar({ id } = {}, keepScroll = false) {
    if (!id || !this.p.isOwned(id)) { this.app.router.back(); return; }
    this.trainId = id;
    const ch = this.p.character(id), a = ATTRIBUTES[ch.attribute], r = RANKS[ch.rank], t = TYPES[ch.type];
    const top = this.body.scrollTop;
    this.frame('trainChar', '育成', { back: true });
    const expRatio = ch.nextExp ? Math.min(1, ch.exp / ch.nextExp) : 1;
    const lv = INTIMACY.levels;
    let intiBar = '';
    if (Array.isArray(lv) && lv.length && ch.intimacyLevel != null) {
      const cur = lv[ch.intimacyLevel - 1] ?? 0, next = lv[ch.intimacyLevel];
      intiBar = next == null ? '<span class="tc-max">MAX</span>' : `<i class="tc-bar"><i style="transform:scaleX(${Math.min(1, (ch.intimacy - cur) / (next - cur))})"></i></i><small>次の Lv まで ${next - ch.intimacy}</small>`;
    }
    this.body.innerHTML = `
      <section class="tc-hero" style="--ac:${a.color};--rc:${r.color}">
        <img src="${artUrl(ch, 'cutout')}" alt="${esc(ch.name)}" draggable="false">
        <div class="tc-bubble" hidden></div>
        <div class="tc-tags">${roleTag('ally')}<span class="tc-rank">${r.id}</span></div>
      </section>
      <section class="tc-card">
        <div class="tc-name"><b>${esc(ch.name)}</b><span>Lv.${ch.level}</span><em>${a.icon} ${a.label} / ${t.label}</em></div>
        <div class="tc-row tc-inti"><span>${this.intimacyHTML(ch)}</span>${intiBar}</div>
        <div class="tc-row"><span>EXP</span><i class="tc-bar exp"><i style="transform:scaleX(${expRatio})"></i></i><small>${ch.nextExp ? `${ch.exp} / ${ch.nextExp}` : 'MAX'}</small></div>
        <div class="tc-stats"><span>ATK <b>${ch.atk}</b></span><span>DEF <b>${ch.def}</b></span></div>
      </section>
      <section class="tc-gifts">
        <header><b>🎁 プレゼントを渡す</b><span>仲良くなると、もっと頼りになる</span></header>
        <div class="tg-list">${GIFTS.map((g) => { const n = this.p.itemCount(g.id), rk = giftRank(g); return `<button type="button" class="tg-item" data-gift="${g.id}" ${n ? '' : 'disabled'}${rk?.color ? ` style="--gk:${rk.color}"` : ''}>${g.image ? `<img src="${esc(g.image)}" alt="">` : `<i>${giftIcon(g)}</i>`}<span>${esc(giftName(g))}</span>${rk ? `<em class="tg-rank">${esc(rk.label)}</em>` : ''}<b>×${n}</b></button>`; }).join('')}</div>
        ${GIFTS.every((g) => !this.p.itemCount(g.id)) ? '<p class="as-note">プレゼントはまだ持っていません。ガチャを引くと毎回1個もらえます</p>' : ''}
      </section>
      <button type="button" class="tc-detail r-btn ghost" data-act="detail">プロフィールを見る</button>`;
    if (keepScroll) this.body.scrollTop = top;
    for (const b of this.body.querySelectorAll('[data-gift]')) b.addEventListener('click', () => this.giveGift(b.dataset.gift));
    this.body.querySelector('[data-act="detail"]').addEventListener('click', () => this.app.router.go('detail', { id }));
  }
  giveGift(giftId) {
    const r = this.p.giveGift(this.trainId, giftId);
    if (!r) return;
    Haptic.light();
    this.showTrainChar({ id: this.trainId }, true);
    const line = r.reaction ?? GIFT_FALLBACK_LINES[Math.floor(Math.random() * GIFT_FALLBACK_LINES.length)];
    const gains = [r.gainedIntimacy > 0 ? `♡ 親密度 +${r.gainedIntimacy}` : '', r.gainedExp > 0 ? `EXP +${r.gainedExp}` : '', r.levelUps > 0 ? 'LEVEL UP!' : ''].filter(Boolean).join(' ・ ');
    const bub = this.body.querySelector('.tc-bubble');
    bub.innerHTML = `<p>${esc(line)}</p>${gains ? `<small>${gains}</small>` : ''}`;
    bub.hidden = false; bub.classList.remove('in'); void bub.offsetWidth; bub.classList.add('in');
    const img = this.body.querySelector('.tc-hero img'); img.classList.remove('react'); void img.offsetWidth; img.classList.add('react');
    clearTimeout(this.bubTimer); this.bubTimer = setTimeout(() => { bub.hidden = true; }, 3200);
  }

  // ---------------- コレクション(TAB_ROOT):仲間 / 攻略対象 ----------------
  showCollection({ tab } = {}) {
    if (tab) this.collectionTab = tab;
    const cur = this.collectionTab ?? 'ally';
    this.frame('collection', 'コレクション');
    const owned = new Set(this.p.ownedIds);
    const nA = CHARACTERS.filter((c) => owned.has(c.id)).length;
    const nH = HEROINES.filter((h) => this.p.isCleared(h.stageId)).length;
    const tabs = `<div class="col-tabs" role="tablist">
      <button type="button" class="ally${cur === 'ally' ? ' sel' : ''}" data-tab="ally" role="tab">♡ 仲間 <small>${nA} / ${CHARACTERS.length}</small></button>
      <button type="button" class="heroine${cur === 'heroine' ? ' sel' : ''}" data-tab="heroine" role="tab">🎧 攻略対象 <small>${nH} / ${HEROINES.length}</small></button></div>`;
    if (cur === 'ally') {
      this.body.innerHTML = `${tabs}
        <p class="as-lead">${roleTag('ally')} 一緒に戦ってくれる女の子。ガチャで出会えます</p>
        <div class="as-grid">${CHARACTERS.map((c) => owned.has(c.id)
          ? `<button type="button" class="as-card" data-id="${c.id}">${cardHTML(this.p.character(c.id))}</button>`
          : `<div class="as-card unowned" data-rank="${c.rank}"><div class="un-sil" style="background-image:url('${artUrl(c, 'cutout')}')"></div><div class="un-q">？？？</div><div class="un-how">ガチャで出会える</div></div>`).join('')}</div>`;
      for (const b of this.body.querySelectorAll('button[data-id]')) b.addEventListener('click', () => this.app.router.go('detail', { id: b.dataset.id }));
    } else {
      this.body.innerHTML = `${tabs}
        <p class="as-lead">${roleTag('heroine')} コンカフェで口説く女の子。仲間にはなりません。HELL をクリアすると ASMR が聴けます</p>
        <div class="hc-list">${HEROINES.map((h) => {
          const st = stageById(h.stageId);
          return `<button type="button" class="hc-card" data-heroine="${h.id}">
            <span class="hc-art" style="background-image:url('${this.app.bossThumb(st)}')"></span>
            <span class="hc-main"><small>STAGE ${st.no}</small><b>${esc(st.boss.name)}</b>${clearChips(this.p, st.id, Config.difficultyOrder)}${asmrStatus(this.p, h)}</span>
          </button>`;
        }).join('')}</div>`;
      for (const b of this.body.querySelectorAll('[data-heroine]')) b.addEventListener('click', () => this.app.router.go('heroine', { id: b.dataset.heroine }));
    }
    for (const b of this.body.querySelectorAll('.col-tabs [data-tab]')) b.addEventListener('click', () => this.showCollection({ tab: b.dataset.tab }));
  }

  // ---------------- 攻略対象の画面(SUB):プロフィール + クリア状況 + ASMR ----------------
  showHeroine({ id } = {}) {
    const h = heroineById(id);
    if (!h) { this.app.router.back(); return; }
    this.stopAsmr();
    this.heroineId = id;
    const st = stageById(h.stageId);
    const tracks = this.p.asmrTracks(id);
    this.frame('heroine', '攻略対象', { back: true });
    const trackRow = (t, i) => {
      const title = t.title ?? `ASMR ${String(i + 1).padStart(2, '0')}`;
      const state = !t.unlocked ? `🔒 ${esc(unlockText(t.unlock, h))}` : !t.src ? '音声準備中' : fmtTime(t.durationSec);
      return `<li class="am-row${t.unlocked ? '' : ' locked'}${t.playable ? ' playable' : ''}" data-track="${t.id}">
        <button type="button" class="am-play" ${t.playable ? '' : 'disabled'} aria-label="${t.playable ? '再生' : '再生できません'}">${t.unlocked ? '▶' : '🔒'}</button>
        <div class="am-main"><b>${esc(title)}${t.isNew ? ' <em>NEW</em>' : ''}</b><span class="am-state">${state}</span>
          <div class="am-seek" hidden><input type="range" min="0" max="1000" value="0" aria-label="再生位置"><small><span class="am-cur">0:00</span> / <span class="am-dur">${fmtTime(t.durationSec)}</span></small></div></div>
      </li>`;
    };
    this.body.innerHTML = `
      <section class="hr-hero" style="background-image:url('${this.app.bossThumb(st)}')">
        <div class="hr-tags">${roleTag('heroine')}</div>
        <div class="hr-name"><small>STAGE ${st.no} ・ ${esc(st.name)}</small><b>${esc(st.boss.name)}</b>${h.cv ? `<span>CV ${esc(h.cv)}</span>` : ''}</div>
      </section>
      <section class="hr-card">
        ${st.concept ? `<p class="hr-concept">${esc(st.concept)}</p>` : ''}
        ${h.collab?.name ? `<p class="hr-collab">コラボ:${esc(h.collab.name)}</p>` : ''}
        <div class="hr-clear"><span>攻略状況</span>${clearChips(this.p, st.id, Config.difficultyOrder)}</div>
        <button type="button" class="r-btn hr-go" data-act="stage">♡ この子を攻略する</button>
      </section>
      <section class="hr-asmr">
        <header><b>🎧 ASMR</b><span>${esc(defaultUnlockText(h))}</span></header>
        ${tracks.length ? `<ul class="am-list">${tracks.map(trackRow).join('')}</ul>` : `<p class="am-empty">ASMR は準備中です。<br>${esc(defaultUnlockText(h))}すると、ここで聴けるようになります</p>`}
      </section>`;
    this.body.querySelector('[data-act="stage"]').addEventListener('click', () => this.app.deepLink({ screen: 'stage', stageId: st.id }));
    for (const row of this.body.querySelectorAll('.am-row.playable')) row.querySelector('.am-play').addEventListener('click', () => this.toggleAsmr(row.dataset.track));
    for (const t of tracks) if (t.unlocked) this.p.markAsmrSeen(id, t.id);   // 開いたら NEW は既読
  }
  /** ASMR の再生 / 一時停止(1曲ずつ)。シークバーと再生時間 */
  toggleAsmr(trackId) {
    const t = this.p.asmrTracks(this.heroineId).find((x) => x.id === trackId);
    if (!t?.playable) return;
    const row = this.body.querySelector(`.am-row[data-track="${trackId}"]`);
    if (this.asmr?.trackId === trackId) {
      if (this.asmr.audio.paused) this.asmr.audio.play().catch(() => {}); else this.asmr.audio.pause();
      return;
    }
    this.stopAsmr();
    const audio = new Audio(t.src);
    audio.preload = 'auto';
    const seek = row.querySelector('.am-seek'), range = seek.querySelector('input'), cur = seek.querySelector('.am-cur'), dur = seek.querySelector('.am-dur'), btn = row.querySelector('.am-play');
    seek.hidden = false; row.classList.add('on');
    const sync = () => { const d = audio.duration; if (Number.isFinite(d) && d > 0) { range.value = String(Math.round((audio.currentTime / d) * 1000)); dur.textContent = fmtTime(d); } cur.textContent = fmtTime(audio.currentTime); btn.textContent = audio.paused ? '▶' : '⏸'; };
    for (const ev of ['timeupdate', 'loadedmetadata', 'play', 'pause', 'ended']) audio.addEventListener(ev, sync);
    range.addEventListener('input', () => { const d = audio.duration; if (Number.isFinite(d)) audio.currentTime = (Number(range.value) / 1000) * d; });
    this.asmr = { trackId, audio, row };
    audio.play().catch(() => {});
  }
  stopAsmr() {
    if (!this.asmr) return;
    this.asmr.audio.pause(); this.asmr.audio.src = '';
    this.asmr.row?.classList.remove('on');
    this.asmr = null;
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
