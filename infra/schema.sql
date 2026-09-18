CREATE TABLE IF NOT EXISTS chain_blocks (
  chain_id INTEGER NOT NULL,
  block_number BIGINT NOT NULL,
  block_hash TEXT NOT NULL,
  parent_hash TEXT NOT NULL,
  block_time TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (chain_id, block_number)
);

CREATE TABLE IF NOT EXISTS indexer_checkpoints (
  worker TEXT PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  block_number BIGINT NOT NULL,
  block_hash TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pons_launches (
  token TEXT PRIMARY KEY,
  curve TEXT NOT NULL,
  deployer TEXT NOT NULL,
  pair_token TEXT NOT NULL,
  launch_config_id NUMERIC(78,0) NOT NULL,
  graduation_threshold NUMERIC(78,0) NOT NULL,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_number BIGINT NOT NULL,
  block_hash TEXT NOT NULL,
  block_time TIMESTAMPTZ,
  UNIQUE (tx_hash, log_index)
);

CREATE TABLE IF NOT EXISTS pads (
  parent_token TEXT PRIMARY KEY,
  owner_address TEXT NOT NULL,
  config_version BIGINT NOT NULL,
  depth INTEGER NOT NULL,
  pons_root BOOLEAN NOT NULL,
  active BOOLEAN NOT NULL,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_number BIGINT NOT NULL,
  block_hash TEXT NOT NULL,
  block_time TIMESTAMPTZ,
  UNIQUE (tx_hash, log_index)
);

CREATE TABLE IF NOT EXISTS child_tokens (
  token TEXT PRIMARY KEY,
  parent_token TEXT NOT NULL,
  market TEXT NOT NULL UNIQUE,
  creator TEXT NOT NULL,
  token_name TEXT,
  token_symbol TEXT,
  metadata_uri TEXT,
  supply NUMERIC(78,0) NOT NULL,
  initial_quote_seed NUMERIC(78,0) NOT NULL,
  config_version BIGINT NOT NULL,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_number BIGINT NOT NULL,
  block_hash TEXT NOT NULL,
  block_time TIMESTAMPTZ,
  UNIQUE (tx_hash, log_index)
);

CREATE TABLE IF NOT EXISTS protocol_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  token TEXT,
  parent_token TEXT,
  actor TEXT,
  amount_in NUMERIC(78,0),
  amount_out NUMERIC(78,0),
  fee_amount NUMERIC(78,0),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_number BIGINT NOT NULL,
  block_hash TEXT NOT NULL,
  block_time TIMESTAMPTZ,
  UNIQUE (tx_hash, log_index)
);

CREATE TABLE IF NOT EXISTS reward_epochs (
  epoch_id NUMERIC(78,0) PRIMARY KEY,
  beneficiary_token TEXT NOT NULL,
  reward_token TEXT NOT NULL,
  merkle_root TEXT NOT NULL,
  total_reward NUMERIC(78,0) NOT NULL,
  snapshot_block BIGINT NOT NULL,
  holder_count BIGINT NOT NULL,
  allocation_hash TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  block_number BIGINT NOT NULL,
  block_hash TEXT NOT NULL,
  block_time TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS reward_allocations (
  epoch_id NUMERIC(78,0) NOT NULL,
  account TEXT NOT NULL,
  balance NUMERIC(78,0) NOT NULL,
  amount NUMERIC(78,0) NOT NULL,
  leaf TEXT NOT NULL,
  proof JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (epoch_id, account)
);

CREATE TABLE IF NOT EXISTS ledger_epochs (
  minute BIGINT PRIMARY KEY,
  merkle_root TEXT NOT NULL,
  event_count INTEGER NOT NULL,
  anchor_tx_hash TEXT,
  anchor_block_number BIGINT,
  status TEXT NOT NULL CHECK (status IN ('computed', 'anchored', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_protocol_events_block ON protocol_events (block_number DESC, log_index DESC);
CREATE INDEX IF NOT EXISTS idx_protocol_events_token ON protocol_events (token, block_number DESC);
CREATE INDEX IF NOT EXISTS idx_child_tokens_parent ON child_tokens (parent_token);
CREATE INDEX IF NOT EXISTS idx_pads_depth ON pads (depth, block_number DESC);
CREATE INDEX IF NOT EXISTS idx_reward_allocations_account ON reward_allocations (account, epoch_id DESC);
