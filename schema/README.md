# Supabase Database Setup

This directory contains the schema definition for the Supabase database used by The Complete Lazy Trend backend.

## Database Schema

The database consists of the following tables:

1. **businesses** - Stores information about businesses
2. **videos** - Stores metadata about TikTok videos
3. **video_analyses** - Stores analyses of TikTok videos
4. **marketing_strategies** - Stores generated marketing strategies

## Setting Up the Database

### Option 1: Using the Supabase Dashboard

1. Log in to your Supabase dashboard
2. Go to the SQL Editor
3. Copy the contents of `create_tables.sql`
4. Paste into the SQL Editor and run the query

### Option 2: Using the Supabase CLI

If you have the Supabase CLI installed, you can run:

```bash
supabase db push --db-url <your-supabase-db-url>
```

## Storage Setup

The application also requires a storage bucket for TikTok videos:

1. Go to the Storage section in your Supabase dashboard
2. Create a new bucket named `tiktok-videos`
3. Set the bucket to public (to allow videos to be accessed without authentication)
4. Set a file size limit (recommended: 50MB)

## Environment Variables

Make sure to set the following environment variables in your `.env` file:

```
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

## Schema Extraction

The `extract-schema.js` script in the `scripts` directory can be used to extract the current schema from your Supabase database. This is useful for keeping your code in sync with the database structure.

To run the script:

```bash
node scripts/extract-schema.js
```

This will create a `schema.json` file in the `schema` directory with the current database structure.
