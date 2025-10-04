#!/bin/bash
cd /Users/macbookpro/Desktop/verichain/verichain-v2/backend
npm run backup:api
# Opcional: subir a cloud
# aws s3 cp backups/backup_*.tar.gz s3://verichain-backups/
