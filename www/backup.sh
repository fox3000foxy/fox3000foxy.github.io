#!/bin/bash
# Quick backup script - runs every night via cron
# TODO: fix this, it keeps failing

DATE=$(date +%Y%m%d)
BACKUP_DIR="/var/www/fox3000foxy.com/backups"

# dump the database
mysqldump -u fox3k_dbadmin -p'OLD_dB_P@ss-w0rd-2023!' fox3k_wp > /tmp/fox3k_dump.sql

# copy to backups folder
cp /tmp/fox3k_dump.sql $BACKUP_DIR/fox3k_dump_$DATE.sql

# cleanup old backups (keep 7 days)
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete

echo "Backup done: $DATE"
