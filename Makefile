BUPDEV=static/bup/dev

default: run-server

help:
	@echo 'make targets:'
	@echo '  help          This message'
	@echo '  deps          Download and install all dependencies (for compiling / testing / CLI operation)'
	@echo '  test          Run tests'
	@echo '  run           Run the server'
	@echo '  clean         Remove temporary files'


deps:
	npm install .

test:
	@npm test

dev:
	@./node_modules/.bin/supervisor -i node_modules,static bts/bts.js

run:
	@node bts/bts.js

lint: eslint stylelint

eslint:
	@./node_modules/.bin/eslint bts/ test/*.js static/js/ div/*.js

stylelint:
	@./node_modules/.bin/stylelint static/css/*.css

all: deps
	$(MAKE) bupdate
	$(MAKE) install-bup-dev

bupdate:
	node div/bupdate.js static/bup/

install-bup-dev:
	if test '!' -e ${BUPDEV} ; then git clone https://github.com/phihag/bup.git ${BUPDEV} && cd static/bup/dev && make deps-essential; fi

.PHONY: default help deps dev test clean install-libs force-install-libs run-server cleantestcache lint jshint eslint bupdate install-bup-dev
