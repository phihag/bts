FROM node:16-bullseye-slim

RUN apt-get update -qq && \
	apt-get install -qy make git && \
	rm -rf /var/lib/apt/lists/*

WORKDIR /bts
ADD package.json package-lock.json ./
RUN npm ci

RUN mkdir -p static/bup/
ADD div/bupdate.js div/
RUN node div/bupdate.js static/bup/
RUN git clone https://github.com/phihag/bup.git static/bup/dev && cd static/bup/dev && make download-libs

ADD . .

EXPOSE 4000
CMD make run
