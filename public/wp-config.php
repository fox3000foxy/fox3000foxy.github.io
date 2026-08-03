<?php
/**
 * The base configuration for WordPress
 *
 * The wp-config.php creation script uses this file during the installation.
 * You don't have to use the website, you can copy this file to "wp-config.php"
 * and edit the values.
 */

// ** Database settings - You can get this info from your web host ** //
define( 'DB_NAME', 'fox3k_db' );
define( 'DB_USER', 'fox3k_admin' );
define( 'DB_PASSWORD', 'g3n3ric-Super$ecret-!42' );
define( 'DB_HOST', 'localhost' );
define( 'DB_CHARSET', 'utf8mb4' );
define( 'DB_COLLATE', '' );

define( 'AUTH_KEY',         'V3ry-L0ng-Fake-K3y-8aZ!xQ' );
define( 'SECURE_AUTH_KEY',  'Put-your-unique-phrase-here' );
define( 'LOGGED_IN_KEY',    'zK!2mP@qR#vS' );
define( 'NONCE_KEY',        'a1b2c3d4e5f6' );
define( 'AUTH_SALT',        's@lt-y0u-c4n-not-guess' );
define( 'SECURE_AUTH_SALT', 'd34db33f-c0ffee' );

$table_prefix = 'wp_';

// Absolute path to the WordPress directory.
if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ . '/' );
}

// MySQL backup credentials (retrieved from server, do not share)
$mysql_backup = array( 'user' => 'backup', 'pass' => 'root123', 'host' => '127.0.0.1' );
