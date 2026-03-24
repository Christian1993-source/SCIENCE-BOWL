# Science Bowl Profesional

Juego nuevo creado desde cero con flujo controlado por maestro.

## Fases oficiales
- `waiting_start_game`
- `buzz` (20s)
- `answer` (10s)
- `steal` (10s)
- `round_result`
- `waiting_next_round`

## Flujo de ronda
1. Inicia en `waiting_start_game`.
2. Maestro presiona `START GAME` / `START NEXT ROUND`.
3. Se activa `buzz` (20s).
4. Primer buzzer pasa a `answer` (10s).
5. Si falla/timeout, va a `steal` (10s) para el rival.
6. Si steal falla/timeout -> `BOTH ELIMINATED!`.
7. Siempre pasa por `round_result` y luego `waiting_next_round`.
8. Nunca auto-carga la siguiente pregunta; solo con botón del maestro.

## Banco de preguntas
- Guardado en `localStorage` con key exacta: `sciencebowl_questions`.
- Soporta bancos grandes (10, 20, 50, 200, 1000 o más).
- La partida usa el banco cargado una sola vez y termina en la última pregunta.

## Formato de preguntas (mismo parser que Tug of War)
Separar cada pregunta con una línea en blanco.

### 1) Opción múltiple (MCQ)
Marcar la opción correcta con `*` al final.

```text
What force keeps planets in orbit?
A) Friction
B) Gravity*
C) Magnetism
D) Tension
```

### 2) Respuesta corta / fill
Usar `Answer:`.

```text
What does DNA stand for?
Answer: deoxyribonucleic acid
```

### 3) Numérica
Usar `Answer:` y opcional `Tolerance:` (`5%` o `0.2`).

```text
A car travels 120 km in 2 hours. Speed in km/h?
Answer: 60
Tolerance: 0.1
```

También acepta JSON (`[{"type":"fill","prompt":"...","answer":{...}}]`) y formato rápido `Pregunta | Respuesta`.
