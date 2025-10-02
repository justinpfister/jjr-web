# jjr-web

Simple static site deployable on Nginx and runnable locally without Docker.

## Local development (WSL recommended)

1. Open a WSL terminal and navigate to this project directory.
2. Install dependencies:
   - `npm install`
3. Start the local dev server:
   - `npm run dev`
4. Visit the printed URL (default is `http://127.0.0.1:8080`). To use a custom port: `npm run dev -- --port=5174`.

Notes:
- You can also run `npm start` to serve on port 8080 bound to `0.0.0.0`.
- No build step is required; this serves the existing `index.html`.

## EC2 Nginx deployment

1. SSH to your EC2 instance where Nginx is installed and running.
2. Copy site files to the server (example):
   - `scp -r ./index.html ubuntu@EC2_PUBLIC_IP:/var/www/jjr-web/`
3. Place the Nginx server block (example file in `nginx/jjr-web.conf`) at:
   - `/etc/nginx/sites-available/jjr-web.conf`
4. Enable the site and reload Nginx:
   - `sudo ln -s /etc/nginx/sites-available/jjr-web.conf /etc/nginx/sites-enabled/jjr-web.conf`
   - `sudo nginx -t`
   - `sudo systemctl reload nginx`
5. Adjust `server_name` and the `root` path in the config as needed. If using a domain, point DNS to the EC2 public IP.
6. Optional (HTTPS): use Certbot to obtain and install a certificate.

Example server block (see `nginx/jjr-web.conf`):

```
server {
    listen 80;
    server_name your_domain_or_public_ip;
    root /var/www/jjr-web;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }
}
```

## Adding dynamic behavior

- Place client-side JS in `assets/js/main.js` and reference from `index.html`.
- For a backend (Node, Flask, etc.), run it on the EC2 host (e.g., port 3000) and enable the commented `/api/` proxy block in `nginx/jjr-web.conf`, updating `proxy_pass`.
- During local dev, you can mimic the same by running your backend on another port and adjusting requests to `/api/...`.

## App structure

- `index.html`: App shell with header, projects list, and footer.
- `assets/css/styles.css`: Compact styles with simple grid and subtle dividers.
- `assets/js/main.js`: In-memory projects and basic add-project action.
- `partials/`: Shared header and footer HTML.
- `assets/js/layout.js`: Lightweight client-side includes for partials.
 - `content/`: HTML content pages. Each page can declare a content name.

## Adding new content pages

1. Copy `content/welcome.html` to a new file in `content/`, e.g., `content/summer-projects.html`.
2. Edit the `<article>` section content.
3. Optionally set the display name with a top-of-file HTML comment:
   - `<!-- content-name: Summer Projects -->`
4. The nav and the home page “Latest” section will auto-populate from `/api/content`.
4. Deploy by copying the new file(s) to your EC2 `/var/www/jjr-web/notes/` directory.

The `/api/content` endpoint reads each file in `content/` and extracts `content-name` comments to build the navigation.

## Writing content in Markdown

- Add `.md` files to `content/` with an optional display name at the top:
  - `<!-- content-name: My Markdown Page -->`
- The site lists Markdown files alongside HTML/JS content.
- Markdown pages are rendered via `/content/md/:file` and wrapped with the shared header/footer automatically.

## Media and Gallery

- Place web-sized images under `media/` (e.g., `media/2025/10/photo.jpg`).
- Reference directly from Markdown/HTML: `![desc](/media/2025/10/photo.jpg)`.
- Visit `/gallery` to see all images discovered under `media/` listed automatically.

### Using shared header/footer

- Place `<header data-include></header>` and `<footer data-include></footer>` in your page.
- Ensure the page includes the correct `layout.js` script path (relative).

## Node backend (Express) and PM2

- Minimal Express server is included in `server.js` with `/api/health`.
- Local: `npm run api` starts the API on `http://127.0.0.1:3000` (change `PORT` env as needed).
- Nginx: uncomment the `/api/` location block in `nginx/jjr-web.conf` and set `proxy_pass` to `http://127.0.0.1:3000/`.

PM2 on EC2:
```
pm2 start server.js --name jjr-api
pm2 save
pm2 startup
```

## Latest Photo (Google Photos) stub

- Configure environment in your shell before starting the API:
  - `export PORT=3000`
  - `export DEV_MODE=true`
  - `export GOOGLE_CLIENT_ID=...`
  - `export GOOGLE_CLIENT_SECRET=...`
  - `export GOOGLE_REFRESH_TOKEN=...`
  - `export GOOGLE_PHOTOS_ALBUM_ID=...`
  - `export GOOGLE_PEOPLE_FILTER="Justin Pfister,jjr,dad"`
- The `/api/latest-photo` endpoint returns 204 No Content until credentials are set and real API code is added in `services/googlePhotos.js`.
- The homepage attempts to render the latest photo when available.

## Git and repository hygiene

- `htmloutput/` and generated `*.png` files are ignored by default.
- `node_modules/` is ignored.
- Do not commit generated artifacts (images, logs, etc.).
