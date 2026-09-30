// 汎用ステートマシン。各ステートは { enter(data), update(dt), exit(), onTap(e), onDragstart(e), onDrag(e), onRelease(flick) } を任意で持つ。
export const GameState = Object.freeze({
  TITLE: 'TITLE',
  PLAYER_ATTACK: 'PLAYER_ATTACK',
  BALL_TO_BOSS: 'BALL_TO_BOSS',
  BOSS_HIT: 'BOSS_HIT',
  NEXT_PLAYER: 'NEXT_PLAYER',
  BOSS_RETURN: 'BOSS_RETURN',
  PLAYER_DEFENSE: 'PLAYER_DEFENSE',
  PLAYER_CATCH: 'PLAYER_CATCH',
  FEVER_INTRO: 'FEVER_INTRO',   // FEVER 突入演出
  FEVER_OUTRO: 'FEVER_OUTRO',   // FEVER FINISH 演出
  TALK_QUESTION: 'TALK_QUESTION', // 好感度 50%:質問 →「次の1投で答えて！」
  TALK_REACTION: 'TALK_REACTION', // 回答の1投へのリアクション
  GAME_CLEAR: 'GAME_CLEAR',
  GAME_OVER: 'GAME_OVER',
});

export class StateMachine {
  constructor(onChange) {
    this.states = new Map();
    this.current = null;
    this.currentName = null;
    this.timeInState = 0;
    this.onChange = onChange;
  }
  register(name, state) { this.states.set(name, state); }
  change(name, data) {
    if (this.current?.exit) this.current.exit();
    this.currentName = name;
    this.current = this.states.get(name);
    this.timeInState = 0;
    this.onChange?.(name);
    if (this.current?.enter) this.current.enter(data);
  }
  update(dt) {
    this.timeInState += dt;
    this.current?.update?.(dt);
  }
  dispatch(method, arg) {
    this.current?.[method]?.(arg);
  }
  is(name) { return this.currentName === name; }
}
