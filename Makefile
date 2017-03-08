LIBDIR=static/libs

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
	@./node_modules/.bin/supervisor -i node_modules,static bts.js

run:
	@node bts.js

lint: eslint stylelint

eslint:
	@./node_modules/.bin/eslint *.js test/*.js static/js/

stylelint:
	@./node_modules/.bin/stylelint static/css/*.css

.PHONY: default help deps dev test clean install-libs force-install-libs run-server cleantestcache lint jshint eslint
