/** Neon palette: dark background, a few bright, high-contrast colors. */
/** Obstacle outline tints (variant picked by the map generation). */
export const OBSTACLE_TINTS = ['#5a7dff', '#a46bff', '#3de0c8'];

export const COLORS = {
  bg: '#07060f',
  grid: 'rgba(130, 100, 255, 0.16)',
  gridMajor: 'rgba(130, 100, 255, 0.14)',
  wallFill: '#100b22',
  wallEdge: '#5a7dff',
  danger: '#a43cff',
  boost: '#35e0ff',
  heal: '#ff7ac8',
  player: '#38f6ff',
  playerCore: '#ffffff',
  gem: ['#39ff7a', '#3a8dff', '#ff3df0', '#ffd23a'],
  enemyBullet: '#ff4646',
  hp: '#ff3d6e',
  xp: '#39ff7a',
  boss: '#ff3df5',
  text: '#f2eaff',
  muted: '#9a8fc0',
  gold: '#ffd23a',
  /** sandbox runs (same tint as in the UI) */
  sandbox: '#b48cff',
};

/** Indexed particle palette (drawing is batched by color). */
export const FX_COLORS = [
  '#ffffff', // 0
  '#38f6ff', // 1 player
  '#ff3366', // 2
  '#ffe14d', // 3
  '#ff8a1f', // 4
  '#c46bff', // 5
  '#ff2b2b', // 6
  '#ff9ecf', // 7
  '#39ff7a', // 8
  '#3a8dff', // 9
  '#ff3df5', // 10
  '#ffd23a', // 11
  '#5fa8ff', // 12
  '#ffb347', // 13
  '#a43cff', // 14
  '#f4f4ff', // 15
  '#9feaff', // 16 ice
  '#5cf2d6', // 17 clone
  '#7f9cff', // 18 clock
  '#b8ff3d', // 19 fever
  '#3dffb4', // 20 orbiter
  '#c8ff3d', // 21 splitter
  '#3d9bff', // 22 guardian
  '#8f5bff', // 23 teleporter
  '#3dffe0', // 24 builder hexagon
  '#ff4d6d', // 25 laser eye
];

export function fxColorIndex(hex: string): number {
  const i = FX_COLORS.indexOf(hex.toLowerCase());
  return i >= 0 ? i : 0;
}
