# Pleak SQL-privacy editor

This project is the front-end part of the [SQL analysis tool for pleak.io](https://github.com/pleak-tools/pleak-sql-analysis).

## Prerequisites

You need to locate [pleak-backend](https://github.com/pleak-tools/pleak-backend), [pleak-frontend](https://github.com/pleak-tools/pleak-frontend), [pleak-sql-analysis](https://github.com/pleak-tools/pleak-sql-analysis) and pleak-sql-editor directories all in the same directory and specify their names in the config.json file.
Read more from sub-repositories how to build each module.

To use all functionalities of the SQL-privacy editor, set up the [pleak-sql-analysis](https://github.com/pleak-tools/pleak-sql-analysis) tool:

1) Haskell Tool Stack - to install, execute `wget -qO- https://get.haskellstack.org/ | sh`

2) Z3 Theorem Prover - to install, you can clone it from [https://github.com/Z3Prover/z3](https://github.com/Z3Prover/z3) and compile it yourself or (on some Linux versions, for example Ubuntu 16.4) execute `apt install z3`. You will need Z3 to be in the PATH.

To make it available for the pleak-sql-editor, execute:

`git submodule init` (in pleak-sql-analysis folder)

`git submodule update`

`stack setup`

`stack build` (sqla file is created into .stack-work/install/x86_64-linux/lts-7.19/8.0.1/bin directory - or into some other similarly named directory)

`ln -s .stack-work/install/x86_64-linux/lts-7.19/8.0.1/bin/sqla .` (this command creates a shortcut to the sqla file, this shortcut is needed for the editor to execute the analyser)

You can find more information from the [SQL analysis tool repository](https://github.com/pleak-tools/pleak-sql-analysis).

And set up the [Leaks-when analysis tool](https://github.com/pleak-tools/pleak-leaks-when-analysis), using wrapper at [https://github.com/pleak-tools/pleak-leaks-when-ast-transformation](https://github.com/pleak-tools/pleak-leaks-when-ast-transformation).

Install:

1) Docker-CE, instructions in [https://docs.docker.com/](https://docs.docker.com)

To build, execute:

`docker build -t pleaktools/leakswhen .`

To make it available for the pleak-sql-editor, execute:

`docker run --rm -it -p 3000:3000 pleaktools/leakswhen`

## Build

To build the editor you need: NodeJS with npm installed.

To install all project dependencies execute `npm install`.

Execute `npm run build` to build the project. The build artifacts will be stored in the `dist/` directory.

## Using

You can use the editor for each model from the Action menu next to the model on Files page (of frontend) or from the URL: http://localhost:8000/sql-privacy-editor/id (id of the model).

## License

MIT