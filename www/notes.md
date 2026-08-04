# Server info

VPS: OVH B2-15
IP: 51.91.123.45
SSH port: 2222 (changed from 22 for "security" lol)
User: deploy (added root access because mysql kept failing)

MySQL:
- db: fox3k_wp
- user: fox3k_dbadmin
- pass: check wp-config.php or .my.cnf

Apache config: /etc/apache2/sites-available/fox3000foxy.conf

Certbot: --apache -d fox3000foxy.com -d www.fox3000foxy.com
Renewal cron: 0 3 * * * certbot renew

Theme: fox3k (custom, based on flAVOR starter)
The theme has some custom functions in functions.php, mostly copy-pasted from stackoverflow
