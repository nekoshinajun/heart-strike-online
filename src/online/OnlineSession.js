import * as THREE from '../lib/three.js';
import { STAGES, CHARACTERS, ATTRIBUTES, RANKS } from '../data/GameData.js';
import { COLLECTION_SORTS, COLLECTION_FILTERS, currentSort, nextSort, sortList, currentFilter, filterList } from '../app/CollectionSort.js';
import { artUrl } from '../data/CharacterArt.js';
import { rarityAttr, rarityBadge, raritySparkle, charAccent } from '../app/Rarity.js';
import { GameState } from '../core/StateMachine.js';
import { openBattleDoor } from '../screens/DoorTransition.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export class OnlineSession{
 constructor(g){this.g=g;this.lastSeq=-1;this.pickSlot=0;this.pickOpen=false;this.pendingCatch=null;this.pendingThrow=null;this.catchPos=null;this.catchSeq=0;this.fieldPattern=null;this.fieldSeed=1;this.optimisticThrow=false;this.lastThrowFrom=null;this.throwResolved=true;this.phaseEnd=false;this.nextIndex=null;this.bossTurnPending=false;this.voiceRoll=null;this.install()}
 install(){this.root=document.createElement('div');this.root.id='onlineLobby';document.body.appendChild(this.root);this.root.innerHTML=`<div class="ol-card"><b>HEART STRIKE MULTI</b><div id="olMeta" class="ol-sub">2〜4人 MULTIPLAYER(いつも4キャラで攻略)</div><input id="olName" maxlength="16" value="PLAYER"><div class="ol-tabs"><button id="olPublic" class="sel">公開ルーム</button><button id="olPrivate">パスワード</button></div><input id="olPassword" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="4桁のパスワード" hidden><button id="olCreate">この条件で部屋を作る</button><button id="olBrowse" class="ol-secondary">公開ルームを探す</button><div id="olRooms"></div><button id="olJoin" class="ol-secondary" hidden>4桁のパスワードで参加</button><div id="olStatus"></div><div id="olPlayers"></div><div id="olMine" hidden></div><button id="olReady" hidden>READY</button><button id="olStart" hidden>START</button><button id="olClose" class="ol-secondary">戻る</button></div>`;this.root.style.display='none';for(const ev of ['pointerdown','pointermove','pointerup','touchstart','touchmove','touchend'])this.root.addEventListener(ev,e=>e.stopPropagation(),{passive:true});const wire=(sel,fn)=>{const el=this.root.querySelector(sel);if(!el)return;el.style.pointerEvents='auto';el.style.touchAction='manipulation';let lock=false;const fire=e=>{e?.preventDefault?.();e?.stopPropagation?.();if(lock)return;lock=true;Promise.resolve(fn()).finally(()=>setTimeout(()=>lock=false,250))};el.addEventListener('pointerup',fire);el.addEventListener('click',e=>{if(e.detail===0)fire(e)});};this.visibility='public';wire('#olPublic',()=>this.setVisibility('public'));wire('#olPrivate',()=>this.setVisibility('private'));wire('#olCreate',()=>this.create());wire('#olBrowse',()=>this.browse());wire('#olJoin',()=>this.join());wire('#olReady',()=>this.action('READY',{ready:true,profiles:Object.fromEntries(this.myCharacterIds().map(id=>[id,this.g.progress.combatProfile(id)]))}));wire('#olStart',()=>{const O=this.g.cfg.opening;return this.action('START',{openingMs:Math.round((O.fadeAt+O.fadeSec+O.startSec)*1000)})});wire('#olClose',()=>this.closeLobby());this.status('オンライン接続準備OK')}
 openLobby(stage,difficulty){this.stage=stage||STAGES[0];this.difficulty=difficulty||'NORMAL';this.root.style.display='flex';this.root.querySelector('#olMeta').textContent=`${this.stage.name} • ${this.difficulty} • 2〜4人`;this.status('公開ルームを作るか、探して参加できます');this.browse()}
 /** MULTI のゲームを終えてメニューへ戻る時:先にイベントを止めてから g.online を外し、ルームを抜ける */
 leaveGame(){if(this.g.online===this)this.g.online=null;this.updateSpectate();this.throwResolved=true;this.phaseEnd=false;this.bossTurnPending=false;this.nextIndex=null;this.es?.close();this.es=null;this.pendingThrow=null;this.pendingCatch=null;this.catchRoundDone=false;return this.closeLobby()}
 async closeLobby(){
  if(this.code&&this.token){try{await this.post('/api/room/action',{code:this.code,token:this.token,action:'LEAVE'})}catch{}}
  this.es?.close();this.es=null;this.code=null;this.token=null;this.playerId=null;this.room=null;this.lastSeq=-1;
  this.setRoomControlsLocked(false);this.root.style.display='none';this.root.querySelector('#olPlayers').innerHTML='';this.root.querySelector('#olRooms').innerHTML='';const mine=this.root.querySelector('#olMine');mine.hidden=true;mine.innerHTML='';delete mine.dataset.key;
 }
 setRoomControlsLocked(locked){for(const sel of ['#olName','.ol-tabs','#olPassword','#olCreate','#olBrowse','#olRooms','#olJoin']){const e=this.root.querySelector(sel);if(e)e.hidden=!!locked}}
 setVisibility(v){this.visibility=v;this.root.querySelector('#olPublic').classList.toggle('sel',v==='public');this.root.querySelector('#olPrivate').classList.toggle('sel',v==='private');this.root.querySelector('#olPassword').hidden=v!=='private';this.root.querySelector('#olJoin').hidden=v!=='private';this.root.querySelector('#olBrowse').hidden=v==='private';this.root.querySelector('#olRooms').hidden=v==='private'}
 async browse(){try{const j=await fetch('/api/rooms',{cache:'no-store'}).then(r=>r.json());const rooms=(j.rooms||[]).filter(r=>(!this.stage||r.stageId===this.stage.id)&&(!this.difficulty||r.difficulty===this.difficulty));const box=this.root.querySelector('#olRooms');box.innerHTML=rooms.length?rooms.map(r=>`<div class="ol-room"><div><b>${esc(r.hostName)}</b><br>${esc(r.stageId)} / ${esc(r.difficulty)}　👥 ${r.players}/4</div><button data-room="${r.code}">参加</button></div>`).join(''):'<div class="ol-sub">この条件の公開ルームはまだありません</div>';for(const b of box.querySelectorAll('[data-room]')){const go=e=>{e?.preventDefault?.();e?.stopPropagation?.();this.join(true,b.dataset.room)};b.addEventListener('pointerup',go);b.addEventListener('click',e=>{if(e.detail===0)go(e)})}}catch(e){this.status('部屋検索エラー: '+e.message)}}
 val(x){return this.root.querySelector(x).value} async post(u,d){let r=await fetch(u,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(d)}),j=await r.json();if(!r.ok)throw Error(j.error||r.status);return j}
 async create(){this.status('ルーム作成中…');try{const password=this.val('#olPassword');if(this.visibility==='private'&&!/^\d{4}$/.test(password)){this.status('パスワードは4桁の数字で入力してください');return}this.bind(await this.post('/api/room/create',{name:this.val('#olName'),characterIds:this.defaultPicks(),visibility:this.visibility,password,stageId:this.stage?.id,difficulty:this.difficulty}))}catch(e){console.error('[Online] create failed',e);this.status('作成エラー: '+e.message)}} async join(fromBrowse=false,publicCode=''){this.status('参加中…');try{const password=this.val('#olPassword');if(!fromBrowse&&!/^\d{4}$/.test(password)){this.status('パスワードは4桁の数字で入力してください');return}this.bind(await this.post('/api/room/join',{code:fromBrowse?publicCode:'',name:this.val('#olName'),characterIds:this.defaultPicks(),password:fromBrowse?'':password}))}catch(e){console.error('[Online] join failed',e);this.status('参加エラー: '+e.message)}}
 bind(j){this.pickSlot=0;this.pickOpen=false;this.code=j.room.code;this.token=j.token;this.playerId=j.playerId;this.room=j.room;this.connect();this.setRoomControlsLocked(true);this.render()}
 connect(){this.es?.close();this.es=new EventSource(`/api/events?code=${this.code}&token=${this.token}`);this.es.onmessage=e=>{let m=JSON.parse(e.data);if(m.seq!=null&&m.seq<this.lastSeq)return;this.lastSeq=m.seq??this.lastSeq;this.room=m.room||this.room;if(m.room?.field)this.setField(m.room.field);this.render();this.onEvent(m)};this.es.onerror=()=>this.status('再接続中…')}
 async action(action,extra={}){try{return await this.post('/api/room/action',{code:this.code,token:this.token,action,...extra})}catch(e){this.status(e.message)}} status(s){let e=this.root?.querySelector('#olStatus');if(e)e.textContent=s}
 render(){if(!this.room)return;const lobby=this.room.status==='LOBBY',cname=id=>esc(CHARACTERS.find(c=>c.id===id)?.name||id);
  this.status(`${this.room.visibility==='private'?'パスワードルーム':'公開ルーム'} • ${this.room.players.length}/4 • 4キャラで攻略`);
  // 参加人数で担当数が決まる(2人 = 2/2・3人 = ホスト2/1/1・4人 = 1/1/1/1)。各自の担当キャラを並べる
  this.root.querySelector('#olPlayers').innerHTML=this.room.players.map((p,n)=>{const ids=(p.characterIds||[]).slice(0,p.need||1);return `<div class="ol-player" data-pid="${esc(p.id)}"><i>${n+1}P</i><div>${esc(p.name)}${p.id===this.playerId?' <small>(YOU)</small>':''}<br><small>担当 ${p.need||1}キャラ:${ids.map(cname).join(' / ')||'未選択'}</small></div><span class="${p.ready?'ok':''}">${p.ready?'READY':'WAIT'}</span></div>`}).join('');
  const me=this.me(),box=this.root.querySelector('#olMine');box.hidden=!(lobby&&me);
  if(lobby&&me){const need=me.need||1,ids=this.myCharacterIds();
   // 担当数が増えた(協力者が抜けた等):足りない枠は自分の選んでいないキャラで埋めて知らせる(READY は選び直し)
   if((me.characterIds||[]).length<need&&!this.fillPending){const fill=[...ids];for(const id of this.defaultPicks(4)){if(fill.length>=need)break;if(!fill.includes(id))fill.push(id)}this.fillPending=true;this.action('CHARACTER',{characterIds:fill}).finally(()=>this.fillPending=false)}
   // 担当キャラは育成と同じカードで選ぶ。上の「1人目 / 2人目」が今選んでいる枠、下の一覧をタップでその枠に入れる
   if(this.pickSlot>=need)this.pickSlot=0;
   const others={};this.room.players.forEach((p,n)=>{if(p.id===this.playerId)return;for(const id of (p.characterIds||[]).slice(0,p.need||1))(others[id]||(others[id]=[])).push(`${n+1}P`)});
   const sort=this.pickSort();const key=`${need}|${ids.join(',')}|${this.pickSlot}|${JSON.stringify(others)}|${sort.key}.${sort.dir}|${this.pickFilter()}|${this.pickOpen}`;if(box.dataset.key!==key){box.dataset.key=key;const sc=box.querySelector('.ol-pickscroll')?.scrollTop||0;box.innerHTML=this.pickerHTML(need,ids,others);const sl=box.querySelector('.ol-pickscroll');if(sl)sl.scrollTop=sc;
    for(const el of box.querySelectorAll('[data-pickclose]'))this.tap(el,()=>{this.pickOpen=false;box.dataset.key='';this.render()});
    for(const el of box.querySelectorAll('[data-slot]'))this.tap(el,()=>{this.pickSlot=Number(el.dataset.slot);this.pickOpen=true;box.dataset.key='';this.render()});
    for(const el of box.querySelectorAll('[data-filter]'))this.tap(el,()=>{this.setPickFilter(el.dataset.filter);box.dataset.key='';this.render()});
    for(const el of box.querySelectorAll('[data-sort]'))this.tap(el,()=>{this.setPickSort(el.dataset.sort);box.dataset.key='';this.render()});
    for(const el of box.querySelectorAll('.tl-card[data-id]'))this.tap(el,()=>this.pickFromGrid(el.dataset.id))}}
  this.root.querySelector('#olReady').hidden=!lobby;this.root.querySelector('#olStart').hidden=!(lobby&&this.room.hostId===this.playerId&&this.room.players.length>=2&&this.room.players.every(p=>p.ready))}
 me(){return this.room?.players?.find(p=>p.id===this.playerId)??null}
 /** 自分の担当キャラ(参加人数で決まる数だけ)*/
 myCharacterIds(){const me=this.me();return (me?.characterIds||[]).slice(0,me?.need||1)}
 /** 担当キャラを選ぶ(同じプレイヤーの担当は重複なし。もう一方と同じなら入れ替える)*/
 /** 最初の担当候補:育成の編成順 → 所持キャラ → 全キャラ */
 defaultPicks(n=2){const P=this.g.progress,out=[];for(const id of [...(P?.party||[]).filter(x=>P.isOwned(x)),...(P?.ownedIds||[]),...CHARACTERS.map(c=>c.id)])if(!out.includes(id))out.push(id);return out.slice(0,n)}
 /** 並び替え:コレクションの「仲間」と同じ項目(CollectionSort の ally)。選んだ条件は settings.multiSort に保存 */
 pickSort(){return currentSort({collectionSort:{ally:this.g.progress?.data?.settings?.multiSort}},'ally')}
 setPickSort(k){const P=this.g.progress;if(!P?.data)return;P.data.settings.multiSort=nextSort(this.pickSort(),'ally',k);P.save?.()}
 /** 絞り込み:コレクション / 育成と同じレアリティ。settings.multiFilter に保存 */
 pickFilter(){return currentFilter({collectionFilter:{ally:this.g.progress?.data?.settings?.multiFilter}},'ally')}
 setPickFilter(k){const P=this.g.progress;if(!P?.data)return;P.data.settings.multiFilter=k;P.save?.()}
 pickRow(id){const P=this.g.progress,ch=P.character(id);return {id,name:ch.name,rank:ch.rank,level:ch.level,rankOrder:RANKS[ch.rank]?.order??null,atk:(ch.totalStats??ch.stats)?.attack??0,hp:ch.maxHp,obtainedAt:P.data?.characters?.[id]?.obtainedAt??null}}
 /** 一覧の並び:所持キャラ → 未所持(それぞれ選んだ条件で並べる)*/
 pickerIds(){const P=this.g.progress,own=P?.ownedIds||[],sort=this.pickSort(),f=this.pickFilter(),by=ids=>sortList(filterList(ids.map(id=>this.pickRow(id)),'ally',f),'ally',sort).map(r=>r.id);return [...by(own),...by(CHARACTERS.map(c=>c.id).filter(id=>!own.includes(id)))]}
 pickSortHTML(){const sort=this.pickSort();return `<div class="ol-sorts" role="group" aria-label="並び替え"><small>⇅ 並び替え</small>${COLLECTION_SORTS.ally.options.map(o=>{const on=o.key===sort.key;return `<button type="button" class="ol-sort${on?' sel':''}" data-sort="${o.key}" aria-pressed="${on}">${esc(o.label)}${on?`<i>${o.dirs?(sort.dir==='desc'?'↓':'↑'):''}</i>`:''}</button>`}).join('')}</div><div class="ol-sorts" role="group" aria-label="絞り込み"><small>▽ 絞り込み</small>${COLLECTION_FILTERS.ally.map(f=>{const on=f.key===this.pickFilter();return `<button type="button" class="ol-sort${on?' sel':''}" data-filter="${esc(f.key)}" aria-pressed="${on}">${esc(f.label)}</button>`}).join('')}</div>`}
 /** キャラ選択カード(育成の .tl-card と同じ見た目。✓番号 = 自分の担当枠 / ◯P = 他のプレイヤーが担当)*/
 pickCardHTML(id,{slot=-1,others=[]}={}){const ch=this.g.progress.character(id),a=ATTRIBUTES[ch.attribute]||{},sk=this.pickSort().key,val=sk==='atk'?`<span class="col-val">ATK <b>${(ch.totalStats??ch.stats)?.attack??0}</b></span>`:sk==='hp'?`<span class="col-val">HP <b>${ch.maxHp}</b></span>`:'';return `<button type="button" class="tl-card rar-frame${slot>=0?' in':''}${ch.owned?'':' ol-unowned'}" data-id="${esc(id)}" ${rarityAttr(ch.rank)} style="--ac:${a.color||'#ff5fa2'}" aria-pressed="${slot>=0}" aria-label="${esc(ch.name)}${slot>=0?`(${slot+1}人目)`:''}"><span class="tl-art"><img src="${artUrl(ch,'cutout')}" alt="" draggable="false" loading="lazy"></span>${rarityBadge(ch.rank,'tl-rank')}${raritySparkle(ch.rank)}${charAccent(ch)}${slot>=0?`<span class="tl-in"><i>✓</i>${slot+1}</span>`:''}${others.length?`<span class="ol-other">${others.join(' ')}</span>`:''}${ch.owned?'':'<span class="ol-own">未所持</span>'}${val}<span class="tl-info"><b class="tl-name">${esc(ch.name)}</b><span class="tl-lv">Lv.<b>${ch.level}</b></span><span class="tl-type">${a.icon||''} ${a.label||''}</span></span></button>`}
 /** ロビー:担当の枠(1人目 / 2人目)だけ並べ、枠をタップするとキャラ一覧のパネルが開く(キャラが増えてもロビーは長くならない)*/
 pickerHTML(need,ids,others){const slot=(k,inPanel)=>{const ch=ids[k]?this.g.progress.character(ids[k]):null,on=inPanel&&k===this.pickSlot;return `<button type="button" class="ol-slot${on?' sel':''}" data-slot="${k}"><span class="ol-face"${ch?` style="background-image:url('${artUrl(ch,'cutout')}')"`:''}></span><span><small>${k+1}人目${on?' ・ 選択中':''}</small><b>${ch?esc(ch.name):'未選択'}</b></span>${inPanel?'':'<i class="ol-chg" aria-hidden="true">変更 ›</i>'}</button>`};const slots=inPanel=>`<div class="ol-slots" style="--n:${need}">${Array.from({length:need},(_,k)=>slot(k,inPanel)).join('')}</div>`;
  const panel=this.pickOpen?`<div class="ol-pickpanel" role="dialog" aria-label="${this.pickSlot+1}人目のキャラを選ぶ"><div class="ol-pickhead"><b>${need>1?`${this.pickSlot+1}人目`:'担当キャラ'}を選ぶ</b><button type="button" class="ol-pickclose" data-pickclose aria-label="閉じる">✕</button></div>${need>1?slots(true):''}${this.pickSortHTML()}<div class="ol-pickscroll">${(l=>l.length?`<div class="ol-grid">${l.map(id=>this.pickCardHTML(id,{slot:ids.indexOf(id),others:others[id]||[]})).join('')}</div>`:'<div class="ol-sub">この条件のキャラクターはいません</div>')(this.pickerIds())}</div></div>`:'';
  return `<div class="ol-sub">あなたの担当:${need}キャラ ・ 枠をタップで変更</div>${slots(false)}${panel}`}
 /** 一覧のカードをタップ:選んでいる枠に入れてパネルを閉じる(もう一方の枠のキャラなら入れ替え)*/
 pickFromGrid(id){const me=this.me();if(!me)return;const k=this.pickSlot||0;this.pickOpen=false;const box=this.root.querySelector('#olMine');if(box)box.dataset.key='';if(this.myCharacterIds()[k]===id){this.render();return}this.render();return this.pickCharacter(k,id)}
 /** スクロールと区別したタップ(ロビーは pointer イベントを外へ流さないので pointerup で拾う)*/
 tap(el,fn){el.style.pointerEvents='auto';el.style.touchAction='pan-y';let x=0,y=0,down=false;el.addEventListener('pointerdown',e=>{down=true;x=e.clientX;y=e.clientY});el.addEventListener('pointerup',e=>{if(!down)return;down=false;if(Math.hypot(e.clientX-x,e.clientY-y)>10)return;e.preventDefault();e.stopPropagation();fn()});el.addEventListener('pointercancel',()=>down=false);el.addEventListener('click',e=>{if(e.detail===0)fn()})}
 pickCharacter(k,id){const me=this.me();if(!me)return;const ids=[...(me.characterIds||[])];const j=ids.indexOf(id);if(j>=0&&j!==k)ids[j]=ids[k];ids[k]=id;return this.action('CHARACTER',{characterIds:ids.filter(Boolean)})}
 /** 自分が担当するキャラの index(A→D の並び。room.units)*/
 myUnitIndexes(){return (this.room?.units||[]).map((u,i)=>u.ownerId===this.playerId?i:-1).filter(i=>i>=0)}
 onEvent(m){if(m.type==='GAME_START')this.startGame(m.field,m)
  // SPECIAL ゲージ(キャラごと):他のプレイヤーのキャラの値はサーバーの値に合わせる。必殺技を使ったキャラは 0
  if(m.type==='THROW'&&m.special&&m.fromPlayerId!==this.playerId)this.g.energy?.applyRemote(m.fromIndex,0)
  if(this.room?.status==='PLAYING')this.syncSpecial();if(m.type==='THROW'){this.lastThrowFrom=m.fromPlayerId;this.throwResolved=true;this.phaseEnd=!!m.phaseEnd;this.nextIndex=Number.isInteger(m.nextIndex)?m.nextIndex:null;if(m.phaseEnd){this.voiceRoll=Number.isFinite(m.voiceRoll)?m.voiceRoll:null;if(Number.isFinite(m.bossAttacks))this.bossAttacks=m.bossAttacks;}this.setField(m.field||{pattern:m.fieldPattern,seed:m.fieldSeed,catchPos:m.catchPos});this.catchSeq=Number(m.catchSeq)||this.catchSeq;if(m.fromPlayerId===this.playerId){this.optimisticThrow=false}else this.remoteThrow(m);}if(m.type==='CATCH_ROUND'){this.catchRoundDone=true;this.syncHealth();if(m.nextField)this.setField(m.nextField);this.finishCatchRound(m);}if(m.type==='GAME_OVER'){this.syncHealth();this.g.ball?.hide?.();this.g.sm.change(GameState.GAME_OVER);}if(m.type==='CATCH_PLAYER'){this.syncHealth();}if(m.type==='HEAL'){this.syncHealth();const healed=(m.healed||[]).map(h=>({i:h.i,before:h.before,after:h.after,gained:h.after-h.before}));if(m.kind==='item')this.g.ui?.playItemHeal?.(healed);else if(m.amount>0)this.g.ui?.playAngelHeal?.({type:'healAll',amount:m.amount,healed});}if(m.type==='BOSS_TURN'){this.voiceRoll=Number.isFinite(m.voiceRoll)?m.voiceRoll:null;if(Number.isFinite(m.bossAttacks))this.bossAttacks=m.bossAttacks;this.setField(m.field||{pattern:m.fieldPattern,seed:m.fieldSeed,catchPos:m.catchPos});this.catchSeq=Number(m.catchSeq)||this.catchSeq;this.bossTurnPending=true}if(m.type==='PLAYER_CONNECTION'&&m.connected===false)this.remoteDisconnect(m);if(m.type==='PLAYER_DOWN')this.remoteDown(m);if(m.type==='NOTE_JUDGE')this.remoteNoteJudge(m);this.updateSpectate()}
 /** 観戦(自分のキャラが全員 DOWN):画面を少し灰色にして「観戦中」を出す。見ている仲間 = 生き残っている先頭のプレイヤー */
 spectateTarget(){const alive=(this.room?.players||[]).filter(p=>p.id!==this.playerId&&p.alive!==false&&p.connected!==false);if(!alive.some(p=>p.id===this.watchId))this.watchId=alive[0]?.id??null;return alive.find(p=>p.id===this.watchId)??null}
 spectateLabel(){const t=this.spectateTarget();return t?`${t.name} の画面を観戦中`:'観戦中'}
 updateSpectate(){const on=!!this.g.online&&this.room?.status==='PLAYING'&&this.isDown();const game=document.getElementById('game');if(!game)return;game.classList.toggle('spectating',on);let b=document.getElementById('spectateBanner');if(!on){if(b)b.hidden=true;return}if(!b){b=document.createElement('div');b.id='spectateBanner';(document.getElementById('ui')||game).appendChild(b)}b.hidden=false;const t=this.spectateTarget();b.innerHTML=`<b>観戦中</b><span>${t?`${esc(t.name)} の画面`:'仲間の画面'}</span>`}
 /** 観戦中:見ている仲間のハート1個ずつの判定を、その人の画面と同じように出す */
 remoteNoteJudge(m){if(!this.isDown()||m.playerId!==this.spectateTarget()?.id)return;const C={PERFECT:'#ffd23e',GREAT:'#3ee8ff',GOOD:'#9dff7a',MISS:'#ff3d5a'};const g=String(m.grade||'');if(!C[g])return;const name=this.spectateTarget()?.name??'';this.g.ui?.showJudge?.(g,g.toLowerCase(),C[g],`${name}${m.n>1?` ・ ${m.k+1} / ${m.n}`:''}`)}
 /** 自分の判定(ハート1個ずつ)を観戦中の仲間へ。DOWN の人がいる時だけ送る */
 sendNoteJudge(k,n,grade){if(this.isDown()||!this.room?.players?.some(p=>p.alive===false&&p.connected!==false))return;this.action('NOTE',{k,n,grade})}
 startGame(field,m={}){this.root.style.display='none';this.g.online=this;this.bossAttacks=null;this.setField(field);this.throwResolved=true;this.phaseEnd=false;this.bossTurnPending=false;this.nextIndex=null;this.catchRoundDone=false;
  const stage=STAGES.find(s=>s.id===this.room.stageId)||this.stage||STAGES[0];this.g.setDifficulty(this.room.difficulty||this.difficulty||'NORMAL');
  // すぐインゲームへ:バトル BGM → ボス紹介(長さはサーバーが配った openingMs。全員同じ)→ BATTLE START。サーバーもその時刻まで投球を受け付けない
  // パーティは必ず4キャラ(room.units:A→B→C→D)。自分の担当キャラは自分のセーブ、他のプレイヤーの担当キャラはその人の育成(profile)で。自分のセーブとは混ぜない
  const party=(this.room.units||[]).map(u=>u.ownerId===this.playerId&&this.g.progress.isOwned(u.characterId)?this.g.progress.character(u.characterId):this.g.progress.characterFromProfile(u.characterId,u.profile));this.g.menu.stage=stage;
  this.g.startStage(stage,party,{openingSec:Number.isFinite(m.openingMs)?m.openingMs/1000:null});
  openBattleDoor(this.g,stage);   // 攻略開始 = お店の中へ:光の扉が開いてインゲーム(SOLO と同じ)
  const i=this.room?.currentIndex??0;if(i>=0&&this.g.turn.players[i]){this.g.turn.setIndex(i);this.g.applyCharacter(this.g.turn.current);}
  this.syncHealth()}
 syncHealth(){if(!this.room?.units||!this.g?.turn?.players)return;let downs=0;this.room.units.forEach((u,i)=>{const lp=this.g.turn.players[i];if(!lp)return;const was=lp.hp;lp.maxHp=u.maxHp||100;lp.hp=Number.isFinite(u.hp)?u.hp:(u.alive===false?0:lp.hp);if(was>0&&!(lp.hp>0)&&this.room.status==='PLAYING'&&u.ownerId!==this.playerId)downs++;lp.ownerId=u.ownerId;lp.mine=u.ownerId===this.playerId;lp.ownerName=this.room.players.find(p=>p.id===u.ownerId)?.name??null});if(downs)setTimeout(()=>this.g.audio?.allyDown?.(),450);/* 仲間のキャラの HP が 0 になった音(自分の担当は DefenseStates で鳴らす)*/this.g.ui?.setPlayers?.(this.g.turn.players,this.g.turn.index)}
 setField(f){if(!f)return;this.fieldPattern=f.pattern||this.fieldPattern;this.fieldSeed=Number(f.seed)||this.fieldSeed;this.setCatchPosition(f.catchPos,this.catchSeq)}
 setCatchPosition(pos,seq){this.catchPos=pos&&Number.isFinite(pos.x)&&Number.isFinite(pos.y)?{x:pos.x,y:pos.y}:null;this.catchSeq=Number(seq)||0} consumeCatchPosition(){const p=this.catchPos;this.catchPos=null;return p} serialize(th){return {power:th.power,pull:th.pull??null,spin:th.spin,throwSpin:th.throwSpin??th.spin,curveDir:th.curveDir,curveStrength:th.curveStrength,effects:(th.effects||[]).map(e=>({...e})),drive:th.drive?{...th.drive}:null,strong:!!th.strong,start:[th.start.x,th.start.y,th.start.z],velocity:[th.velocity.x,th.velocity.y,th.velocity.z],curveAccel:th.curveAccel?[th.curveAccel.x,th.curveAccel.y,th.curveAccel.z]:null,direction:th.direction?[th.direction.x,th.direction.y,th.direction.z]:null}}
 deserialize(d){return {...d,start:new THREE.Vector3(...d.start),velocity:new THREE.Vector3(...d.velocity),curveAccel:d.curveAccel?new THREE.Vector3(...d.curveAccel):null,direction:d.direction?new THREE.Vector3(...d.direction):null}}
 sendThrow(th,special=false){this.lastThrowFrom=this.playerId;this.optimisticThrow=true;this.throwResolved=false;this.action('THROW',{throwData:this.serialize(th),special:!!special}).then(r=>{if(!r?.ok)this.optimisticThrow=false});return true}
 applyRemoteThrow(m){this.pendingThrow=null;this.g.lastThrowMine=false;this.g.sm.change(GameState.BALL_TO_BOSS,{th:this.deserialize(m.throwData),flick:{speed:0,dx:0,dy:0},special:m.special?{...this.g.cfg.special}:null})}
 remoteThrow(m){if(this.g.sm.currentName===GameState.PLAYER_ATTACK)this.applyRemoteThrow(m);else this.pendingThrow=m}
 remoteDisconnect(m){if(!this.room||this.room.status!=='PLAYING')return}
 remoteDown(m){
  if(!this.g?.turn?.players)return;
  (this.room.units||[]).forEach((u,i)=>{if(u.ownerId===m.playerId&&this.g.turn.players[i])this.g.turn.players[i].hp=0});   // 抜けた人の担当キャラは全員戦闘不能
  this.g.ui?.setPlayers?.(this.g.turn.players,this.g.turn.index);
  if(Number.isInteger(m.nextIndex))this.nextIndex=m.nextIndex;   // 代わりに投げるキャラ(サーバーが決めた)
  if(!m.disconnected)return;
  this.syncHealth();
  if(this.g.sm.currentName===GameState.PLAYER_ATTACK){
    const ni=Number.isInteger(m.nextIndex)?m.nextIndex:-1;
    if(ni>=0&&this.g.turn.players[ni]){this.g.turn.index=ni;this.g.applyCharacter(this.g.turn.current);this.g.ui?.setPlayers?.(this.g.turn.players,this.g.turn.index);this.g.energy?.onTurn();}
  }
 } /** SPECIAL ゲージ:自分の担当キャラの値をサーバーへ(サーバーが全員へ配る)*/
 sendSpecialGauge(i,value){return this.action('SPECIAL_GAUGE',{index:i,value})}
 /** サーバーの SPECIAL ゲージ(characterId のキー)を自分以外の担当キャラへ反映。自分のキャラは自分の値が正(サーバーより新しいことがある)*/
 syncSpecial(){const sg=this.room?.specialGauges,e=this.g?.energy
if(!sg||!e?.gauges)return
let changed=false
e.gauges.entries.forEach((x,i)=>{if(this.room.units?.[i]?.ownerId===this.playerId||!(x.key in sg))return
if(x.value!==sg[x.key]){e.gauges.set(i,sg[x.key]);changed=true}})
if(changed)e.refreshUI()}
 sendItemHeal(ratio,index){return this.action('ITEM_HEAL',{ratio,index})}  // 回復アイテム(投げた人だけ。1投に1回。回復するのは投げたキャラ index だけ)。サーバーが HP を確定して HEAL(kind:'item')を配る
 sendHeal(amount){return this.action('HEAL',{amount})}  // SPECIAL の回復(投げた人だけ)。サーバーが全員の HP を確定して HEAL を配る
 sendCatch(deltaMs,grade,damages={}){return this.action('CATCH',{deltaMs,grade,damages})} sendDown(){return this.action('PLAYER_DOWN')} beginAllCatch(){this.catchRoundDone=false;const mine=this.myUnitIndexes();const i=mine.find(k=>this.g.turn.players[k]?.hp>0)??mine[0]??-1;if(i>=0&&this.g.turn.players[i]){this.g.turn.index=i;this.g.applyCharacter(this.g.turn.current);this.g.ui.setPlayers(this.g.turn.players,i);this.g.energy?.onTurn()}} finishCatchRound(m){const i=Number.isInteger(m.nextIndex)&&this.g.turn.players[m.nextIndex]?m.nextIndex:-1;const st=this.g.sm.currentName;
  // 全員のキャッチが終わった → 次の PLAYER ATTACK PHASE(先頭の投球者はサーバーが決める)。メロメロ(DOWN)で観戦中の人も止まらずに進む
  const go=st===GameState.PLAYER_CATCH||(this.isDown()&&[GameState.BOSS_TAUNT,GameState.BOSS_RETURN,GameState.PLAYER_DEFENSE].includes(st));
  if(go){this.catchRoundDone=false;this.g.sm.change(GameState.NEXT_PLAYER,{to:i>=0?i:this.g.turn.index,phase:true})}}
 /** 次に投げるキャラ(サーバーが THROW で知らせた)の index(A→D)*/
 nextThrowerIndex(){const i=this.nextIndex??this.room?.currentIndex;return Number.isInteger(i)&&this.g.turn.players[i]?i:this.g.turn.index}
 /** 50% 会話を始めてよいか(この投球でフェーズが終わらない = 回答の1投を投げる人がいる)*/
 remoteCatch(m){} update(){
  // 投げる前の人が抜けてフェーズが終わった:サーバーの BOSS_TURN でボスの反撃へ
  if(this.bossTurnPending&&this.g.sm.currentName===GameState.PLAYER_ATTACK&&!this.pendingThrow){this.bossTurnPending=false;this.phaseEnd=false;this.g.sm.change(GameState.BOSS_TAUNT);return}
  if(this.pendingThrow&&this.g.sm.currentName===GameState.PLAYER_ATTACK){const m=this.pendingThrow;this.applyRemoteThrow(m);return}
  if(!this.pendingCatch)return;let s=this.g.sm.current;if(this.g.sm.currentName===GameState.PLAYER_DEFENSE&&!s.result){const m=this.pendingCatch;this.pendingCatch=null;s.decide(m.grade)}
 }
 /** 今投げるキャラの担当が自分か */
 isMyTurn(){return this.room?.units?.[this.room.currentIndex]?.ownerId===this.playerId} isDown(){return this.room?.players.find(p=>p.id===this.playerId)?.alive===false}
}
