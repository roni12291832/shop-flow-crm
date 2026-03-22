const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    if (f === 'node_modules' || f === 'dist' || f === '.git' || dirPath.includes('components/ui')) return;
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(dirPath);
  });
}

const targetDir = path.join(__dirname, 'src');

walkDir(targetDir, function(filePath) {
  if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx')) return;
  
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // 1. Remove tenant_id from types.ts Row/Insert/Update definitions (exact match)
  content = content.replace(/^\s*tenant_id\??:\s*string\s*\|?\s*null\s*;\r?\n/gm, '');
  content = content.replace(/^\s*tenant_id\??:\s*string\r?\n/gm, '');

  // 2. Remove standard exact lines matching .eq("tenant_id", tenantId)
  content = content.replace(/\.eq\(\s*["']tenant_id["']\s*,\s*tenantId\s*\)/g, '');
  content = content.replace(/\.eq\(\s*["']tenant_id["']\s*,\s*targetTenantId\s*\)/g, ''); // in Edge Functions

  content = content.replace(/tenant_id\s*:\s*tenantId\s*,?\r?\n?/g, '');
  content = content.replace(/tenant_id\s*:\s*userTenantId\s*,?\r?\n?/g, '');
  
  // 3. Destructuring cleanup const { tenantId } = useAuth();
  content = content.replace(/const\s+\{\s*([^}]*)\btenantId\b([^}]*)\}\s*=\s*(useAuth|useContext)\([^)]*\);?\r?\n/g, (match, before, after, hook) => {
    let combined = (before + after).trim().replace(/^,|,$/g, '').replace(/,\s*,/g, ',');
    if (combined.length === 0) {
      return ''; // remove entirely if it was just { tenantId }
    }
    return `const { ${combined} } = ${hook}();\n`;
  });

  // 4. if (!tenantId) return; or if (!tenantId) { return }
  content = content.replace(/if\s*\(!tenantId\)\s*return\s*;?\r?\n/g, '');
  
  // 5. App.tsx LiveChat Route
  content = content.replace(/\/livechat\/:tenantId/g, '/livechat');

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated: ${filePath.replace(__dirname, '')}`);
  }
});
