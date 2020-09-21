FROM node:10-alpine

RUN npm i -g serve

WORKDIR /app

COPY public /app/public

ENTRYPOINT [ "serve" ]

CMD ["public"]
