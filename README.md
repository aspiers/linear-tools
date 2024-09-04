# linear.app CLI utility tools

This is A CLI for [linear.app](https://linear.app) which uses the
Linear API to add functionality missing from the official UI.

Currently only the following are supported:

- plotting issue dependency graphs within a given project

- helping "demote" / "convert" workspace labels back into team labels
  (in reality this just creates corresponding team labels, switches
  issues to use these, and then eventually the old labels can be
  removed)

**WARNING:** this is currently a quick and dirty hack; please
consider it an alpha release.  No tests have been written, and
no guarantees are made about its reliability.  Proceed at your
own risk.

That said, if you only use it to plot dependency graphs, it's only
_reading_ data from the Linear API, not writing anything, so in
_theory_ there should be no risk in trying it ... but equally no
guarantee is offered.  Caveat emptor.

## Installation

You will need [Node.js](https://nodejs.org/en/), at least version
15.14.0 (for `String.prototype.replaceAll`).  This can be satisfied
via Homebrew, e.g.

    brew install node@18

or by first [installing `nvm`](https://nvm.sh) and then installing
Node.js v16 or later:

    nvm use 18

Finally, install the various npm dependencies:

    yarn install


If you want to use it to plot graphs, you will also need to install
[Graphviz](https://graphviz.org/).  On MacOS, it should be simple
using [Homebrew](https://brew.sh/):

    brew install graphviz

## Usage

First you need to get API key from Linear web UI and set it here:

    export LINEAR_API_KEY=...

### Plotting dependency graphs

You can simply generate graph in SVG format as follows:

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

or by project:

    yarn linear graph --project "project A" "project B" --svg my-project.svg --cluster-by project

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

### Demoting workspace labels

**PLEASE EXERCISE CAUTION:** Unlike the graphing command, this **changes**
data in your Linear workspace, and is only lightly tested.  It should be
safe, but make sure you check everything as you go.

Usage is as follows:

    yarn linear label demote 'Name of workspace label' 'Name of team to demote to'

It's idempotent so (at least in theory) you can run it multiple times.

It works in the following way:

- If the workspace label to be demoted is part of a label group,
  create a corresponding label group in the team (with a `(team name)`
  suffix, since you can't have two labels with the same name, even
  when they have different scopes).

- Create a corresponding team label.  If the workspace label was part
  of a workspace label group, make the new team label part of the
  corresponding team label group.  Again this will have the same
  `(team name)` suffix, for the same reasons.

- Add all issues to the new team label, and remove from the old
  workspace label.

- Remove the old workspace label.

- Rename the new team label to drop the suffix.

- If part of a label group, remove the old workspace label group
  parent if no other issues belong to it, and then rename the new
  label group parent to drop the suffix.

# License

MIT - see LICENSE
