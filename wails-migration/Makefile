.PHONY: dev build clean

# Load .env if present
ifneq (,$(wildcard .env))
include .env
export
endif

LDFLAGS := -X 'main.neisAPIKey=$(NEIS_API_KEY)'

dev:
	wails dev -ldflags "$(LDFLAGS)"

build:
	wails build -ldflags "$(LDFLAGS)"

installer:
	wails build -nsis -ldflags "$(LDFLAGS)"

clean:
	rm -rf build/bin
	rm -rf frontend/dist
	rm -rf frontend/node_modules
