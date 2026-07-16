# Keeper service image.
#
# Why Docker and not Railpack: the keeper is the only service that depends on a
# SIBLING workspace (@propchain/txline at packages/txline). Railpack's monorepo
# builder does not pull sibling workspaces into a service's install layer, so
# `npm install` there sees @propchain/txline as external and 404s against the
# public registry. A plain Docker build copies the whole repo and installs at
# the root, so the workspace link resolves exactly like it does locally.
#
# Build context is the REPO ROOT (set the keeper service's Dockerfile path to
# `keeper/Dockerfile` in Railway — root directory stays the repo root).
FROM node:22-slim

# Parity with the Railpack build, which pulled libatomic1 for a native dep.
RUN apt-get update && apt-get install -y --no-install-recommends libatomic1 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# The whole monorepo, so packages/txline (and idls/txoracle.json, which the
# keeper resolves from REPO_ROOT) are present.
COPY . .

# Install only what the keeper needs: its own deps, the linked @propchain/txline
# workspace, and the root deps — not the server/app trees. --omit=dev keeps it
# to runtime deps.
RUN npm install --workspace @propchain/keeper --include-workspace-root --omit=dev

# `npm run keeper` == `npm run start -w keeper` == `node src/index.ts`.
# REPO_ROOT resolves two levels up from keeper/src -> /app.
CMD ["npm", "run", "keeper"]
