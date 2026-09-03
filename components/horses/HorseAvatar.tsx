import styles from './HorseAvatar.module.css';

export type HorseVibe = 'tank' | 'glitch' | 'geometric' | 'cracked' | 'ghost';

/** Lane order matches the api's alphabetical seed (game.service.ts createRace):
 *  1 CSS Master, 2 El Backend, 3 NullPointer, 4 Segmentation Fault, 5 localhost:3000 */
const VIBE_BY_LANE: Record<number, HorseVibe> = {
  1: 'geometric',
  2: 'tank',
  3: 'glitch',
  4: 'cracked',
  5: 'ghost',
};

interface HorseAvatarProps {
  lane: number;
  running?: boolean;
  className?: string;
}

/** Base running-horse silhouette shared by every vibe, tinted via currentColor. */
function HorseSilhouette({ strokeWidth = 0 }: { strokeWidth?: number }) {
  return (
    <g
      fill="currentColor"
      stroke={strokeWidth ? 'currentColor' : 'none'}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      {/* body */}
      <ellipse cx="46" cy="54" rx="26" ry="14" />
      {/* neck + head */}
      <path d="M64 44 C70 34 76 24 86 18 L92 26 C84 32 78 40 76 50 Z" />
      {/* ear */}
      <path d="M83 20 L90 12 L91 22 Z" />
      {/* tail */}
      <path d="M21 48 C12 46 8 52 6 62 C14 58 20 58 24 62 Z" />
      {/* legs */}
      <rect x="28" y="64" width="6" height="20" rx="2" />
      <rect x="42" y="64" width="6" height="20" rx="2" />
      <rect x="56" y="62" width="6" height="22" rx="2" />
      <rect x="66" y="58" width="6" height="24" rx="2" />
    </g>
  );
}

function TankAvatar() {
  return (
    <g className={styles.tank}>
      <HorseSilhouette strokeWidth={3} />
    </g>
  );
}

function GlitchAvatar() {
  return (
    <g>
      <g className={styles.glitchLayer} opacity={0.55} transform="translate(-2,1)">
        <HorseSilhouette />
      </g>
      <g className={styles.glitchLayer} opacity={0.55} transform="translate(2,-1)">
        <HorseSilhouette />
      </g>
      <HorseSilhouette />
    </g>
  );
}

function GeometricAvatar() {
  return (
    <g>
      <circle cx="52" cy="40" r="26" fill="currentColor" opacity={0.9} />
      <polygon points="30,60 70,60 60,80 40,80" fill="currentColor" />
      <circle cx="76" cy="30" r="8" fill="currentColor" />
      <polygon points="22,66 34,66 28,78" fill="currentColor" />
    </g>
  );
}

function CrackedAvatar() {
  return (
    <g>
      <HorseSilhouette />
      <path
        d="M35 40 L45 48 L38 52 L52 64 M60 30 L54 42 L64 46"
        className={styles.crack}
        fill="none"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

function GhostAvatar() {
  return (
    <g className={styles.ghost}>
      <HorseSilhouette />
      <rect x="10" y="10" width="80" height="80" className={styles.scanlines} />
    </g>
  );
}

const AVATAR_BY_VIBE: Record<HorseVibe, () => React.JSX.Element> = {
  tank: TankAvatar,
  glitch: GlitchAvatar,
  geometric: GeometricAvatar,
  cracked: CrackedAvatar,
  ghost: GhostAvatar,
};

export function HorseAvatar({ lane, running = false, className }: HorseAvatarProps) {
  const vibe = VIBE_BY_LANE[lane] ?? 'tank';
  const Avatar = AVATAR_BY_VIBE[vibe];

  return (
    <svg
      viewBox="0 0 100 100"
      className={[styles.avatar, running && styles.running, className].filter(Boolean).join(' ')}
      style={{ color: `var(--accent-horse-${lane})` }}
      aria-hidden="true"
    >
      <Avatar />
    </svg>
  );
}
