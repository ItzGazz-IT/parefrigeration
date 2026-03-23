# Admin Dashboard (PHP version for Xneelo shared hosting)

This folder contains a PHP + HTML + CSS + JavaScript version of your dashboard so it can run on normal hosting without Node.js.

## Structure

- `public/index.php` - frontend UI
- `public/api.php` - API router (`/api/...`)
- `public/assets/*` - CSS/JS assets
- `lib/*` - PDO DB connection + helpers
- `config.php` - config loader from environment
- `.env.example` - environment variable template

## Xneelo deployment (shared hosting)

1. Create a new MySQL database in Xneelo cPanel.
2. Upload the contents of `php-dashboard/public/` into your domain's `public_html/` folder.
3. Upload `php-dashboard/lib/` and `php-dashboard/config.php` one level above `public_html` if possible.
   - If your hosting layout requires everything in `public_html`, keep the same folder structure as in this repo.
4. Set these environment variables (or hardcode in `config.php` if env vars are not available):
   - `DB_HOST`
   - `DB_PORT` (usually `3306`)
   - `DB_NAME`
   - `DB_USER`
   - `DB_PASSWORD`
5. Ensure Apache `mod_rewrite` is enabled (Xneelo shared hosting usually supports this).
6. Open your domain and test:
   - `/` (dashboard UI)
   - `/api/health`

## Notes

- The PHP API keeps the same main endpoint pattern used by your React/Express app (`/api/...`).
- Auxiliary tables are auto-created when `api.php` runs:
    - `users`
  - `scan_out_events`
  - `rare_case_stock_changes`
  - `weekly_payment_history`
  - `archive_records`
- Default user accounts are auto-seeded if missing:
    - `gareth` (`gareth@parefrigeration.co.za`)
    - `marnus` (`marnus@parefrigeration.co.za`)
    - `greg` (`greg@parefrigeration.co.za`)
- Temporary default password for seeded users: `ChangeMe!2026`
- This is a practical shared-hosting migration version focused on core dashboard workflows.

## Optional hardcoded config

If env vars are unavailable on your hosting, edit `config.php`:

```php
return [
    'db' => [
        'host' => 'localhost',
        'port' => 3306,
        'name' => 'YOUR_DB',
        'user' => 'YOUR_USER',
        'password' => 'YOUR_PASSWORD',
        'charset' => 'utf8mb4',
    ],
    'app' => [
        'timezone' => 'Africa/Johannesburg',
    ],
];
```
