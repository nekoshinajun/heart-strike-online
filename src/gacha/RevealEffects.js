/**
 * Character Gacha Reveal Effect:キャラクターごとの追加演出(ガチャ全体の流れとは分離)
 *   CharacterData.gachaReveal に ID を書くだけで、レアリティ共通の演出の「弾ける直前」にこの演出が差し込まれる
 *   (単発 / 10連の SSR 専用演出の両方。ALL OPEN・SKIP の短い流れでは出さない)
 *   各演出は director の道具だけを使う:wait(SKIP で止まる)/ fx(Canvas の粒)/ flash / phase / say / sfx
 *   新しいキャラの演出は、ここに1件足して CharacterData に ID を書くだけ
 */
export const REVEAL_EFFECTS = {
  /** ダークドラゴン(ヨルナ):ピンクゴールドのハート → 一瞬暗転 → 紫のドラゴン炎 → ハート型の光 */
  darkDragon: async (d) => {
    const c = d.center(), X = d.q('.gs-cfx');
    X.dataset.fx = 'darkDragon'; X.hidden = false; X.className = 'gs-cfx';
    d.phase('charfx');
    X.classList.add('dark'); d.sfx.play('heartbeat', 1.4);
    await d.wait(d.T('charFx.dark'));
    X.classList.add('flame'); d.say('ゴォッ…', 'big');
    d.fx.burst(c.x, c.y + 40, { colors: ['#b14dff', '#ff4f9a', '#ff9ad5', '#6b1f78', '#ffd0ea'], kinds: ['flame', 'flame', 'flame', 'heart'], count: 90, speed: 0.9, gravity: -0.12 });
    d.fx.ripple(c.x, c.y, '#b14dff', d.T('charFx.flame'));
    await d.wait(d.T('charFx.flame'));
    X.classList.add('heart'); d.flash('gold', 420); d.sfx.play('ssrConfirm');
    d.fx.ripple(c.x, c.y, '#ff9ccf', d.T('charFx.heart'));
    await d.wait(d.T('charFx.heart'));
    X.hidden = true; X.className = 'gs-cfx';
  },
};

/** そのキャラの追加演出(無ければ null)*/
export const revealEffectFor = (ch) => (ch?.gachaReveal && REVEAL_EFFECTS[ch.gachaReveal]) || null;
