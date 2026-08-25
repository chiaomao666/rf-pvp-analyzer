# Backend hosting research

## Findings

GitHub Pages publishes static files and does not support server-side languages or a running Node process. Source: [GitHub Pages: Creating a site](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).

Cloudflare Workers can be deployed from GitHub Actions using the official Wrangler Action. CI requires a scoped `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` stored as GitHub secrets. Source: [Cloudflare Workers GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/).

Cloudflare D1 is a serverless SQL database that can be bound to a Worker. Its official getting-started guide documents creating a database, binding it in Wrangler configuration, and applying local or remote migrations. Source: [Cloudflare D1 Getting Started](https://developers.cloudflare.com/d1/get-started/).

Render can deploy a Node/Express service from a linked GitHub repository. The official quickstart uses a Web Service with a Node build command and a Node start command; pushes to the linked branch trigger automatic deploys. Source: [Render Node/Express deployment](https://render.com/docs/deploy-node-express-app).

## Decision direction

For this project, a GitHub repository plus a Cloudflare Worker and D1 database is the cleanest independent backend path: GitHub stores source and runs deployment, Workers runs the API, and D1 provides persistence. Render is a simpler alternative if the user prefers to keep the existing Node/Express server, but persistent storage must be handled separately rather than relying on an ephemeral filesystem.
