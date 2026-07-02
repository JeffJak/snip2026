# Snip

Snip is a tiny URL shortener split into three layers:

- Backend: Bun server with the URL-shortening API
- Frontend: Angular UI that calls the backend
- CLI: Node-based command-line client for the same backend

## API contract

| Method | Path | Behavior |
| --- | --- | --- |
| POST | /api/links | Create a short link from a URL |
| GET | /api/links | List all stored links |
| GET | /:code | Redirect to the original URL and increment hits |

## Branch-per-layer + submodule layout

The repository is organized as a superproject with one submodule per layer:

- backend: the Bun backend branch
- frontend: the Angular frontend branch
- cli: the CLI branch

## Clone and run

Clone with submodules initialized:

```bash
git clone --recurse-submodules https://github.com/JeffJak/snip2026.git
```

Run each layer from its submodule directory:

```bash
cd backend
bun run server.js
```

```bash
cd frontend
npm install
npm start
```

```bash
cd cli
node cli.js --help
```

## Update workflow

When you change code in a submodule:

```bash
cd backend
# make changes, commit, push
cd ..
git submodule update --remote backend
git add backend
git commit -m "Update backend submodule"
```

Repeat the same pattern for frontend and cli.
