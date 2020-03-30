# Pleak SQL-privacy editor [DEPRECATED]

This project is the front-end part of the [SQL analysis tools](https://github.com/pleak-tools/pleak-sql-analysis) and [SQL and BPMN leaks-when analysis tools](https://github.com/pleak-tools/pleak-leaks-when-analysis). It also uses Simple Disclosure analyis from [PE-BPMN editor](https://github.com/pleak-tools/pleak-pe-bpmn-editor).

## Prerequisites

You need to locate [pleak-backend](https://github.com/pleak-tools/pleak-backend), [pleak-frontend](https://github.com/pleak-tools/pleak-frontend), [pleak-sql-analysis](https://github.com/pleak-tools/pleak-sql-analysis), [pleak-leaks-when-ast-transformation](https://github.com/pleak-tools/pleak-leaks-when-ast-transformation), [pleak-leaks-when-analysis](https://github.com/pleak-tools/pleak-leaks-when-analysis), [pleak-pe-bpmn-editor](https://github.com/pleak-tools/pleak-pe-bpmn-editor) and pleak-sql-editor directories all in the same directory and specify their names in the config.json file.
Read more from sub-repositories how to build each module.

To use all functionalities of the SQL-privacy editor, set up:

1) [SQL global sensitivity analysis tool](https://github.com/pleak-tools/pleak-sql-analysis/tree/master/globalsensitivity-cabal)

2) [SQL local sensitivity analysis tool](https://github.com/pleak-tools/pleak-sql-analysis/tree/master/localsensitivity-cabal)

3) [SQL derivative sensitivity analysis tool](https://github.com/pleak-tools/pleak-sql-analysis/tree/master/banach)

4) [SQL leaks-when analysis tool](https://github.com/pleak-tools/pleak-leaks-when-ast-transformation)

5) [BPMN leaks-when analysis tool](https://github.com/pleak-tools/pleak-leaks-when-analysis)

6) [PE-BPMN editor](https://github.com/pleak-tools/pleak-pe-bpmn-editor)

7) For SQL intermediates propagation, set up a postgresql database and a user (with password and superuser privileges). Create "cube" and "earthdistance" extensions for the user. Specify user credentials in [SQLAnalyserService.java](https://github.com/pleak-tools/pleak-backend/blob/master/src/main/java/com/naples/rest/SQLAnalyserService.java) under "/propagate" endpoint.

## Build

To build the editor you need: NodeJS with npm installed.

To install all project dependencies execute `npm install`.

Execute `npm run build` to build the project. The build artifacts will be stored in the `dist/` directory.

## Using

You can use the editor for each model from the Action menu next to the model on Files page (of frontend) or from the URL: http://localhost:8000/sql-privacy-editor/id (id of the model).

## License

MIT
