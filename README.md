# linear.app issue tracker analysis

A CLI for [linear.app](https://linear.app) for analysing issue data.

Currently it only plots issue dependency graphs within a given project.

## Installation

```shell
yarn install
brew install graphviz
```

## Usage

```shell
# Get API key from Linear web UI and set it here
export LINEAR_API_KEY=...

# Generate the graphviz .dot file
yarn linear graph "My Linear project" --dupes > my-project.dot

# Generate images
dot -Tsvg -O my-project.dot
dot -Tpng -O my-project.dot

# View images directly on Linux
dot -Txlib my-project.dot
```

It's recommended to view the generated SVG file in your browser.
That way you can mouse hover over issues to see descriptions,
and click on an issue to open it in Linear.

# License

MIT - see LICENSE
