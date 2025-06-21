/*
  # Disaster Response Platform Database Schema

  1. New Tables
    - `disasters` - Main disaster records with geospatial location data
      - `id` (uuid, primary key)
      - `title` (text, disaster title)
      - `location_name` (text, human-readable location)
      - `location` (geography, PostGIS point for geospatial queries)
      - `description` (text, disaster description)
      - `tags` (text[], disaster type tags like 'flood', 'earthquake')
      - `owner_id` (text, user who created the record)
      - `created_at` (timestamptz, creation timestamp)
      - `updated_at` (timestamptz, update timestamp)
      - `audit_trail` (jsonb, action history)

    - `reports` - User-submitted reports related to disasters
      - `id` (uuid, primary key)
      - `disaster_id` (uuid, foreign key to disasters)
      - `user_id` (text, reporting user)
      - `content` (text, report content)
      - `image_url` (text, optional image URL)
      - `verification_status` (text, verification status)
      - `created_at` (timestamptz, creation timestamp)

    - `resources` - Available resources and shelters
      - `id` (uuid, primary key)
      - `disaster_id` (uuid, foreign key to disasters)
      - `name` (text, resource name)
      - `location_name` (text, human-readable location)
      - `location` (geography, PostGIS point)
      - `type` (text, resource type: shelter, hospital, food, etc.)
      - `capacity` (integer, resource capacity)
      - `contact_info` (jsonb, contact details)
      - `created_at` (timestamptz, creation timestamp)

    - `cache` - API response caching table
      - `key` (text, primary key, cache key)
      - `value` (jsonb, cached response data)
      - `expires_at` (timestamptz, expiration timestamp)
      - `created_at` (timestamptz, creation timestamp)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to manage their own data
    - Add admin policies for full data access

  3. Indexes
    - Geospatial indexes on location columns using GIST
    - GIN indexes on tags array for efficient filtering
    - Standard indexes on foreign keys and frequently queried columns
*/

-- Enable PostGIS extension for geospatial functionality
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create disasters table
CREATE TABLE IF NOT EXISTS disasters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  location_name text,
  location geography(POINT, 4326),
  description text,
  tags text[] DEFAULT '{}',
  owner_id text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  audit_trail jsonb DEFAULT '[]'::jsonb
);

-- Create reports table
CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  disaster_id uuid REFERENCES disasters(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  content text NOT NULL,
  image_url text,
  verification_status text DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  created_at timestamptz DEFAULT now()
);

-- Create resources table
CREATE TABLE IF NOT EXISTS resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  disaster_id uuid REFERENCES disasters(id) ON DELETE CASCADE,
  name text NOT NULL,
  location_name text,
  location geography(POINT, 4326),
  type text NOT NULL,
  capacity integer DEFAULT 0,
  contact_info jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create cache table
CREATE TABLE IF NOT EXISTS cache (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create geospatial indexes
CREATE INDEX IF NOT EXISTS disasters_location_idx ON disasters USING GIST (location);
CREATE INDEX IF NOT EXISTS resources_location_idx ON resources USING GIST (location);

-- Create GIN index for tags array
CREATE INDEX IF NOT EXISTS disasters_tags_idx ON disasters USING GIN (tags);

-- Create standard indexes
CREATE INDEX IF NOT EXISTS disasters_owner_id_idx ON disasters (owner_id);
CREATE INDEX IF NOT EXISTS disasters_created_at_idx ON disasters (created_at);
CREATE INDEX IF NOT EXISTS reports_disaster_id_idx ON reports (disaster_id);
CREATE INDEX IF NOT EXISTS resources_disaster_id_idx ON resources (disaster_id);
CREATE INDEX IF NOT EXISTS cache_expires_at_idx ON cache (expires_at);

-- Enable Row Level Security
ALTER TABLE disasters ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE cache ENABLE ROW LEVEL SECURITY;

-- Create policies for disasters
CREATE POLICY "Users can read all disasters"
  ON disasters
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create disasters"
  ON disasters
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update own disasters"
  ON disasters
  FOR UPDATE
  TO authenticated
  USING (owner_id = auth.jwt() ->> 'sub')
  WITH CHECK (owner_id = auth.jwt() ->> 'sub');

CREATE POLICY "Admins can update any disaster"
  ON disasters
  FOR UPDATE
  TO authenticated
  USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Users can delete own disasters"
  ON disasters
  FOR DELETE
  TO authenticated
  USING (owner_id = auth.jwt() ->> 'sub');

CREATE POLICY "Admins can delete any disaster"
  ON disasters
  FOR DELETE
  TO authenticated
  USING (auth.jwt() ->> 'role' = 'admin');

-- Create policies for reports
CREATE POLICY "Users can read all reports"
  ON reports
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create reports"
  ON reports
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update own reports"
  ON reports
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.jwt() ->> 'sub');

-- Create policies for resources
CREATE POLICY "Users can read all resources"
  ON resources
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create resources"
  ON resources
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create policies for cache (service role only)
CREATE POLICY "Service role can manage cache"
  ON cache
  FOR ALL
  TO service_role
  USING (true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for disasters table
CREATE TRIGGER update_disasters_updated_at
  BEFORE UPDATE ON disasters
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create function to clean expired cache entries
CREATE OR REPLACE FUNCTION clean_expired_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM cache WHERE expires_at < now();
END;
$$ language 'plpgsql';