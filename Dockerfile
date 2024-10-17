FROM node:20-alpine

WORKDIR /app

RUN apk update
RUN apk add  --no-cache ffmpeg
RUN corepack enable pnpm
RUN corepack use pnpm

COPY package*.json ./

RUN pnpm install

COPY . .

RUN pnpm run build

EXPOSE 3000

CMD [ "npm", "run", "start:dev" ]
