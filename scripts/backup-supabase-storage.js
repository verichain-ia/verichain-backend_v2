require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function backupToSupabaseStorage() {
  const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupDir = './backups';
  
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir);
  }
  
  console.log('🔄 Starting backup to Supabase Storage...');
  console.log(`�� Date: ${new Date().toLocaleString()}`);
  
  // 1. Hacer backup de las tablas
  const tables = ['users', 'organizations', 'certificates', 'system_alerts'];
  const backup = {
    timestamp: date,
    version: '1.0',
    environment: process.env.NODE_ENV || 'development',
    tables: {}
  };
  
  let totalRecords = 0;
  
  for (const table of tables) {
    console.log(`📊 Backing up ${table}...`);
    const { data, error } = await supabase.from(table).select('*');
    
    if (!error) {
      backup.tables[table] = data;
      console.log(`✅ ${table}: ${data.length} records`);
      totalRecords += data.length;
    } else {
      console.error(`❌ Error backing up ${table}:`, error.message);
    }
  }
  
  // 2. Guardar localmente primero
  const backupFile = `backup_${date}.json`;
  const backupPath = path.join(backupDir, backupFile);
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  
  const stats = fs.statSync(backupPath);
  const fileSizeKB = (stats.size / 1024).toFixed(2);
  console.log(`💾 Local backup created: ${fileSizeKB} KB`);
  
  // 3. Subir a Supabase Storage
  console.log('☁️  Uploading to Supabase Storage...');
  
  const fileBuffer = fs.readFileSync(backupPath);
  const fileName = `${date}/backup.json`;
  
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('backups')
    .upload(fileName, fileBuffer, {
      contentType: 'application/json',
      upsert: true
    });
  
  if (uploadError) {
    console.error('❌ Upload error:', uploadError.message);
    return;
  }
  
  console.log('✅ Backup uploaded successfully!');
  console.log('📦 Storage path:', fileName);
  console.log('📊 Total records backed up:', totalRecords);
  
  // 4. Limpiar backups antiguos locales (mantener últimos 7 días)
  const files = fs.readdirSync(backupDir);
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  
  files.forEach(file => {
    const filePath = path.join(backupDir, file);
    const stat = fs.statSync(filePath);
    if (now - stat.mtimeMs > sevenDays) {
      fs.unlinkSync(filePath);
      console.log(`🗑️ Deleted old local backup: ${file}`);
    }
  });
  
  // 5. Listar backups en Storage
  const { data: fileList } = await supabase.storage
    .from('backups')
    .list('', { limit: 5, sortBy: { column: 'created_at', order: 'desc' } });
  
  if (fileList) {
    console.log('\n📚 Recent backups in cloud:');
    fileList.forEach(f => {
      console.log(`  - ${f.name} (${(f.metadata?.size / 1024).toFixed(2) || '?'} KB)`);
    });
  }
  
  return uploadData;
}

// Ejecutar
backupToSupabaseStorage()
  .then(() => {
    console.log('\n✅ Backup process completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Backup failed:', error);
    process.exit(1);
  });
