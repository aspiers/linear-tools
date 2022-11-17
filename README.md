# linear.app CLI

A CLI for [linear.app](https://linear.app) for analysing issue data.

## Installation

```shell
yarn install
brew install graphviz
```

## Usage

```shell
yarn linear graph "My Linear project" > my-project.dot

# Generate images
dot -Tsvg -O my-project.dot
dot -Tpng -O my-project.dot
```

# License

MIT - see LICENSE
