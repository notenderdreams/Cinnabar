import type { ReadingTheme } from '../types';

export const HIGHLIGHT_COLOR_PRESETS = [
  '#facc15',
  '#fbbf24',
  '#4ade80',
  '#38bdf8',
  '#fb7185',
  '#c084fc',
  '#f87171',
  '#ffffff',
] as const;

export const READING_THEMES: {
  id: ReadingTheme;
  name: string;
  desc: string;
  bgPreview: string;
  textPreview: string;
}[] = [
  {
    id: 'default',
    name: 'Original Paper',
    desc: 'Clean standard document view',
    bgPreview: 'bg-white',
    textPreview: 'text-zinc-900',
  },
  {
    id: 'invert',
    name: 'Smart Invert',
    desc: 'Balanced chrominance dark mode',
    bgPreview: 'bg-zinc-900',
    textPreview: 'text-zinc-100',
  },
  {
    id: 'oled',
    name: 'Deep OLED',
    desc: 'Pure #000000 black background for maximum contrast',
    bgPreview: 'bg-black',
    textPreview: 'text-zinc-200',
  },
  {
    id: 'sepia',
    name: 'Sepia Comfort',
    desc: 'Warm paper tone to prevent eye fatigue',
    bgPreview: 'bg-[#f4ecd8]',
    textPreview: 'text-[#433422]',
  },
  {
    id: 'nord',
    name: 'Nordic Frost',
    desc: 'Subtle cool blue arctic night mode',
    bgPreview: 'bg-[#2e3440]',
    textPreview: 'text-[#eceff4]',
  },
  {
    id: 'matrix',
    name: 'Matrix Glow',
    desc: 'High contrast green terminal glow',
    bgPreview: 'bg-black',
    textPreview: 'text-[#00ff66]',
  },
];
