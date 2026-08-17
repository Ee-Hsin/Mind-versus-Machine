"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadAllowedGuesses } from "@/lib/wordle/word-list";
import {
  WORDLE_WORD_LENGTH,
  type WordleGuessResult,
  type WordleSnapshot,
} from "@/lib/wordle/types";

const POLL_MS = 1_000;

export interface WordleGameController {
  snapshot: WordleSnapshot | null;
  loadError: string | null;
  actionError: string | null;
  pendingGuess: string | null;
  submitGuess: (guess: string) => Promise<void>;
  forfeit: () => Promise<void>;
  clearActionError: () => void;
}

export function useWordleGame(gameId: string): WordleGameController {
  const [snapshot, setSnapshot] = useState<WordleSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingGuess, setPendingGuess] = useState<string | null>(null);
  const words = useRef<Set<string> | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    let active = true;
    loadAllowedGuesses()
      .then((set) => {
        if (active) words.current = set;
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    async function refresh() {
      try {
        const response = await fetch(`/api/games/${gameId}`, { cache: "no-store" });
        if (!response.ok) {
          if (response.status === 404) {
            if (active) setLoadError("This game is no longer available. Start a new game.");
            return;
          }
          throw new Error("Could not load the game.");
        }
        const body = await response.json() as { snapshot: WordleSnapshot };
        if (!active) return;
        if (!inFlight.current) setSnapshot(body.snapshot);
        setLoadError(null);
        if (!body.snapshot.allModelsSettled) timeout = setTimeout(refresh, POLL_MS);
      } catch (error) {
        if (!active) return;
        setLoadError(error instanceof Error ? error.message : "Could not load the game.");
        timeout = setTimeout(refresh, POLL_MS);
      }
    }

    void refresh();
    return () => {
      active = false;
      if (timeout) clearTimeout(timeout);
    };
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
      if (response.status === 404) throw new Error("This game is no longer available. Start a new game.");
      if (!response.ok) throw new Error("That guess could not be submitted.");
      const { result } = (await response.json()) as { result: WordleGuessResult };
      setSnapshot(result.snapshot);
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
      if (response.status === 404) throw new Error("This game is no longer available. Start a new game.");
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
