-- Create Broadcast Campaigns table
CREATE TABLE broadcasts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, running, paused, stopped, completed
  message TEXT NOT NULL,
  min_sec INTEGER NOT NULL DEFAULT 10,
  max_sec INTEGER NOT NULL DEFAULT 30,
  per_chip_limit INTEGER NOT NULL DEFAULT 50,
  total INTEGER NOT NULL DEFAULT 0,
  sent INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  chips JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- Create Broadcast Numbers table
CREATE TABLE broadcast_numbers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  broadcast_id UUID NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, sent, error
  instance TEXT,
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE
);

-- Create an index for faster queue processing
CREATE INDEX idx_broadcast_numbers_pending ON broadcast_numbers(broadcast_id, status) WHERE status = 'pending';

-- Function to increment stats safely
CREATE OR REPLACE FUNCTION increment_broadcast_stat(row_id UUID, stat_type TEXT)
RETURNS void AS $$
BEGIN
  IF stat_type = 'sent' THEN
    UPDATE broadcasts SET sent = sent + 1 WHERE id = row_id;
  ELSIF stat_type = 'errors' THEN
    UPDATE broadcasts SET errors = errors + 1 WHERE id = row_id;
  END IF;
END;
$$ LANGUAGE plpgsql;
