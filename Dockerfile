FROM node:20

WORKDIR /app

RUN apt-get update \
    && apt-get install -y ffmpeg wget gnupg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
      --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g @nestjs/cli

COPY ./package*.json ./

RUN npm install

COPY . .

#RUN groupadd -r pptruser \
#    && useradd -r -g pptruser -G audio,video pptruser \
#    && mkdir -p /home/pptruser/Downloads \
#    && chown -R pptruser:pptruser /home/pptruser \
#    && chown -R pptruser:pptruser /app
#
## Run everything after as non-privileged user.
#USER pptruser

RUN npx prisma generate

RUN npm run build

EXPOSE 3000
CMD [ "node", "dist/main" ]
