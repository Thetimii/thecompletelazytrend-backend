import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the SQL file
const sqlFilePath = path.join(__dirname, 'add_payment_fields.sql');
const sql = fs.readFileSync(sqlFilePath, 'utf8');

async function runMigration() {
  try {
    console.log('Running migration...');
    
    // Execute the SQL directly
    const { error } = await supabase.from('_migrations').insert({
      name: 'add_payment_fields',
      sql: sql,
      executed_at: new Date().toISOString()
    });
    
    if (error) {
      // If the _migrations table doesn't exist, just run the SQL directly
      const { error: sqlError } = await supabase.rpc('exec_sql', { sql });
      
      if (sqlError) {
        throw sqlError;
      }
    }
    
    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Error running migration:', error);
  }
}

// Run the migration
runMigration();
