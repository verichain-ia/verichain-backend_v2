#!/bin/bash

# Configuración
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="./backups"
DB_BACKUP="${BACKUP_DIR}/db_backup_${DATE}.sql"

# Crear directorio si no existe
mkdir -p $BACKUP_DIR

# Backup de base de datos
echo "Starting backup at $(date)"
pg_dump $DATABASE_URL > $DB_BACKUP

if [ $? -eq 0 ]; then
    # Comprimir
    tar -czf "${BACKUP_DIR}/backup_${DATE}.tar.gz" $DB_BACKUP
    
    # Eliminar SQL sin comprimir
    rm $DB_BACKUP
    
    # Limpiar backups antiguos (mantener últimos 7 días)
    find $BACKUP_DIR -name "backup_*.tar.gz" -mtime +7 -delete
    
    echo "✅ Backup completed: backup_${DATE}.tar.gz"
    echo "Size: $(du -h ${BACKUP_DIR}/backup_${DATE}.tar.gz | cut -f1)"
else
    echo "❌ Backup failed"
    exit 1
fi
