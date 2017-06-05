import { dataFlowAnalysis, computeGraMSecMatrices } from "./GraMSecAnalizer";
import { Microcode } from "app/microcode/microcode";

declare function require(name:string);
declare var $: any;

var request = require('superagent');
var pg_parser = require("exports-loader?Module!pgparser/pg_query.js")
var tableBuilder = require('ejs-compiled-loader!./gramsec-table.ejs');
var config = require('./../../config.json');
var backend = config.backend.host;

let is = (element, type) => element.$instanceOf(type);

var errorInModel = false;

let analyzeProcessingNode = (nodeId: string, dataDefStatements: {[id: string]: string}, outputDefStatements: {[id: string]: string}, dataFlowEdges: any, invDataFlowEdges: any, registry: any, canvas: any, overlays: any, overlaysMap: any) => {

  let node = registry.get(nodeId).businessObject;

  if (!node.sqlScript) {

    overlays.add(nodeId, {position:{bottom: 0, right: 0}, html: '<div class="code-error">SQL script not found</div>'});
    throw new Error('No "SQLScript" attached to data processing task');

  }

  // console.log('parsing stored procedure', node.sqlScript);
  let result = pg_parser.parse(node.sqlScript);

  if (result.parse_tree.length) {

    if (result.parse_tree[0].CreateFunctionStmt) {

      let stprocBody = result.parse_tree[0].CreateFunctionStmt.options[0].DefElem.arg[0].String.str;
      let embeddedQuery = pg_parser.parse(stprocBody);

      if (embeddedQuery.parse_tree.length) {

        let numberOfColumns = embeddedQuery.parse_tree[0].SelectStmt.targetList.length;
        let numberOfParameters = result.parse_tree[0].CreateFunctionStmt.parameters.length;
        let offset = numberOfParameters - numberOfColumns;
        let outputData = registry.get(dataFlowEdges[nodeId][0]).businessObject;
        var outputCreateStatement = `create table ${outputData.name.replace(/[^\w\s]/gi, '').replace(/[\s]/gi, '_')} (`;

        for (var i = offset; i < numberOfParameters; i++) {

          var param = result.parse_tree[0].CreateFunctionStmt.parameters[i].FunctionParameter;

          if (i > offset) {

            outputCreateStatement += ', ';

          }

          outputCreateStatement += param.name + ' INT';

        }

        outputCreateStatement += ');';

        // console.log(outputData.name)
        let inputCreateStatements = invDataFlowEdges[nodeId].map((inputData:string) => dataDefStatements[inputData]);

        var obj_schema = [];
        for (var i = 0, len = invDataFlowEdges[nodeId].length; i < len; i++) {
          var parseTree = pg_parser.parse(dataDefStatements[invDataFlowEdges[nodeId][i]].replace(/\r?\n|\r/g, ''));
          var tableId = invDataFlowEdges[nodeId][i];
          var script = dataDefStatements[invDataFlowEdges[nodeId][i]].replace(/\r?\n|\r/g, '');
          obj_schema.push({tableId : tableId,  script : script});
        }
        
        var obj_query = stprocBody.replace(/\r?\n|\r/g, '');

        canvas.addMarker(nodeId, 'highlight-input');

        request.post(backend + '/rest/sql-privacy/analyse')
          .send({schema : obj_schema, query : obj_query})
          .end(function(err, res) {

            if (err) {

              if (err.status === 400) {

                errorInModel = true;
                $('#analyserInputError').show();

              } else {

                console.log("Server error!");

              }

            } else {

              errorInModel = false;
              $('#analyserInputError').hide();
              var result = "";
              var matrix = {};

              for (var i=0; i < (res.body.resultSet).length; i++) {

                var resultSensitivity = res.body.resultSet[i].sensitivity >= 0 ? res.body.resultSet[i].sensitivity : Infinity;
                result += "<tr><td>" + registry.get(res.body.resultSet[i].tableId).businessObject.name + "</td><td>" + resultSensitivity + "</td><tr>";
                var inputName = res.body.resultSet[i].tableId;
                var outputName = outputData.id;
                var sensitivity = res.body.resultSet[i].sensitivity;
                matrix[inputName] = {[outputName] : sensitivity};

              }

              outputCreateStatement = outputCreateStatement.replace(/\r?\n|\r/g, '');

              var overlayHtml = $(`
                <div class="code-dialog" id="` + nodeId + `-analysis-results">
                  <div class="panel panel-default">
                    <div class="panel-heading">
                      <h4>Output SQL</h4>
                    </div>
                    <div class="panel-body">
                      <textarea class="hidden-code-input">${outputCreateStatement}</textarea>
                      <div class="code-highlighted">
                        <code class="language-sql"></code>
                      </div>
                    </div>
                    <div class="panel-heading">
                      <h4>Sensitivities</h4>
                    </div>
                    <div class="panel-body">
                      <div class="table-responsive">
                        <table class="table table-hover">
                        <thead>
                          <tr>
                           <th>TableId</th>
                           <th>Sensitivity</th>
                          </tr>
                        </thead
                        <tbody>
                          ${result}
                        </tbody>
                        </div>
                      </table>
                    </div>
                  </div>
                </div>`
              );

              overlaysMap[nodeId] = overlays.add(nodeId, {position:{bottom: 0, right: 0}, html:overlayHtml});
              node.sensitivityMatrix = JSON.stringify(matrix);
              var editor = new Microcode($(overlayHtml).find('.hidden-code-input'), $(overlayHtml).find('.code-highlighted'));

            }

          });

        outputDefStatements[outputData.id] = outputCreateStatement;

      } else {

        overlays.add(nodeId, {position:{bottom: 0, right: 0}, html: `<div class="code-error">${embeddedQuery.error.message}</div>`});
        throw new Error(embeddedQuery.error.message);

      }

    } else {

      overlays.add(nodeId, {position:{bottom: 0, right: 0}, html: `<div class="code-error">Stored procedure not found</div>`});
      throw new Error('Stored procedure not found');

    }

  } else {

    overlays.add(nodeId, {position:{bottom: 0, right: 0}, html: `<div class="code-error">${result.error.message}</div>`});
    throw new Error(result.error.message);

  }

}

export let analizeSQLDFlow = (element: any, registry: any, canvas: any, overlays: any, eventBus: any) => {

  let info = dataFlowAnalysis(element, registry);
  let [processingNodes, dataFlowEdges, invDataFlowEdges, sources] = [info.processingNodes, info.dataFlowEdges, info.invDataFlowEdges, info.sources];
  var dataDefStatements: {[id: string]: string} = {};
  var outputDefStatements: {[id: string]: string} = {};

  for (let source of info.sources) {

    let node = registry.get(source).businessObject;

    if (!node.sqlScript) {

      overlays.add(node.id, {position:{bottom: 0, right: 0}, html: `<div class="code-error">SQL script not found</div>`});
      throw new Error('No "SQLScript" attached to data object collection');

    }

    // console.log('parsing schema definition', node.sqlScript);
    let result = pg_parser.parse(node.sqlScript);

    if (result.parse_tree.length) {

      dataDefStatements[source] = node.sqlScript;

    } else {

      overlays.add(node.id, {position:{bottom: 0, right: 0}, html: `<div class="code-error">${result.error.message}</div>`});
      throw new Error(result.error.message);

    }

  }

  var alreadyProcessed: Array<string> = [];
  var overlaysMap: {[id:string]: any} = {};
  var enabledNodes = processingNodes.filter( (nodeId:string) => alreadyProcessed.indexOf(nodeId) < 0 && invDataFlowEdges[nodeId].every((predId:string) => dataDefStatements[predId]));

  enabledNodes.forEach((nodeId:string) => analyzeProcessingNode(nodeId, dataDefStatements, outputDefStatements, dataFlowEdges, invDataFlowEdges, registry, canvas, overlays, overlaysMap));

  eventBus.on('element.click', function(e:any) {

    if ( is(e.element.businessObject, 'bpmn:Task')) {

      let node = e.element.businessObject;

      if (enabledNodes.indexOf(node.id) >= 0 && !errorInModel) {

        canvas.removeMarker(node.id, 'highlight-input');

        if (overlaysMap[node.id]) {

          overlays.remove(overlaysMap[node.id]);

        }

        alreadyProcessed.push(node.id);
        let outputDataId = dataFlowEdges[node.id][0];
        dataDefStatements[outputDataId] = outputDefStatements[outputDataId];

        if (dataFlowEdges[outputDataId] && dataFlowEdges[outputDataId].length > 0) {

          var newlyEnabledNodes = dataFlowEdges[outputDataId].filter( (nodeId:string) => invDataFlowEdges[nodeId].every((predId:string) => dataDefStatements[predId]));
          newlyEnabledNodes.forEach((nodeId:string) => analyzeProcessingNode(nodeId, dataDefStatements, outputDefStatements, dataFlowEdges, invDataFlowEdges, registry, canvas, overlays, overlaysMap));
          enabledNodes = enabledNodes.concat(newlyEnabledNodes);

        }

        enabledNodes.splice(enabledNodes.indexOf(node.id), 1);

        if (enabledNodes.length == 0) {

          let [dc, sources, targets] = computeGraMSecMatrices(element, registry);

          if (!$.isEmptyObject(dc)) {
            
            $('#resultsModal').find('.modal-body').html(tableBuilder({dc: dc, sources: sources, targets: targets, name: (nid:string) => {
              var name = registry.get(nid).businessObject.name; var shortName = name.match(/\(([^\)]+)\)/);
              return shortName? shortName[1] : name;}}
            ));
            $('#resultsModal').modal();

            overlays.remove({element: e.element});

          }

        }

      }

    }

  });

}
