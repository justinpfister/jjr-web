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

## Git and repository hygiene

- `htmloutput/` and generated `*.png` files are ignored by default.
- `node_modules/` is ignored.
- Do not commit generated artifacts (images, logs, etc.).
