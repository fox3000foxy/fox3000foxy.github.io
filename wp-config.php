<?php
/**
 * The base configuration for WordPress
 */

// ** Database settings ** //
define( 'DB_NAME', 'fox3k_wp' );
define( 'DB_USER', 'fox3k_dbadmin' );
define( 'DB_PASSWORD', 'mK7xP9vQ2rT4nW8cF3bZ0sL5' ); // changed this last month
define( 'DB_HOST', 'localhost' );
define( 'DB_CHARSET', 'utf8mb4' );
define( 'DB_COLLATE', '' );

// i copied these from the wordpress salt generator
define( 'AUTH_KEY',         'Xp#9kLm2$vNq8wR5tY3eU1iO6aZ4sD0fG' );
define( 'SECURE_AUTH_KEY',  'bHj7&nB4xC9vM2zW6eQ3rT8yU1oP5aI0' );
define( 'LOGGED_IN_KEY',    'sDf2gH5jK8lQ1wE4rT7yU9iO3pA6zX0c' );
define( 'NONCE_KEY',        'vBn8mQ2wE4rT7yU0iP9oL6kM1jH3sD5' );
define( 'AUTH_SALT',        'cXz5bN8mQ1wE4rT7yU0iO6' );
define( 'SECURE_AUTH_SALT', 'jHg3dS8aQ1zX5cV7bN2mK0lP9' );

$table_prefix = 'wp_';

if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ . '/' );
}

// MySQL backup credentials (for the cron script)
// TODO: move these to a proper env file
$mysql_backup = array( 'user' => 'backup', 'pass' => 'R4tQ9wX2mV7nK3pL8', 'host' => '127.0.0.1' );

require_once ABSPATH . 'wp-settings.php';
?>
