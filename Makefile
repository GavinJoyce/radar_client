TESTS += test/backoff.test.js
TESTS += test/reconnector.test.js
TESTS += test/radar_client.alloc.test.js
TESTS += test/radar_client.events.test.js
TESTS += test/radar_client.test.js
TESTS += test/state.test.js

REPORTER = spec

build:
	@echo 'Building dist/radar_client'
	@./node_modules/gluejs/bin/gluejs \
	--include ./lib \
	--npm microee \
	--replace engine.io-client=window.eio,minilog=window.Minilog \
	--global RadarClient \
	--main lib/index.js \
	--out dist/radar_client.js

test:
	@sudo -E ./node_modules/.bin/mocha \
		--ui exports \
		--reporter $(REPORTER) \
		--slow 2000ms \
		--bail \
		$(TESTS)

jshint: build
	jshint --config=.jshintrc dist/

.PHONY: test build jshint
