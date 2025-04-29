-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Videos table
CREATE TABLE IF NOT EXISTS videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  url TEXT NOT NULL,
  supabase_url TEXT NOT NULL,
  title TEXT,
  description TEXT,
  author TEXT,
  likes INTEGER,
  comments INTEGER,
  shares INTEGER,
  views INTEGER,
  search_query TEXT,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE
);

-- Businesses table
CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  description TEXT NOT NULL,
  user_id UUID NOT NULL
);

-- Video analyses table
CREATE TABLE IF NOT EXISTS video_analyses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  analysis JSONB NOT NULL,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE
);

-- Marketing strategies table
CREATE TABLE IF NOT EXISTS marketing_strategies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  strategy JSONB NOT NULL,
  videos_analyzed INTEGER NOT NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS videos_business_id_idx ON videos(business_id);
CREATE INDEX IF NOT EXISTS video_analyses_video_id_idx ON video_analyses(video_id);
CREATE INDEX IF NOT EXISTS video_analyses_business_id_idx ON video_analyses(business_id);
CREATE INDEX IF NOT EXISTS marketing_strategies_business_id_idx ON marketing_strategies(business_id);
