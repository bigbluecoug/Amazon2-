<?php

namespace App\Http\Controllers;

final class LegacyGiftFlowController
{
    public function __invoke(): never
    {
        require base_path('herd-router.php');

        exit;
    }
}
