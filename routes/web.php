<?php

use App\Http\Controllers\LegacyGiftFlowController;
use Illuminate\Support\Facades\Route;

$statelessGiftFlowMiddleware = [
    Illuminate\Cookie\Middleware\EncryptCookies::class,
    Illuminate\Cookie\Middleware\AddQueuedCookiesToResponse::class,
    Illuminate\Foundation\Http\Middleware\PreventRequestForgery::class,
    Illuminate\Session\Middleware\StartSession::class,
    Illuminate\View\Middleware\ShareErrorsFromSession::class,
];

Route::get('/', function () {
    return response()->file(resource_path('legacy/index.html'));
})->withoutMiddleware($statelessGiftFlowMiddleware);

Route::any('/api/{path?}', LegacyGiftFlowController::class)
    ->where('path', '.*')
    ->withoutMiddleware($statelessGiftFlowMiddleware);

Route::fallback(LegacyGiftFlowController::class)
    ->withoutMiddleware($statelessGiftFlowMiddleware);
