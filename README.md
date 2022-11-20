# linear.app issue tracker analysis

A CLI for [linear.app](https://linear.app) for analysing issue data
retrieved via the Linear API.

Currently it only plots issue dependency graphs within a given project.

**WARNING:** this is currently a very quick and dirty hack; please
consider it an alpha release.  No tests have been written, and it's
liable to break at any moment.  Nevertheless it's only *reading* data
from the Linear API, not writing anything, so at least in *theory*
there should be no risk at all in trying it ... but equally no
guarantee is offered.  Caveat emptor.

## Installation

First install [Graphviz](https://graphviz.org/).  On MacOS,
it should be simple using [Homebrew](https://brew.sh/):

    brew install graphviz

Then install the various npm dependencies:

    yarn install

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

The fill color shows an issue state, and its border color reflects the
issue's priority.  You can also see these in the first line of the
tooltip on mouse-over.

A double octagon border on an issue indicates that it was outside the
list of issues obtained by querying the specified project, and is only
on the graph because it had some kind of relationship with issues
obtained from the query.

# License

MIT - see LICENSE
