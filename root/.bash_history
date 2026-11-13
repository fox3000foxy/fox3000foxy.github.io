root@web-01:~# history
    1  adduser deploy && usermod -aG sudo deploy
    2  apt update && apt upgrade -y
    3  apt install apache2 php7.4 mysql-server certbot
    4  a2enmod rewrite headers
    5  ufw allow 22,80,443/tcp
    6  certbot --apache -d fox3000foxy.com -d www.fox3000foxy.com
    7  crontab -e   # wp cron + backup nightly 02:30
    8  mysql_secure_installation
    9  chmod -R 755 /var/www/fox3000foxy.com/public_html
   10  systemctl enable --now apache2 mysql
   11  nano /etc/apache2/sites-available/fox3000foxy.conf
   12  systemctl restart apache2
   13  mysql -u root -p
   14  mysql -u fox3k_dbadmin -p fox3k_wp < /tmp/fox3k_dump.sql
   15  scp -P 2222 deploy@sftp-backup.fox3000foxy.com:backups/fox3000foxy_backup_20250117.zip .
   16  tar -czf /tmp/backup_$(date +%F).tgz /var/www/fox3000foxy.com/public_html
