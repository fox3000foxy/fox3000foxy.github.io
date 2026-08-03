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
