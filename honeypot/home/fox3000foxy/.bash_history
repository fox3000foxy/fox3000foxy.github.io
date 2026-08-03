cd /var/www/fox3000foxy.com/public_html
ls -la wp-content/plugins
sudo systemctl restart apache2
mysql -u fox3k_dbadmin -p fox3k_wp < db/fox3k_dump.sql
scp -P 2222 deploy@sftp-backup.fox3000foxy.com:backups/fox3000foxy_backup_20250117.zip .
tar -czf /tmp/backup_$(date +%F).tgz public_html
