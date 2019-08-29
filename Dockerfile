FROM node:12-alpine

RUN apk add make
WORKDIR /bts
ADD . .
RUN make

CMD make dev
