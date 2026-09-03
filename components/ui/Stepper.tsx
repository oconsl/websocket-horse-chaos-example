import styles from './Stepper.module.css';

interface StepperProps {
  value: number;
  unit?: string;
  onIncrement: () => void;
  onDecrement: () => void;
  incrementDisabled?: boolean;
  decrementDisabled?: boolean;
}

export function Stepper({
  value,
  unit,
  onIncrement,
  onDecrement,
  incrementDisabled = false,
  decrementDisabled = false,
}: StepperProps) {
  return (
    <div className={styles.stepper}>
      <button
        type="button"
        className={styles.stepButton}
        onClick={onDecrement}
        disabled={decrementDisabled}
      >
        −
      </button>
      <span className={styles.value}>
        {value}
        {unit ? ` ${unit}` : ''}
      </span>
      <button
        type="button"
        className={styles.stepButton}
        onClick={onIncrement}
        disabled={incrementDisabled}
      >
        +
      </button>
    </div>
  );
}
