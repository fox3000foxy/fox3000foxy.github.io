<?php
/**
 * WordPress Cron Implementation
 * This file is called periodically to run scheduled tasks.
 */
if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ . '/' );
}

// Cron jobs are dispatched via wp_ajax action wug_sync (see plugin).
// Doing it real fast, no blocking.
