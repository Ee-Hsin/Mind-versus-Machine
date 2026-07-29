"use client";

import {
  WORDLE_WORD_LENGTH,
  type WordleGuessResult,
  type WordleSnapshot,
  type WordleStreamEvent,
} from "@ai-ramp/protocol";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadAllowedGuesses } from "@/lib/wordle/word-list";

export interface WordleGameController {
  snapshot: WordleSnapshot | null;
  loadError: string | null;
  actionError: string | null;
  /** The guess currently awaiting the server, kept on the board while in flight. */
  pendingGuess: string | null;
  submitGuess: (guess: string) => Promise<void>;
  forfeit: () => Promise<void>;
  clearActionError: () => void;
}

/**
 * Drives one Wordle game.
 *
 * Two channels, deliberately: the player's own guesses go over plain POSTs and
 * get their colours straight back on the response — the lowest-latency path, and
 * no correlating your own result off a broadcast — while the model boards arrive
 * on a single SSE connection. Nothing polls.
 */
export function useWordleGame(gameId: string): WordleGameController {
  const [snapshot, setSnapshot] = useState<WordleSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingGuess, setPendingGuess] = useState<string | null>(null);
  const words = useRef<Set<string> | null>(null);
  const inFlight = useRef(false);

  // The word list is optional: if it fails to load we simply stop rejecting
  // locally and let the server be the only judge. Slower, never broken.
  useEffect(() => {
    let active = true;
    loadAllowedGuesses()
      .then((set) => {
        if (active) words.current = set;
      })
      .catch(() => {
        /* fall back to server-side validation */
      });
    return () => {
      active = false;
    };
  }, []);

  // Initial snapshot. Also the path that rehydrates a game this server has
  // evicted, which is what makes resuming after a refresh work.
  useEffect(() => {
    let active = true;
    fetch(`/api/games/${gameId}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            response.status === 404 ? "This game could not be found."
              : response.status === 403 || response.status === 401 ? "This game belongs to another player."
              : "Could not load the game.",
          );
        }
        return response.json() as Promise<{ snapshot: WordleSnapshot }>;
      })
      .then((body) => {
        if (!active) return;
        setSnapshot(body.snapshot);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (active) setLoadError(error instanceof Error ? error.message : "Could not load the game.");
      });
    return () => {
      active = false;
    };
  }, [gameId]);

  // Model boards. EventSource reconnects on its own and replays Last-Event-ID,
  // so a dropped connection resumes without losing or duplicating a turn.
  useEffect(() => {
    const source = new EventSource(`/api/games/${gameId}/stream`);

    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as WordleStreamEvent;
      setSnapshot((current) => (current ? applyStreamEvent(current, event) : current));
      // The server closes a finished stream; close our side too so EventSource
      // does not sit in a reconnect loop against it.
      if (event.type === "finished") source.close();
    };

    return () => source.close();
  }, [gameId]);

  const submitGuess = useCallback(async (raw: string) => {
    const guess = raw.trim().toUpperCase();
    if (inFlight.current) return;
    if (guess.length !== WORDLE_WORD_LENGTH) {
      setActionError(`Enter ${WORDLE_WORD_LENGTH} letters.`);
      return;
    }
    if (words.current && !words.current.has(guess)) {
      setActionError(`${guess} is not in the word list.`);
      // Telemetry only — recorded so human and model valid-word rates are
      // comparable. Nothing waits on it.
      void fetch(`/api/games/${gameId}/rejections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guess }),
      }).catch(() => {});
      return;
    }

    const expectedTurn = (snapshot?.you.guessesMade ?? 0) + 1;
    inFlight.current = true;
    setPendingGuess(guess);
    setActionError(null);
    try {
      const response = await fetch(`/api/games/${gameId}/guesses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guess, expectedTurn }),
      });
      if (!response.ok) throw new Error("That guess could not be submitted.");
      const { result } = (await response.json()) as { result: WordleGuessResult };
      setSnapshot((current) => (current ? applyGuessResult(current, result) : current));
      if (!result.accepted) setActionError(result.reason ?? "That word was not accepted.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "That guess could not be submitted.");
    } finally {
      inFlight.current = false;
      setPendingGuess(null);
    }
  }, [gameId, snapshot?.you.guessesMade]);

  const forfeit = useCallback(async () => {
    setActionError(null);
    try {
      const response = await fetch(`/api/games/${gameId}/forfeit`, { method: "POST" });
      if (!response.ok) throw new Error("Could not quit this game.");
      const { snapshot: next } = (await response.json()) as { snapshot: WordleSnapshot };
      setSnapshot(next);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not quit this game.");
    }
  }, [gameId]);

  return {
    snapshot,
    loadError,
    actionError,
    pendingGuess,
    submitGuess,
    forfeit,
    clearActionError: useCallback(() => setActionError(null), []),
  };
}

function applyStreamEvent(snapshot: WordleSnapshot, event: WordleStreamEvent): WordleSnapshot {
  switch (event.type) {
    case "seat":
      return {
        ...snapshot,
        models: snapshot.models.map((seat) => (seat.seatId === event.seat.seatId ? event.seat : seat)),
      };
    case "revealed":
      return { ...snapshot, revealed: true, answer: event.answer, models: event.models };
    case "finished":
      return { ...snapshot, status: event.status };
  }
}

/**
 * A finished board is not a finished game — the models may still be running — so
 * `status` is left alone here and only moves on an explicit `finished` event.
 */
function applyGuessResult(snapshot: WordleSnapshot, result: WordleGuessResult): WordleSnapshot {
  return {
    ...snapshot,
    you: result.you,
    revealed: result.revealed || snapshot.revealed,
    ...(result.answer ? { answer: result.answer } : {}),
  };
}
