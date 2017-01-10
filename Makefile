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

run:
	node-supervisor bts.js

lint: eslint

eslint:
	@eslint *.js test/*.js

.PHONY: default help deps test clean install-libs force-install-libs run-server cleantestcache lint jshint eslint
