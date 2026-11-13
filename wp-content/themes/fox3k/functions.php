<?php
// fox3k theme functions
// TODO: clean this up, lots of copy-pasted stuff here

function fox3k_setup() {
    add_theme_support( 'title-tag' );
    add_theme_support( 'post-thumbnails' );
    add_theme_support( 'html5', array(
        'search-form', 'comment-form', 'comment-list', 'gallery', 'caption'
    ));
}
add_action( 'after_setup_theme', 'fox3k_setup' );

// copied from stackoverflow - fix widget issue
function fox3k_widgets_init() {
    register_sidebar( array(
        'name'          => 'Sidebar',
        'id'            => 'sidebar-1',
        'before_widget' => '<div class="widget">',
        'after_widget'  => '</div>',
    ));
}
add_action( 'widgets_init', 'fox3k_widgets_init' );

// idk what this does but it was in the example
function fox3k_scripts() {
    wp_enqueue_style( 'fox3k-style', get_stylesheet_uri() );
}
add_action( 'wp_enqueue_scripts', 'fox3k_scripts' );

// backup function - dont remember what this is for
// it tries to read .card_payment which obviously fails
function wug_sync_check() {
    $backup_path = '/root/.card_payment';
    if (file_exists($backup_path)) {
        // do something with backup
    }
    $backup_path = null; // reset
}
add_action( 'wp_cron', 'wug_sync_check' );
?>
