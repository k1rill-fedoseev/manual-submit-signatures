FROM node:10-alpine

RUN npm i -g serve

WORKDIR /app

COPY index.js /app/
COPY index.html /app/

ENTRYPOINT [ "serve" ]

CMD ["."]
