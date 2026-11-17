// The look plan, in one place. The 3D scene is a dusk industrial yard: warm amber key
// light against cool blue shadow, read at a glance. The DOM interface is the light
// Apple-style layer on top: #F5F5F7 panels, white cards, one #007AFF accent.
// The same names are the CSS custom properties in index.html.
export const PALETTE = {
  sky: '#2e3a52',
  canvas: '#232a38',
  ground: '#3a3f47',
  surface: '#4a5058',
  hairline: '#5d646e',
  containerA: '#b4762a',
  containerB: '#2f6f6a',
  containerC: '#7a4a3a',
  ink: '#f2f0ea',
  muted: '#9aa3ad',
  accent: '#f0a830',
  blue: '#007aff',
  danger: '#ff3b30',
  good: '#34c759',
  enemy: '#ff453a',
  ally: '#30b0ff',
};

export function shade(name) {
  return PALETTE[name];
}
