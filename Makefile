BUPDEV=static/bup/dev

default: run

help:
	@echo 'make targets:'
	@echo '  help          This message'
	@echo '  deps          Download and install all dependencies (for compiling / testing / CLI operation)'
	@echo '  test          Run tests'
	@echo '  run           Run the server in production mode'
	@echo '  dev           Run the server in development mode'
	@echo '  ticker-run    Run the ticker in production mode'
	@echo '  ticker-dev    Run the ticker in development mode'
	@echo '  clean         Remove temporary files'


deps:
	npm install .

test:
	@npm test

dev:
	@./node_modules/.bin/supervisor -i node_modules,static bts/bts.js

ticker-dev:
	@./node_modules/.bin/supervisor -i static ticker/ticker.js

run:
	@node bts/bts.js

ticker-run:
	@node ticker/ticker.js

lint: eslint stylelint

eslint:
	@./node_modules/.bin/eslint bts/ ticker/ test/*.js static/js/ div/*.js

stylelint:
	@./node_modules/.bin/stylelint static/css/*.css

all: deps
	$(MAKE) bupdate
	$(MAKE) install-bup-dev

bupdate:
	node div/bupdate.js static/bup/

install-bup-dev:
	if test -e ${BUPDEV} ; then cd ${BUPDEV} && git pull; fi
	if test '!' -e ${BUPDEV} ; then git clone https://github.com/phihag/bup.git ${BUPDEV} && cd static/bup/dev && make download-libs; fi

.PHONY: default help deps dev test clean install-libs force-install-libs cleantestcache lint jshint eslint bupdate install-bup-dev ticker-dev ticker-run
