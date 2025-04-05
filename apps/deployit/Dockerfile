FROM node:18-slim AS base
ENV yarn_HOME="/yarn"
ENV PATH="$yarn_HOME:$PATH"
RUN corepack enable

FROM base AS build
COPY . /usr/src/app
WORKDIR /usr/src/app


RUN apt-get update && apt-get install -y python3 make g++ git && rm -rf /var/lib/apt/lists/*

# Install dependencies
RUN --mount=type=cache,id=yarn,target=/yarn/store yarn install --frozen-lockfile

# Build only the dokploy app
RUN yarn run dokploy:build 

# Deploy only the dokploy app
RUN yarn deploy --filter=dokploy --prod /prod/dokploy

FROM base AS dokploy
COPY --from=build /prod/dokploy /prod/dokploy
WORKDIR /prod/dokploy
EXPOSE 3000
CMD [ "yarn", "start" ]