import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const PORT=Number(process.env.PORT||8787);
const rooms=new Map();
const clients=new Map();
const now=()=>Date.now();
const code=()=>String(Math.floor(100000+Math.random()*900000));
const id=()=>crypto.randomBytes(9).toString('base64url');
const FIELD_PATTERNS=["STRAIGHT_LINE","LEFT_CURVE","RIGHT_CURVE","HIGH_ARC","LOW_ROUTE","S_CURVE","GATE_CHAIN","BANK_STARS"];
const makeField=()=>({pattern:FIELD_PATTERNS[crypto.randomInt(0,FIELD_PATTERNS.length)],seed:crypto.randomInt(1,2147483647),catchPos:{x:0.15+Math.random()*0.70,y:0.20+Math.random()*0.60}});
const aliveConnected=r=>r.players.filter(p=>p.alive!==false&&p.connected!==false);
// MULTI のパーティは参加人数にかかわらず必ず 4キャラ(units)。担当数:2人 = 2/2、3人 = ホスト2/1/1、4人 = 1/1/1/1(1人だけの間は 2)
const SHARES={1:[2],2:[2,2],3:[2,1,1],4:[1,1,1,1]};
const need=(r,i)=>(SHARES[r.players.length]||SHARES[4])[i]??1;
const cleanChars=l=>{const out=[];for(const c of Array.isArray(l)?l:[l]){const x=String(c||'');if(/^[a-z0-9_-]{1,32}$/.test(x)&&!out.includes(x))out.push(x)}return out.slice(0,2)};
/** 人数が変わった:担当数が足りなくなった人は READY を外す(選び直してもらう)*/
function fitShares(r){r.players.forEach((p,i)=>{if(p.characterIds.length<need(r,i))p.ready=false})}
/** GAME START:各プレイヤーの担当キャラを交互に並べて A→B→C→D(2人 = ホスト1・協力1・ホスト2・協力2 / 3人 = ホスト1・協力1・協力2・ホスト2)*/
function buildUnits(r){const lists=r.players.map((p,i)=>p.characterIds.slice(0,need(r,i)));const units=[];for(let k=0;k<2;k++)lists.forEach((l,i)=>{if(l[k]&&units.length<4){const p=r.players[i];units.push({slot:'ABCD'[units.length],ownerId:p.id,characterId:l[k],profile:p.profiles?.[l[k]]||null,hp:100,alive:true})}});return units}
// 1ターン = PLAYER ATTACK PHASE(生存しているキャラが A→B→C→D の順に1投ずつ。投げるのは担当のプレイヤー)→ ボスがまとめて反撃(全員同時キャッチ)
const playable=p=>p&&p.alive!==false&&p.connected!==false;
const unitPlayable=(r,u)=>u&&u.alive!==false&&playable(r.players.find(p=>p.id===u.ownerId));
const nextUnthrown=r=>{const done=new Set(r.phaseThrown||[]);const us=r.units||[];for(let i=0;i<us.length;i++)if(unitPlayable(r,us[i])&&!done.has(i))return i;return -1};
const ownerAt=(r,i)=>r.units?.[i]?.ownerId??null;
/** プレイヤーが抜けた / DOWN:そのプレイヤーの担当キャラを全員戦闘不能に */
function killPlayer(r,p){p.alive=false;p.hp=0;for(const u of r.units||[])if(u.ownerId===p.id){u.alive=false;u.hp=0}}
/** フェーズの最後:キャッチラウンドを開く(catchExpected = 生存・接続中の全員)*/
function openCatchRound(r){r.phase='WAIT_CATCH';r.voiceRoll=crypto.randomInt(0,2147483647);/* ボスの攻撃ボイスの抽選用(全員が同じボイスを選ぶ)*/r.catchSeq=(r.catchSeq||0)+1;r.catchExpected=aliveConnected(r).map(x=>x.id);r.catchResults={};r.phaseThrown=[];}
/** 投げる番の人がいなくなった(切断 / DOWN):次の未投球者へ。いなければボスの反撃(BOSS_TURN)*/
function advanceThrower(r,extra={}){
  const n=nextUnthrown(r);
  if(n>=0){r.currentIndex=n;r.phase='WAIT_THROW';return {nextIndex:n,nextPlayerId:ownerAt(r,n)}}
  if(!aliveConnected(r).length)return {gameOver:true};
  openCatchRound(r);
  send(r,'BOSS_TURN',{voiceRoll:r.voiceRoll,field:r.field,catchPos:r.field?.catchPos,fieldPattern:r.field?.pattern,fieldSeed:r.field?.seed,catchSeq:r.catchSeq,eventId:id(),serverTime:now(),...extra});
  return {bossTurn:true};
}
function finishCatchRound(r){
  r.catchExpected=(r.catchExpected||[]).filter(pid=>{const p=r.players.find(x=>x.id===pid);return p&&p.alive!==false&&p.connected!==false});
  const pending=r.catchExpected.filter(pid=>!r.catchResults?.[pid]);
  if(pending.length)return false;
  if(!aliveConnected(r).length){r.status='GAME_OVER';r.phase='GAME_OVER';send(r,'GAME_OVER',{results:r.catchResults||{},eventId:id(),serverTime:now()});return true;}
  r.phaseThrown=[];
  const first=nextUnthrown(r);
  if(first>=0)r.currentIndex=first;
  r.phase='WAIT_THROW';r.field=makeField();send(r,'CATCH_ROUND',{results:r.catchResults||{},nextIndex:r.currentIndex,nextPlayerId:ownerAt(r,r.currentIndex),nextField:r.field,eventId:id(),serverTime:now()});return true;
}
/** バトル中にプレイヤーが抜けた / DOWN / 切断:担当キャラを戦闘不能に → 投げる番だったら次のキャラ(いなければボスの反撃)*/
function dropFromBattle(r,p,extra={}){
  const wasCurrent=ownerAt(r,r.currentIndex)===p.id;killPlayer(r,p);
  if(r.phase==='WAIT_CATCH'){send(r,'PLAYER_DOWN',{playerId:p.id,...extra});finishCatchRound(r);return}
  const others=aliveConnected(r).filter(x=>x.id!==p.id||!extra.left);
  const adv=wasCurrent?advanceThrower(r):(others.length?{}:{gameOver:true});
  if(adv.gameOver){r.status='GAME_OVER';r.phase='GAME_OVER';send(r,'GAME_OVER',{eventId:id(),serverTime:now()});return}
  send(r,'PLAYER_DOWN',{playerId:p.id,nextIndex:adv.bossTurn?null:r.currentIndex,nextPlayerId:adv.bossTurn?null:ownerAt(r,r.currentIndex),wasCurrent,bossTurn:!!adv.bossTurn,...extra});
}
/** 育成の戦闘データ(各プレイヤーが自分のセーブから送る):Lv / ステータス / アビリティ ID だけ */
function cleanProfile(x){const n=(v,a,b)=>Math.max(a,Math.min(b,Math.round(Number(v)||0)));const st=x&&typeof x.stats==='object'?x.stats:{};return {level:n(x?.level,1,100),stats:{attack:n(st.attack,0,100),defence:n(st.defence,0,100),control:n(st.control,0,100),curve:n(st.curve,0,100)},abilities:(Array.isArray(x?.abilities)?x.abilities:[]).filter(a=>typeof a==='string'&&a.length<=40).slice(0,12)};}
function pub(r){return {code:r.code,status:r.status,hostId:r.hostId,currentIndex:r.currentIndex,seq:r.seq,field:r.field||null,visibility:r.visibility||'private',stageId:r.stageId||null,difficulty:r.difficulty||'NORMAL',units:(r.units||[]).map(u=>({slot:u.slot,ownerId:u.ownerId,characterId:u.characterId,profile:u.profile,alive:u.alive!==false,hp:Number.isFinite(u.hp)?u.hp:100,maxHp:100})),players:r.players.map((p,i)=>({id:p.id,name:p.name,characterId:p.characterIds[0]||null,characterIds:p.characterIds,need:need(r,i),ready:p.ready,connected:p.connected,slot:p.slot,alive:p.alive!==false,hp:Number.isFinite(p.hp)?p.hp:100,maxHp:100}))};}
function send(room,type,data={}){room.seq++;const msg=`event: message\ndata: ${JSON.stringify({type,seq:room.seq,room:pub(room),...data})}\n\n`;for(const p of room.players){const set=clients.get(p.id);if(set)for(const res of set){try{res.write(msg)}catch{}}}}
function json(res,status,obj){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(obj));}
async function body(req){let s='';for await(const c of req){s+=c;if(s.length>1e6)throw Error('too large')}return s?JSON.parse(s):{};}
function roomOf(c){return rooms.get(String(c||''));}
function privateRoomByPassword(password){const s=String(password||'');if(!/^\d{4}$/.test(s))return null;const h=crypto.createHash('sha256').update(s).digest('hex');return [...rooms.values()].find(r=>r.status==='LOBBY'&&r.visibility==='private'&&r.password===h)||null;}
function player(r,t){return r?.players.find(p=>p.token===t);}
function cleanup(){for(const [c,r] of rooms)if(now()-r.touched>2*60*60*1000){rooms.delete(c);}}
setInterval(cleanup,60000).unref();
const server=http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://x');
 if(u.pathname==='/health')return json(res,200,{ok:true,rooms:rooms.size});
 if(u.pathname==='/api/rooms'&&req.method==='GET'){const list=[...rooms.values()].filter(r=>r.status==='LOBBY'&&r.visibility==='public'&&r.players.length<4).map(r=>({code:r.code,stageId:r.stageId,difficulty:r.difficulty,hostName:r.players[0]?.name||'HOST',players:r.players.length,maxPlayers:4,createdAt:r.createdAt||r.touched}));return json(res,200,{rooms:list});}
 if(u.pathname==='/api/room/create'&&req.method==='POST'){const b=await body(req);let c;do c=code();while(rooms.has(c));const pid=id(),token=id();const visibility=b.visibility==='public'?'public':'private';if(visibility==='private'&&!/^\d{4}$/.test(String(b.password||'')))return json(res,400,{error:'PASSWORD_MUST_BE_4_DIGITS'});if(visibility==='private'&&privateRoomByPassword(b.password))return json(res,409,{error:'PASSWORD_IN_USE'});const password=visibility==='private'?crypto.createHash('sha256').update(String(b.password)).digest('hex'):null;const r={code:c,status:'LOBBY',hostId:pid,currentIndex:0,seq:0,touched:now(),createdAt:now(),catchSeq:0,visibility,password,stageId:String(b.stageId||'stage1'),difficulty:String(b.difficulty||'NORMAL'),players:[{id:pid,token,name:(b.name||'HOST').slice(0,16),characterIds:cleanChars(b.characterIds??b.characterId??'minamo'),profiles:{},ready:false,connected:true,alive:true,hp:100,slot:'A'}]};rooms.set(c,r);return json(res,200,{token,playerId:pid,room:pub(r)});}
 if(u.pathname==='/api/room/join'&&req.method==='POST'){const b=await body(req),r=b.code?roomOf(b.code):privateRoomByPassword(b.password);if(!r||r.status!=='LOBBY')return json(res,404,{error:'ROOM_NOT_FOUND'});if(r.visibility==='private'&&!/^\d{4}$/.test(String(b.password||'')))return json(res,403,{error:'PASSWORD_MUST_BE_4_DIGITS'});if(r.password&&crypto.createHash('sha256').update(String(b.password||'')).digest('hex')!==r.password)return json(res,403,{error:'PASSWORD_REQUIRED'});if(r.players.length>=4)return json(res,409,{error:'ROOM_FULL'});const pid=id(),token=id();r.players.push({id:pid,token,name:(b.name||'PLAYER').slice(0,16),characterIds:cleanChars(b.characterIds??b.characterId??'hinoka'),profiles:{},ready:false,connected:true,alive:true,hp:100,slot:'ABCD'[r.players.length]});fitShares(r);r.touched=now();send(r,'PLAYER_JOINED');return json(res,200,{token,playerId:pid,room:pub(r)});}
 if(u.pathname==='/api/room/action'&&req.method==='POST'){const b=await body(req),r=roomOf(b.code),p=player(r,b.token);if(!r||!p)return json(res,403,{error:'BAD_SESSION'});r.touched=now();
   if(b.action==='LEAVE'){
     const leavingId=p.id,wasHost=r.hostId===p.id;
     const set=clients.get(p.id);if(set)for(const x of set){try{x.end()}catch{}}clients.delete(p.id);
     if(r.status==='PLAYING'&&r.players.length>1){dropFromBattle(r,p,{left:true});}   // バトル中:担当キャラは戦闘不能 → 次の投球者 / ボスの反撃へ
     r.players=r.players.filter(x=>x.id!==p.id);
     if(!r.players.length){rooms.delete(r.code);return json(res,200,{ok:true,deleted:true});}
     r.players.forEach((x,i)=>x.slot='ABCD'[i]);
     if(wasHost)r.hostId=r.players[0].id;
     if(r.status==='LOBBY'){r.currentIndex=0;fitShares(r);}
     r.touched=now();send(r,'PLAYER_LEFT',{playerId:leavingId,newHostId:r.hostId});
     return json(res,200,{ok:true});
   }
   if(b.action==='READY'){if(r.status!=='LOBBY')return json(res,409,{error:'IN_GAME'});const i=r.players.indexOf(p);if(b.ready&&p.characterIds.length<need(r,i))return json(res,409,{error:'NEED_CHARACTERS'});p.ready=!!b.ready;const pr=b.profiles&&typeof b.profiles==='object'?b.profiles:(b.profile?{[p.characterIds[0]]:b.profile}:{});p.profiles={};for(const c of p.characterIds)if(pr[c])p.profiles[c]=cleanProfile(pr[c]);send(r,'PLAYER_READY');return json(res,200,{ok:true});}
   if(b.action==='CHARACTER'){if(r.status!=='LOBBY')return json(res,409,{error:'IN_GAME'});const ids=cleanChars(b.characterIds??b.characterId);if(!ids.length)return json(res,400,{error:'BAD_CHARACTER'});p.characterIds=ids;p.profiles={};p.ready=false;send(r,'PLAYER_CHARACTER');return json(res,200,{ok:true});}
   if(b.action==='START'){if(p.id!==r.hostId)return json(res,403,{error:'HOST_ONLY'});if(r.players.length<2||!r.players.every(x=>x.ready))return json(res,409,{error:'NEED_2_TO_4_READY'});if(!r.players.every((x,i)=>x.characterIds.length>=need(r,i)))return json(res,409,{error:'NEED_CHARACTERS'});r.units=buildUnits(r);for(const x of r.players){x.alive=true;x.hp=100}r.status='PLAYING';r.currentIndex=0;r.phase='WAIT_THROW';r.phaseThrown=[];r.field=makeField();r.talk50Triggered=false;r.lastThrowPlayerId=null;const openingMs=Math.max(0,Math.min(10000,Math.round(Number(b.openingMs)||4000)));r.battleStartAt=now()+openingMs;/* バトル開始演出(ボス紹介)の長さ:全員同じ。この時刻までは投球を受け付けない */send(r,'GAME_START',{turnIndex:0,turnPlayerId:ownerAt(r,0),field:r.field,openingMs});return json(res,200,{ok:true});}
   if(b.action==='THROW'){if(r.status!=='PLAYING'||r.phase!=='WAIT_THROW'||ownerAt(r,r.currentIndex)!==p.id)return json(res,409,{error:'NOT_YOUR_TURN'});if(now()<(r.battleStartAt||0))return json(res,409,{error:'NOT_STARTED'});const turnPlayerId=p.id,fromIndex=r.currentIndex;r.lastThrowPlayerId=turnPlayerId;(r.phaseThrown||(r.phaseThrown=[])).push(fromIndex);
     const n=nextUnthrown(r);let phaseEnd=false;
     if(n>=0){r.currentIndex=n;r.field=makeField();}            // フェーズの途中:次の人の 3D ルート
     else{phaseEnd=true;openCatchRound(r);}                        // 全員投げ終えた:ボスの反撃(この field の catchPos へ)
     send(r,'THROW',{fromPlayerId:turnPlayerId,fromIndex,nextIndex:phaseEnd?null:r.currentIndex,nextPlayerId:phaseEnd?null:ownerAt(r,r.currentIndex),phaseEnd,voiceRoll:phaseEnd?r.voiceRoll:null,throwData:b.throwData,special:!!b.special,field:r.field,catchPos:r.field?.catchPos,fieldPattern:r.field?.pattern,fieldSeed:r.field?.seed,catchSeq:r.catchSeq,eventId:id(),serverTime:now()});return json(res,200,{ok:true});}
   if(b.action==='TALK50'){if(r.status!=='PLAYING'||r.talk50Triggered||r.lastThrowPlayerId!==p.id)return json(res,409,{error:'TALK50_NOT_ALLOWED'});r.talk50Triggered=true;send(r,'TALK50',{talkId:String(b.talkId||'interest50'),fromPlayerId:p.id,eventId:id(),serverTime:now()});return json(res,200,{ok:true});}
   if(b.action==='CATCH'){if(r.status!=='PLAYING'||r.phase!=='WAIT_CATCH'||!r.catchExpected?.includes(p.id))return json(res,409,{error:'NOT_CATCH_PLAYER'});if(r.catchResults?.[p.id])return json(res,200,{ok:true,grade:r.catchResults[p.id].grade,hp:p.hp});const d=Number(b.deltaMs);const order=['PERFECT','GREAT','GOOD','MISS'];const grade=order.includes(b.grade)?b.grade:'MISS';// 1回のキャッチ判定を、そのプレイヤーが担当する生存キャラ全員に適用(ダメージは各キャラの DEF で個別に計算した値)
     const damages={};for(let i=0;i<r.units.length;i++){const u=r.units[i];if(u.ownerId!==p.id||u.alive===false)continue;const v=Number(b.damages?.[i]??b.damage);const dmg=grade==='PERFECT'?0:Math.max(0,Math.min(100,Number.isFinite(v)?Math.round(v):0));u.hp=Math.max(0,u.hp-dmg);if(u.hp<=0)u.alive=false;damages[i]=dmg}
     const mine=r.units.filter(u=>u.ownerId===p.id);p.alive=mine.some(u=>u.alive!==false);p.hp=mine.reduce((a,u)=>a+u.hp,0);
     r.catchResults[p.id]={grade,deltaMs:Number.isFinite(d)?d:null,damages,down:p.alive===false};send(r,'CATCH_PLAYER',{playerId:p.id,grade,deltaMs:Number.isFinite(d)?d:null,damages,down:p.alive===false});finishCatchRound(r);return json(res,200,{ok:true,grade,damages});}
   if(b.action==='PLAYER_DOWN'){if(r.status!=='PLAYING')return json(res,409,{error:'NOT_PLAYING'});dropFromBattle(r,p);return json(res,200,{ok:true});}
   return json(res,400,{error:'BAD_ACTION'});
 }
 if(u.pathname==='/api/events'){const r=roomOf(u.searchParams.get('code')),p=player(r,u.searchParams.get('token'));if(!r||!p){res.writeHead(403);return res.end();}p.connected=true;res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache','connection':'keep-alive','x-accel-buffering':'no'});res.write(`event: message\ndata: ${JSON.stringify({type:'STATE_SYNC',seq:r.seq,room:pub(r)})}\n\n`);if(!clients.has(p.id))clients.set(p.id,new Set());clients.get(p.id).add(res);req.on('close',()=>{clients.get(p.id)?.delete(res);p.connected=false;r.touched=now();const anyConnected=r.players.some(x=>(clients.get(x.id)?.size||0)>0);if(!anyConnected){rooms.delete(r.code);for(const x of r.players)clients.delete(x.id);return;}if(!r.players.includes(p))return;if(r.status==='PLAYING'){if(p.alive!==false)dropFromBattle(r,p,{disconnected:true});}else send(r,'PLAYER_CONNECTION',{playerId:p.id,connected:false});});return;}
 let fp=u.pathname==='/'?'/online.html':u.pathname;fp=path.normalize(fp).replace(/^\.\.(\/|\\)/,'');const full=path.join(ROOT,fp);if(!full.startsWith(ROOT)||!fs.existsSync(full)||fs.statSync(full).isDirectory()){res.writeHead(404);return res.end('not found');}const ext=path.extname(full);const ct={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.webp':'image/webp','.png':'image/png','.json':'application/json','.mp3':'audio/mpeg'}[ext]||'application/octet-stream';res.writeHead(200,{'content-type':ct,'cache-control':'no-store, no-cache, must-revalidate','pragma':'no-cache','expires':'0'});fs.createReadStream(full).pipe(res);
}catch(e){json(res,500,{error:String(e.message||e)})}});
server.listen(PORT,'0.0.0.0',()=>console.log(`HEART STRIKE Online http://0.0.0.0:${PORT}`));