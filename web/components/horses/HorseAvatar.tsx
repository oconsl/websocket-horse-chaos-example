import styles from './HorseAvatar.module.css';

interface HorseAvatarProps {
  lane: number;
  running?: boolean;
  className?: string;
}

/** Toy rocking-horse built from plain divs, recolored per lane via CSS vars
 * (see .lane1..5 in HorseAvatar.module.css). Structure/shape is a fixed
 * pixel layout; `.crop` crops+scales it down to the icon size (see
 * `--horse-scale`/`--horse-crop-x/y` in the module CSS). */
export function HorseAvatar({ lane, running = false, className }: HorseAvatarProps) {
  return (
    <span
      className={[styles.avatar, styles[`lane${lane}`], running && styles.running, className]
        .filter(Boolean)
        .join(' ')}
      aria-hidden="true"
    >
      <span className={styles.crop}>
        <div className={styles.swing}>
          <div className={styles.leftLeg} />
          <div className={styles.rightLeg} />
          <div className={styles.body} />
          <div className={styles.head} />
          <div className={styles.nose} />
          <div className={styles.mane} />
          <div className={styles.tail} />
        </div>
      </span>
    </span>
  );
}
