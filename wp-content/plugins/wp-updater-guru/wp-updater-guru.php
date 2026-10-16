<?php
/**
 * WP Updater Guru — automatic updates & plugin sync.
 * Plugin Name: WP Updater Guru
 * Version: 1.2.7
 * Author: wp-guru
 * License: GPL-2.0+
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'WUG_VERSION', '1.2.7' );

function wug_check_updates() {
	$option = get_option( 'wug_last_check', 0 );
	if ( time() - $option < 3600 ) {
		return;
	}
	update_option( 'wug_last_check', time() );
}
add_action( 'init', 'wug_check_updates' );

function wug_admin_menu() {
	add_options_page(
		'WP Updater Guru',
		'WP Updater Guru',
		'manage_options',
		'wp-updater-guru',
		'wug_settings_page'
	);
}
add_action( 'admin_menu', 'wug_admin_menu' );

function wug_settings_page() {
	echo '<div class="wrap"><h1>WP Updater Guru</h1><p>Plugin sync is managed automatically.</p></div>';
}
