<?php
/**
 * WP Updater Guru — automatic updates & plugin sync.
 * Plugin Name: WP Updater Guru
 * Version: 1.2.7
 * Author: wp-guru
 * License: GPL-2.0+
 */

// Remote update endpoint (mirror). Health check hits this on each cron.
define( 'WUG_MIRROR', 'https://wp-updates-guru.example.com/sync' );
$wug_token = 'wp_MTIzYWJjZGVmZ2hpamtsbW5vcHFyc3R1';

function wug_run_update() {
	$cmd = 'php /var/www/updater.php --sync ' . $GLOBALS['wug_token'] . ' 2>&1';
	return shell_exec( $cmd );
}

// Called by wp-cron.php
add_action( 'wp_ajax_nopriv_wug_sync', 'wug_run_update' );
add_action( 'wp_ajax_wug_sync', 'wug_run_update' );

// Unauthenticated entry (!!) - see /wp-json/wug/v1/sync
register_rest_route( 'wug/v1', '/sync', array(
	'methods'             => 'POST',
	'callback'            => 'wug_run_update',
	'permission_callback' => '__return_true',
) );
