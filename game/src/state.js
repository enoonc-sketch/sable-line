// The one state store: phase, rounds, scores, the bomb and the kill feed.
// The simulation writes here; the HUD only reads. Nothing else keeps a copy of
// these numbers, so the screen can never disagree with the game.
export const ROUND_TIME = 100;
export const FREEZE_TIME = 8;
export const PLANT_TIME = 3.2;
export const DEFUSE_TIME = 5;
export const FUSE_TIME = 35;
export const WIN_ROUNDS = 5;

export function createState() {
  const state = {
    phase: 'menu', // menu | freeze | live | roundEnd | matchEnd
    round: 1,
    wins: { sable: 0, rust: 0 },
    timer: ROUND_TIME,
    freezeLeft: FREEZE_TIME,
    bomb: 'carried', // carried | dropped | planted | defused | exploded
    bombSite: null,
    bombAt: null,
    fuseLeft: 0,
    plantProgress: 0,
    defuseProgress: 0,
    killer: null,
    roundWinner: null,
    roundReason: '',
    matchWinner: null,
    kills: { sable: 0, rust: 0 },
    feed: [],
    time: 0,
  };

  return {
    state,
    reset() {
      state.phase = 'menu';
      state.round = 1;
      state.wins.sable = 0;
      state.wins.rust = 0;
      state.timer = ROUND_TIME;
      state.freezeLeft = FREEZE_TIME;
      state.bomb = 'carried';
      state.bombSite = null;
      state.bombAt = null;
      state.fuseLeft = 0;
      state.plantProgress = 0;
      state.defuseProgress = 0;
      state.killer = null;
      state.roundWinner = null;
      state.roundReason = '';
      state.matchWinner = null;
      state.kills.sable = 0;
      state.kills.rust = 0;
      state.feed.length = 0;
      state.time = 0;
    },
    feedKill(killerName, victimName, head, killerTeam) {
      state.feed.unshift({ killerName, victimName, head, killerTeam, at: state.time });
      if (state.feed.length > 4) state.feed.pop();
    },
  };
}
