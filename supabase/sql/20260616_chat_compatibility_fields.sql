-- Chat compatibility metadata
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS zodiac text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mbti text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS interests text[];
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS city text;
