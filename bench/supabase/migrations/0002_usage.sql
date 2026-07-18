alter table turns
  add column latency_ms int,
  add column input_tokens int,
  add column output_tokens int;
