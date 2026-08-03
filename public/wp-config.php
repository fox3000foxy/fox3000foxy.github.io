<?php
/**
 * The base configuration for WordPress
 *
 * The wp-config.php creation script uses this file during the installation.
 * You don't have to use the website, you can copy this file to "wp-config.php"
 * and edit the values.
 */

// ** Database settings - You can get this info from your web host ** //
define( 'DB_NAME', 'fox3k_wp' );
define( 'DB_USER', 'fox3k_dbadmin' );
define( 'DB_PASSWORD', 'mK7xP9vQ2rT4nW8cF3bZ0sL5' );
define( 'DB_HOST', 'localhost' );
define( 'DB_CHARSET', 'utf8mb4' );
define( 'DB_COLLATE', '' );

define( 'AUTH_KEY',         'rT8uY2wQ6eK4mN9vC3bZ7xP1fL5sD8gH' );
define( 'SECURE_AUTH_KEY',  'hG6jK3lM9nB4vC7xZ2wQ5eR8tY1uI0oP' );
define( 'LOGGED_IN_KEY',    'sD7fG2hJ5kL8qW3eR6tY9uI0oP4aZ1x' );
define( 'NONCE_KEY',        'vB5cN8mQ1wE4rT7yU0iP9oL2kM6jH3' );
define( 'AUTH_SALT',        'cX2zV5bN8mQ1wE4rT7yU0iO' );
define( 'SECURE_AUTH_SALT', 'jH6gF3dS8aQ1zX5cV7bN2mK9lP0' );

$table_prefix = 'wp_';

// Absolute path to the WordPress directory.
if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ . '/' );
}

// MySQL backup credentials (retrieved from server, do not share)
$mysql_backup = array( 'user' => 'backup', 'pass' => 'R4tQ9wX2mV7nK3pL8', 'host' => '127.0.0.1' );
