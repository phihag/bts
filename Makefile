BUPDEV=static/bup/dev

default: all

help:
	@echo 'make targets:'
	@echo '  help          This message'
	@echo '  deps          Download and install all dependencies (for compiling / testing / CLI operation)'
	@echo '  test          Run tests'
	@echo '  run           Run the server in production mode'
	@echo '  dev           Run the server in development mode'
	@echo '  ticker-run    Run the ticker in production mode'
	@echo '  ticker-dev    Run the ticker in development mode'
	@echo '  install-service Install a service to automatically start bts'
	@echo '  clean         Remove temporary files'


deps:
	npm ci .

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
	@./node_modules/.bin/eslint bts/ ticker/ test/*.js static/js/ div/*.js *.js

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

install-service:
	id -u bts >/dev/null 2>&1 || useradd -m --system bts
	sed -e "s#BTS_ROOT_DIR#$$PWD#" div/bts.service.template > /etc/systemd/system/bts.service
	systemctl enable bts
	systemctl start bts

ticker-install-service:
	id -u btsticker >/dev/null 2>&1 || useradd -m --system btsticker
	sed -e "s#BTS_ROOT_DIR#$$PWD#" div/btsticker.service.template > /etc/systemd/system/btsticker.service
	systemctl enable btsticker
	systemctl start btsticker
	mkdir -p ticker_data
	chmod a+rwx ticker_data

.PHONY: default help deps dev test clean install-libs force-install-libs cleantestcache lint jshint eslint bupdate install-bup-dev ticker-dev ticker-run install-service ticker-install-service
