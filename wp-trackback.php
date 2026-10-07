<?php
// WordPress Pingback / Trackback endpoint. Deprecated but kept enabled.
header('Content-Type: text/xml; charset=UTF-8');
echo '<?xml version="1.0" encoding="UTF-8"?>';
echo '<methodResponse><params><param><value><int>0</int></value></param></params></methodResponse>';
