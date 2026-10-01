import { CHARACTERS } from '../data/GameData.js';
import { GIFTS } from '../data/RomanceData.js';
import { Config } from '../core/Config.js';
import { TUNING_SCHEMA, getValue, setValue, resetTuning, currentOverrides, saveColliders, resetColliders } from '../core/Tuning.js';

const PART_IDS = ['head', 'chest', 'stomach', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg'];
const BOX_FIELDS = [
  ['x', 'X(左右)', -8, 8, 0.05], ['y', 'Y(高さ)', 0, 22, 0.05], ['w', '幅 W', 0.2, 10, 0.05],
  ['h', '高さ H', 0.2, 14, 0.05], ['rot', '回転°', -90, 90, 1], ['d', '奥行き D', 0.2, 4, 0.1], ['z', '手前 Z', -1, 2, 0.05],
];
const SPHERE_FIELDS = [
  ['x', 'X(左右)', -8, 8, 0.05], ['y', 'Y(高さ)', 0, 22, 0.05], ['r', '半径 R', 0.3, 6, 0.05], ['z', '手前 Z', -1, 2, 0.05],
];

/**
 * 調整パネル(Unity の Inspector 相当)。
 *  - パラメータ タブ:TUNING_SCHEMA から自動生成
 *  - Collider タブ:部位ごとの当たり判定の位置・サイズ・回転、キャラ画像の差し替え
 * 開いている間はゲームを一時停止。値はこのブラウザに保存される。
 */
export class InspectorPanel {
  constructor(g) {
    this.g = g;
    this.el = document.getElementById('inspector');
    this.body = document.getElementById('inspBody');
    this.note = document.getElementById('inspNote');
    this.tab = 'params';
    this.part = 'head';
    const stop = (e) => e.stopPropagation();
    for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'keydown', 'click']) this.el.addEventListener(ev, stop);

    const open = document.getElementById('dbgTune');
    open.addEventListener('pointerdown', stop);
    open.addEventListener('click', () => this.open());
    document.getElementById('inspClose').addEventListener('click', () => this.close());
    document.getElementById('inspReset').addEventListener('click', () => this.reset());
    document.getElementById('inspCopy').addEventListener('click', () => this.copy());
    document.getElementById('inspRestart').addEventListener('click', () => { this.close(); g.restart(); });
    // Debug 専用:HEART GEM を付与(製品 UI には出さない。調整パネルは Debug UI からのみ開ける)
    document.getElementById('inspGem').addEventListener('click', () => { g.app.progress.addGem(3000); g.app.toast('HEART GEM +3000(Debug)'); });
    // Debug 専用:アビリティ変更アイテム / プレゼント(入手経路はまだ無い・テスト用)
    document.getElementById('inspReconnect')?.addEventListener('click', () => { g.app.progress.addAbilityResetItems(1); g.app.toast('リコネクトハート +1(Debug)'); });
    document.getElementById('inspPresents')?.addEventListener('click', () => { for (const gi of GIFTS) g.app.progress.addItem(gi.id, 5); g.app.toast('プレゼント 各+5(Debug)'); });
    document.getElementById('inspSize').addEventListener('click', () => this.el.classList.toggle('tall'));
    for (const b of this.el.querySelectorAll('[data-tab]')) b.addEventListener('click', () => { this.tab = b.dataset.tab; this.build(); });
    this.build();
  }

  build() {
    for (const b of this.el.querySelectorAll('[data-tab]')) b.setAttribute('aria-pressed', b.dataset.tab === this.tab ? 'true' : 'false');
    this.body.innerHTML = '';
    if (this.tab === 'colliders') this.buildColliders(); else this.buildParams();
  }

  // ---------------- パラメータ ----------------
  buildParams() {
    for (const item of TUNING_SCHEMA) {
      if (item.group) {
        this.heading(item.group);
        if (item.group.startsWith('カットイン')) this.cutInPreviewRow();
        continue;
      }
      const v = getValue(item.path);
      if (item.type === 'bool') this.checkbox(item.label, v, (on) => this.set(item, on));
      else this.slider(`tn-${item.path.replace(/\./g, '-')}`, item.label, v, item.min, item.max, item.step, (n) => this.set(item, n));
    }
  }

  /** カットインの確認用ボタン(キャラごと) */
  cutInPreviewRow() {
    const row = document.createElement('div');
    row.className = 'partsel';
    row.innerHTML = CHARACTERS.map((c) => `<button type="button" data-ci="${c.id}">▶ ${c.name}</button>`).join('');
    this.body.appendChild(row);
    for (const b of row.querySelectorAll('[data-ci]')) {
      b.addEventListener('click', () => this.g.cutin.play(this.g.progress.character(b.dataset.ci)));
    }
  }

  set(item, value) {
    setValue(item.path, value);
    if (item.apply === 'restart') this.flagRestart();
  }

  // ---------------- Collider ----------------
  buildColliders() {
    const g = this.g;
    const layoutName = Config.boss.layout;
    const layout = Config.colliderLayouts[layoutName];

    this.heading('キャラ画像');
    const imgRow = document.createElement('div');
    imgRow.className = 'irow wide';
    imgRow.innerHTML = `<button type="button" data-layout="demon">同梱イラスト</button><button type="button" data-layout="lulu">内蔵の仮イラスト</button>
      <label class="filebtn" for="inspImage">画像を読み込む(PNG/JPG)</label><input id="inspImage" type="file" accept="image/*" hidden>`;
    this.body.appendChild(imgRow);
    for (const b of imgRow.querySelectorAll('[data-layout]')) {
      b.setAttribute('aria-pressed', b.dataset.layout === layoutName ? 'true' : 'false');
      b.addEventListener('click', () => { g.useLayout(b.dataset.layout); this.build(); });
    }
    imgRow.querySelector('#inspImage').addEventListener('change', (e) => this.loadImage(e.target.files?.[0]));
    const info = document.createElement('p');
    info.className = 'ihint';
    info.textContent = `使用中:${{ demon: '同梱イラスト', lulu: '内蔵の仮イラスト', image: '読み込んだ画像' }[layoutName]}(レイアウトごとに当たり判定を保存)。読み込んだ画像はこのブラウザ内だけで使われ、送信されません。`;
    this.body.appendChild(info);
    const im = Config.bossImage[layoutName];
    if (im) {
      this.slider('ci-h', '画像の高さ', im.height, 8, 30, 0.1, (n) => { im.height = n; g.boss.view.resizeCustomImage(n, im.y); saveColliders(); });
      this.slider('ci-y', '画像の上下位置', im.y, -6, 6, 0.05, (n) => { im.y = n; g.boss.view.resizeCustomImage(im.height, n); saveColliders(); });
    }

    this.heading('部位の当たり判定');
    const sel = document.createElement('div');
    sel.className = 'partsel';
    for (const id of PART_IDS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = `${Config.parts[id].ja} ${id}`;
      b.setAttribute('aria-pressed', id === this.part ? 'true' : 'false');
      b.addEventListener('click', () => { this.part = id; this.build(); });
      sel.appendChild(b);
    }
    this.body.appendChild(sel);

    const d = layout[this.part];
    this.checkbox('形状を球にする', d.shape === 'sphere', (on) => {
      if (on) { d.shape = 'sphere'; d.r = d.r ?? Math.max(d.w ?? 1, d.h ?? 1) / 2; }
      else { d.shape = 'box'; d.w = d.w ?? (d.r ?? 1) * 2; d.h = d.h ?? (d.r ?? 1) * 2; d.d = d.d ?? 1.6; d.rot = d.rot ?? 0; }
      this.applyColliders(); this.build();
    });
    const fields = d.shape === 'sphere' ? SPHERE_FIELDS : BOX_FIELDS;
    for (const [key, label, min, max, step] of fields) {
      this.slider(`cl-${this.part}-${key}`, label, d[key] ?? 0, min, max, step, (n) => { d[key] = n; this.applyColliders(); });
    }
    const p = document.createElement('p');
    p.className = 'ihint';
    p.textContent = '左右はキャラクター自身の左右(右腕=画面の左側)。緑の枠が当たり判定です。ボールは最初に交差した枠の部位に当たります。';
    this.body.appendChild(p);

    const acts = document.createElement('div');
    acts.className = 'irow wide';
    acts.innerHTML = '<button type="button" id="clReset">このレイアウトを初期値に</button><button type="button" id="clCopy">レイアウトをコピー</button>';
    this.body.appendChild(acts);
    acts.querySelector('#clReset').addEventListener('click', () => { resetColliders(layoutName); this.applyColliders(); this.build(); });
    acts.querySelector('#clCopy').addEventListener('click', (e) => this.copyText(JSON.stringify(Config.colliderLayouts[layoutName], null, 2), e.target, 'レイアウトをコピー'));
  }

  applyColliders() {
    this.g.boss.buildColliders();
    saveColliders();
  }

  loadImage(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => { this.g.useImageBoss(img, 'image'); this.build(); };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  // ---------------- 共通 ----------------
  heading(text) {
    const h = document.createElement('h3');
    h.textContent = text;
    this.body.appendChild(h);
  }

  slider(id, label, v, min, max, step, onInput) {
    const row = document.createElement('div');
    row.className = 'irow';
    row.innerHTML = `<label for="${id}">${label}</label><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${v}"><output>${this.fmt(v, step)}</output>`;
    const input = row.querySelector('input'), out = row.querySelector('output');
    input.addEventListener('input', () => { const n = Number(input.value); out.textContent = this.fmt(n, step); onInput(n); });
    this.body.appendChild(row);
  }

  checkbox(label, v, onChange) {
    const id = `cb-${Math.random().toString(36).slice(2, 8)}`;
    const row = document.createElement('div');
    row.className = 'irow';
    row.innerHTML = `<label for="${id}">${label}</label><input id="${id}" type="checkbox" ${v ? 'checked' : ''}>`;
    row.querySelector('input').addEventListener('change', (e) => onChange(e.target.checked));
    this.body.appendChild(row);
  }

  fmt(v, step) {
    const d = String(step).includes('.') ? String(step).split('.')[1].length : 0;
    return Number(v).toFixed(d);
  }

  flagRestart() { this.note.hidden = false; }

  reset() {
    if (this.tab === 'colliders') { resetColliders(Config.boss.layout); this.applyColliders(); }
    else { resetTuning(); this.flagRestart(); }
    this.build();
  }

  copy() {
    const text = JSON.stringify({ params: currentOverrides(), colliderLayouts: Config.colliderLayouts }, null, 2);
    this.copyText(text, document.getElementById('inspCopy'), '設定をコピー');
  }

  async copyText(text, btn, label) {
    try { await navigator.clipboard.writeText(text); btn.textContent = 'コピーしました'; }
    catch { btn.textContent = 'コピー不可'; console.log(text); }
    setTimeout(() => (btn.textContent = label), 1400);
  }

  open() {
    this.el.hidden = false;
    this.g.paused = true;
    this.note.hidden = true;
    this.g.setColliderView(true, 'inspector');
    this.build();
  }
  close() {
    this.el.hidden = true;
    this.g.paused = false;
    this.g.setColliderView(false, 'inspector');
  }
}
