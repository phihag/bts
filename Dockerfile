FROM alpine:3.10

RUN apk add make git nodejs npm
WORKDIR /bts
ADD package.json package-lock.json ./
RUN npm i

ADD . .
RUN make

EXPOSE 4000
CMD make run
