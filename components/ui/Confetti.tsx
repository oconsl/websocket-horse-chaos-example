const COLORS = [
  'var(--accent-horse-1)',
  'var(--accent-horse-2)',
  'var(--accent-horse-3)',
  'var(--accent-horse-4)',
  'var(--accent-horse-5)',
];

const PIECES = Array.from({ length: 18 }, (_, i) => ({
  left: `${(i * 53) % 100}%`,
  delay: `${(i % 6) * 0.12}s`,
  color: COLORS[i % COLORS.length],
  rotate: (i * 37) % 360,
}));

export function Confetti() {
  return (
    <>
      {PIECES.map((piece, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: piece.left,
            animationDelay: piece.delay,
            background: piece.color,
            transform: `rotate(${piece.rotate}deg)`,
          }}
        />
      ))}
    </>
  );
}
