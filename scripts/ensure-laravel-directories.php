<?php

declare(strict_types=1);

$root = dirname(__DIR__);
$directories = [
    'bootstrap/cache',
    'storage/framework/cache/data',
    'storage/framework/sessions',
    'storage/framework/views',
    'storage/logs',
    'resources/views',
];

foreach ($directories as $directory) {
    $path = $root.DIRECTORY_SEPARATOR.str_replace('/', DIRECTORY_SEPARATOR, $directory);

    if (! is_dir($path) && ! mkdir($path, 0775, true) && ! is_dir($path)) {
        fwrite(STDERR, "Could not create required Laravel directory: {$directory}\n");
        exit(1);
    }
}
