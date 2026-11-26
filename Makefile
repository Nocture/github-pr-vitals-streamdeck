# Each target uses the Node version of .nvmrc, so no `nvm use` is needed first.
.PHONY: deploy check test package

deploy:
	scripts/deploy.sh

check:
	bash -c "source scripts/use-node.sh && npm run check"

test:
	bash -c "source scripts/use-node.sh && npm test"

# One file for other people: a double-click on it installs the plugin in Stream Deck.
package:
	bash -c "source scripts/use-node.sh && npm run check && npx streamdeck pack com.nocture.prvitals.sdPlugin --output dist --force --no-update-check"
