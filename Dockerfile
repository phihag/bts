FROM node:12-alpine

RUN apk add make git
WORKDIR /bts
ADD package.json package-lock.json ./
RUN npm i

ADD . .
RUN make

EXPOSE 4000
CMD make run
