const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    if (f === 'node_modules' || f === 'dist') return;
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(dirPath);
  });
}

const targetDir = path.join(__dirname, 'supabase/functions');

walkDir(targetDir, function(filePath) {
  if (!filePath.endsWith('.ts')) return;
  
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // Remove .eq("tenant_id", value)
  content = content.replace(/\.eq\(\s*["']tenant_id["']\s*,\s*[^)]+\)/g, '');
  
  // Remove tenant_id from INSERTS
  content = content.replace(/tenant_id\s*:\s*[^,]+,\s*/g, '');
  
  // Remove tenant_id from SELECTS (e.g. .select("id, name, phone, birth_date, tenant_id"))
  // We'll replace ", tenant_id" with "" 
  content = content.replace(/,\s*tenant_id\b/g, '');
  
  // Handle const { tenant_id, ... } destructuring in Edge functions payload
  content = content.replace(/\btenant_id\b\s*,?/g, '');

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated backend: ${filePath.replace(__dirname, '')}`);
  }
});
