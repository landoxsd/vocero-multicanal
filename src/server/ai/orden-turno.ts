/**
 * 025 — El orden en que el agente incluido lee la conversación cuando el
 * cliente escribió mientras pensaba. Puras: no tocan la base.
 *
 * Puerto de `src/server/ai/orden-turno.ts` de Vocero Cloud. Allá los debidos
 * los trae el despacho; aquí, la entrada de coalesce de `pipeline.ts`.
 */

type Mensaje = { id: string; direction: "in" | "out"; createdAt: Date };

/**
 * Pura: el historial en el orden en que lo debe leer el modelo.
 *
 * Por hora de llegada, lo que el cliente escribió mientras el agente pensaba
 * queda ANTES de la respuesta que salió de ese turno: usuario, usuario,
 * asistente. Leído así, el modelo ve una conversación que termina en su
 * propia respuesta y da por contestado un mensaje que nunca leyó.
 *
 * `debidos` son los entrantes que este turno tiene que atender. Van al final
 * junto con lo que llegó después de la última respuesta, en su orden; el resto
 * se queda como estaba. Sin `debidos` no se mueve nada: el Laboratorio y el
 * turno normal leen el historial igual que siempre.
 */
export function ordenarParaElTurno<T extends Mensaje>(
  historial: readonly T[],
  debidos: readonly T[]
): T[] {
  if (!debidos.length) return [...historial];

  const ultimaSalida = historial.reduce(
    (idx, m, i) => (m.direction === "out" ? i : idx),
    -1
  );
  const sinAtender = new Map<string, T>();
  for (const m of debidos) {
    if (m.direction === "in") sinAtender.set(m.id, m);
  }
  historial.forEach((m, i) => {
    if (i > ultimaSalida && m.direction === "in") sinAtender.set(m.id, m);
  });

  const cola = [...sinAtender.values()].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );
  return [...historial.filter((m) => !sinAtender.has(m.id)), ...cola];
}

/**
 * Pura: de lo debido, lo que ninguna PERSONA contestó ya.
 *
 * Un debido sigue debiéndose aunque después venga una respuesta del agente
 * (no lo había leído). Si lo que viene después es un saliente de una persona,
 * ese mensaje ya tuvo quien lo atendiera: moverlo al final sería hacer que el
 * agente le conteste encima.
 *
 * Se decide por la posición en el historial, que viene ordenado por Postgres;
 * la hora solo desempata un debido tan viejo que ya no cabe en él.
 */
export function debidosVigentes<T extends Mensaje & { aiGenerated: boolean }>(
  historial: readonly T[],
  debidos: readonly T[]
): T[] {
  const ultimaHumana = historial.reduce(
    (idx, m, i) => (m.direction === "out" && !m.aiGenerated ? i : idx),
    -1
  );
  const humana = historial[ultimaHumana];
  if (!humana) return [...debidos];

  const posicion = new Map(historial.map((m, i) => [m.id, i]));
  return debidos.filter((m) => {
    const i = posicion.get(m.id);
    return i === undefined
      ? m.createdAt.getTime() > humana.createdAt.getTime()
      : i > ultimaHumana;
  });
}

/**
 * Pura: ¿lo último que pasó en la conversación es que contestó una PERSONA?
 *
 * Entra un mensaje y, antes de que venza la ventana de agrupado, el operador
 * responde desde la bandeja. Ese mensaje ya está atendido: un turno del agente
 * sería contestarle encima. Con el despacho, esto mismo deja la ráfaga vacía
 * y el despacho se descarta.
 */
export function atendidoPorPersona(
  historial: readonly { direction: "in" | "out"; aiGenerated: boolean }[]
): boolean {
  const ultimaHumana = historial.reduce(
    (idx, m, i) => (m.direction === "out" && !m.aiGenerated ? i : idx),
    -1
  );
  if (ultimaHumana === -1) return false;
  return !historial.some((m, i) => i > ultimaHumana && m.direction === "in");
}

/**
 * Pura: ¿hace falta otro turno?
 *
 * `anotados` es lo que entró mientras el turno corría; `vistos`, los entrantes
 * que ese turno alcanzó a leer (`undefined` si no llegó a abrir el historial:
 * falló o se calló antes). Lo que entró y el turno ya leyó está atendido: otro
 * turno sería contestar dos veces. Lo que no leyó se le sigue debiendo.
 */
export function quedanDebidos(
  anotados: ReadonlySet<string>,
  vistos: readonly string[] | undefined
): string[] {
  if (!vistos) return [...anotados];
  const leidos = new Set(vistos);
  return [...anotados].filter((id) => !leidos.has(id));
}
