'use client';

import { useEffect, useState } from 'react';

interface Headline {
  kicker: string;
  title: string;
  body: string;
}

const HEADLINES: Headline[] = [
  {
    kicker: 'ESCÁNDALO',
    title: 'Caballo #3 dio positivo en control antidoping... de Red Bull',
    body: 'Comisión técnica investiga si la lata encontrada en el establo cuenta como sustancia prohibida.',
  },
  {
    kicker: 'EXCLUSIVO',
    title: '"Yo no aposté a perder a propósito", declara jugador tras apostar 999 coins al último puesto',
    body: 'Testigos aseguran haber escuchado un grito de "NOOO" audible desde el otro lobby.',
  },
  {
    kicker: 'ÚLTIMO MOMENTO',
    title: 'Power-up SLOW clasificado como arma de destrucción masiva por la ONU de Horse Chaos',
    body: 'Jugadores piden un tratado internacional. La organización aún no responde.',
  },
  {
    kicker: 'RUMOR',
    title: 'Filtran chat privado: caballo favorito habría pedido "menos presión" antes de largada',
    body: 'Su representante lo desmiente: "Mi cliente solo estaba estirando".',
  },
  {
    kicker: 'ECONOMÍA',
    title: 'Banco Central de Horse Chaos confirma subsidio a jugadores en bancarrota',
    body: 'Analistas debaten si el "bailout" fomenta apuestas cada vez más temerarias.',
  },
  {
    kicker: 'TAPA DEL DÍA',
    title: 'BOMBA en la recta final: así fue el power-up que cambió todo',
    body: 'Reviví el momento exacto en el que el lobby entero se puso de pie (metafóricamente).',
  },
  {
    kicker: 'OPINIÓN',
    title: 'Editorial: "¿Es ético usar SHIELD contra tu propio amigo?"',
    body: 'La redacción se dividió 50/50. El debate sigue en la mesa de café.',
  },
  {
    kicker: 'DEPORTES',
    title: 'Caballo de carril 5 llega último por sexta carrera consecutiva, pide "más chaos"',
    body: 'Su entrenador insiste en que las estadísticas "no cuentan toda la historia".',
  },
  {
    kicker: 'EXCLUSIVO',
    title: 'Jugador anónimo admite: "Elijo caballo por el nombre, no por las stats"',
    body: 'Expertos en probabilidad se toman la cabeza. El jugador sigue ganando igual.',
  },
  {
    kicker: 'VIRAL',
    title: 'El TURBO más rápido de la historia del lobby, en cámara lenta',
    body: 'Analistas de video confirman: fue rápido. Muy rápido.',
  },
];

const ROTATE_MS = 6000;

export function TabloidNews() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((i) => (i + 1) % HEADLINES.length);
    }, ROTATE_MS);
    return () => clearInterval(interval);
  }, []);

  const headline = HEADLINES[index];

  return (
    <div className="tabloid">
      <div className="tabloid-masthead">
        <span>🐎 EL CHAOS DIARIO</span>
        <span className="tabloid-edition">EDICIÓN DEL LOBBY</span>
      </div>
      <div className="tabloid-body">
        <span className="tabloid-kicker">{headline.kicker}</span>
        <h3 className="tabloid-title">{headline.title}</h3>
        <p className="tabloid-text">{headline.body}</p>
      </div>
      <div className="tabloid-dots">
        {HEADLINES.map((h, i) => (
          <span key={h.title} className={`tabloid-dot${i === index ? ' tabloid-dot--active' : ''}`} />
        ))}
      </div>
    </div>
  );
}
