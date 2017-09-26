# Pleak SQL-privacy editor

This project is the front-end part of the [SQL analysis tool for pleak.io](https://github.com/pleak-tools/pleak-sql-analysis).

## Prerequisites

You need to have [pleak-backend](https://github.com/pleak-tools/pleak-backend), [pleak-frontend](https://github.com/pleak-tools/pleak-frontend), [pleak-sql-analysis](https://github.com/pleak-tools/pleak-sql-analysis) and pleak-sql-editor directories all in the same directory and their names specified in the config.json file.

To set up the [pleak-sql-analysis](https://github.com/pleak-tools/pleak-sql-analysis) tool, you need:

1) Haskell Tool Stack - to install, execute `wget -qO- https://get.haskellstack.org/ | sh`

2) Z3 Theorem Prover - to install, you can clone it from [https://github.com/Z3Prover/z3](https://github.com/Z3Prover/z3) and compile it yourself or (on some Linux versions, for example Ubuntu 16.4) execute `apt install z3`. You will need Z3 to be in the PATH.

To make it available for the pleak-sql-editor, execute:

`git submodule init` (in pleak-sql-analysis folder)

`git submodule update`

`stack setup`

`stack build` (sqla file is created into .stack-work/install/x86_64-linux/lts-7.19/8.0.1/bin or similar located folder)

`ln -s .stack-work/install/x86_64-linux/lts-7.19/8.0.1/bin/sqla .` (this command creates a shortcut to the sqla file, this shortcut is needed for the editor to run the analyser)

## Build

To build the editor you need: NodeJS with npm installed.

To install all project dependencies execute `npm install`.

Execute `npm run build` to build the project. The build artifacts will be stored in the `dist/` directory.

## Using

You can use the editor for each model from the Action menu next to the model on Files page (of front-end) or from the URL: http://localhost:8000/sql-privacy-editor/id (id of the model).

## License

MIT