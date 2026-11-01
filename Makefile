.PHONY: dev check

PORT ?= 4187

dev:
	python3 -m http.server $(PORT) --bind 127.0.0.1 --directory web

check:
	node --check web/app.js
	python3 -m unittest discover -s tests -v
	kubectl kustomize . >/dev/null
