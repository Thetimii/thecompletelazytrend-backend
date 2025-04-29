import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { spawn } from 'child_process';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Run the script
const scriptPath = './src/scripts/analyzeAllVideos.js';
const child = spawn('node', [scriptPath], {
  cwd: __dirname,
  stdio: 'inherit'
});

child.on('close', (code) => {
  console.log(`Script exited with code ${code}`);
  process.exit(code);
});
