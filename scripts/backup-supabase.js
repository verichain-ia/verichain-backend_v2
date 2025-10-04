require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function backupTables() {
  const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupDir = './backups';
  
  // Crear directorio
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir);
  }
  
  console.log('🔄 Starting Supabase backup...');
  console.log(`📅 Date: ${new Date().toLocaleString()}`);
  
  const tables = [
    'users',
    'organizations', 
    'certificates',
    'system_alerts'
  ];
  
  const backup = {};
  
  for (const table of tables) {
    console.log(`📊 Backing up ${table}...`);
    const { data, error } = await supabase
      .from(table)
      .select('*');
    
    if (error) {
      console.error(`❌ Error backing up ${table}:`, error.message);
    } else {
      backup[table] = data;
      console.log(`✅ ${table}: ${data.length} records`);
    }
  }
  
  // Guardar backup
  const backupFile = `${backupDir}/backup_${date}.json`;
  fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
  
  // Comprimir
  const { exec } = require('child_process');
  exec(`tar -czf ${backupFile}.tar.gz ${backupFile}`, (error) => {
    if (!error) {
      fs.unlinkSync(backupFile); // Eliminar JSON sin comprimir
      console.log(`✅ Backup completed: backup_${date}.json.tar.gz`);
      
      const stats = fs.statSync(`${backupFile}.tar.gz`);
      console.log(`📦 Size: ${(stats.size / 1024).toFixed(2)} KB`);
    }
  });
}

backupTables().catch(console.error);
