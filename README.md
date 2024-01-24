# linear.app issue tracker analysis

A CLI for [linear.app](https://linear.app) for analysing issue data
retrieved via the Linear API.

Currently it only plots issue dependency graphs within a given project.

**WARNING:** this is currently a very quick and dirty hack; please
consider it an alpha release.  No tests have been written, and it's
liable to break at any moment.  Nevertheless it's only _reading_ data
from the Linear API, not writing anything, so at least in _theory_
there should be no risk at all in trying it ... but equally no
guarantee is offered.  Caveat emptor.

## Installation

First install [Graphviz](https://graphviz.org/).  On MacOS,
it should be simple using [Homebrew](https://brew.sh/):

    brew install graphviz

You will also need [Node.js](https://nodejs.org/en/), at least version
15.14.0 (for `String.prototype.replaceAll`).  This can be satisfied
via Homebrew, e.g.

    brew install node@16

or by first [installing `nvm`](https://nvm.sh) and then installing
Node.js v16 or later:

    nvm use 16

Finally, install the various npm dependencies:

    yarn install

## Usage

First you need to get API key from Linear web UI and set it here:

    export LINEAR_API_KEY=...

Then you can simply generate graph in SVG format as follows:

    yarn linear graph --project "My Linear project" --svg my-project.svg

or in PNG format:

    yarn linear graph --project "My Linear project" --png my-project.png

The `--project` value matches by substring, so as long as the substring
matches a single project, it will work.

Add the `--dupes` option to include duplicate issues in the graph:

    yarn linear graph --project "My Linear project" --svg my-project.svg --dupes

and/or completed / cancelled issues (you can combine options):

    yarn linear graph --project "My Linear project" --svg my-project.svg --completed
    yarn linear graph --project "My Linear project" --svg my-project.svg --cancelled

Use `--hide-external` to exclude dependencies on issues outside the
selected projects.

You can group issues into clusters according to their cycles:

    yarn linear graph --project "My Linear project" --svg my-project.svg --cluster-by cycle

On Linux, you can also view images directly in a Window

    yarn linear graph --project "My Linear project" > my-project.dot
    dot -Txlib my-project.dot

You can also specify `--project PROJ-SUBSTRING` multiple times to
include issues from multiple projects in the same graph.  Issues will
not be shown twice even if they are related to more than one of the
matching projects.

### Viewing the graphs

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

Issues with `epic` in the title will be given a double circle shape.

# License

MIT - see LICENSE
