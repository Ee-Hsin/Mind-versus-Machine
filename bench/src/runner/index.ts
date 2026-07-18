/**
 * CLI entry point. Game-specific duel functions belong in adapters and should
 * call runGame/runPool from this directory. This scaffold intentionally does
 * not import game implementations until they are added to this repository.
 */
console.error(
  "No game adapters are registered yet. Add a game under src/adapters, then register its CLI duel here.",
);
process.exitCode = 1;
