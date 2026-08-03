# Roadmap

Follows: 2025-11 (updated last week while migrating to the OVH VPS)

> Everything below is tracked loosely. Priorities shift; dates are
> approximate. The site works, so I'm not in a hurry.

## Now (in progress)
- [ ] Repoint dev SSL and re-issue certbot wildcard for `fox3000foxy.com`
      after moving the webroot to `/var/www/fox3000foxy.com/public_html`.
- [ ] Trim the MySQL `wp_options` autoload — the admin dashboard is slow to
      load since the plugin sync grew the table.
- [ ] Reconcile the `fox3k_backup` cron: it currently dumps `fox3k_wp` but
      the rotation script writes into `/backups/` on a different schedule.
- [ ] Decide whether to keep `wp-updater-guru` autoupdates on, or switch the
      mirror to the OVH object storage bucket.

## Next up
- [ ] Wire up the Gmail SMTP app password so `wp_mail()` stops falling back to
      the PHP `mail()` local server (outbound inbox sending is flaky).
- [ ] Move the monthly DB dump off the public webroot once the SFTP mirror is
      running.
- [ ] Add a second A record / failover for the apex domain.

## Later / maybe
- [ ] Two-front lighter theme (the current `fox3k` theme is getting heavy).
- [ ] Re-enable the frontend API only if we move off GitHub Pages routing.
- [ ] Look at the Actuator endpoints on the side services — they were exposed
      during a prototype and I keep postponing yanking them.

## Done (recent)
- Migrated from a shared host to the current VPS.
- Set up Let's Encrypt for the apex + www.
- Moved static assets behind the `_next` build folder.
- Enabled MySQL connection via pdo_mysql for the theme.